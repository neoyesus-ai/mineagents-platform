import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  BoundedMovementController,
  MineflayerDriver,
  MineflayerDriverError,
  connectMineflayerDriver,
  parseMineflayerObserverConfig,
  runBoundedMovementSmoke,
  sendCoordinatorHeartbeat,
} from "../minecraft-driver-mineflayer/dist/index.js";

const hasDriverCode = (code) =>
  (error) => error instanceof MineflayerDriverError && error.code === code;

const createFakeBot = () => {
  const bot = new EventEmitter();
  bot.game = { dimension: "overworld" };
  bot.entity = { position: { x: 1.8, y: 64.9, z: -2.2 } };
  bot.blockAt = (position) => ({
    name: "stone",
    boundingBox: "block",
    position,
  });
  bot.waitForChunksToLoad = async () => undefined;
  bot.pathfinder = {
    setMovements(movements) {
      bot.activeMovements = movements;
    },
    async goto(goal) {
      bot.entity.position = { x: goal.x, y: goal.y, z: goal.z };
    },
    stop() {
      bot.stopCount = (bot.stopCount ?? 0) + 1;
    },
  };
  bot.loadPlugin = (plugin) => plugin(bot);
  bot.quit = (reason) => bot.emit("end", reason);
  bot.end = (reason) => bot.emit("end", reason);
  return bot;
};

test("read-only Mineflayer driver exposes normalized state and block snapshots", async () => {
  const bot = createFakeBot();
  const driver = new MineflayerDriver(bot);

  assert.deepEqual(await driver.getState(), {
    connected: true,
    position: {
      dimension: "minecraft:overworld",
      x: 1,
      y: 64,
      z: -3,
    },
  });

  const position = {
    dimension: "minecraft:overworld",
    x: 2,
    y: 64,
    z: 3,
  };
  assert.deepEqual(await driver.inspectBlock(position), {
    position,
    name: "minecraft:stone",
    solid: true,
  });

  await assert.rejects(
    driver.inspectBlock({ ...position, dimension: "minecraft:the_nether" }),
    hasDriverCode("DIMENSION_MISMATCH"),
  );
});

test("read-only Mineflayer driver fails closed for unloaded chunks and writes", async () => {
  const bot = createFakeBot();
  bot.blockAt = () => null;
  const driver = new MineflayerDriver(bot);
  const position = {
    dimension: "minecraft:overworld",
    x: 200,
    y: 64,
    z: 200,
  };

  await assert.rejects(
    driver.inspectBlock(position),
    hasDriverCode("CHUNK_NOT_LOADED"),
  );
  await assert.rejects(
    driver.moveTo(position, []),
    hasDriverCode("INVALID_MOVEMENT_SCOPE"),
  );
  await assert.rejects(
    driver.placeBlock(position, "minecraft:stone", ["minecraft:air"]),
    hasDriverCode("UNSUPPORTED_OPERATION"),
  );
  await assert.rejects(
    driver.breakBlock(position, "minecraft:stone"),
    hasDriverCode("UNSUPPORTED_OPERATION"),
  );

  driver.close("test shutdown");
  assert.equal(await driver.waitForDisconnect(), "test shutdown");
  assert.equal((await driver.getState()).connected, false);
});

const createMovementHarness = (bot) => {
  const movements = {
    exclusionAreasStep: [],
    exclusionAreasBreak: [],
    exclusionAreasPlace: [],
  };
  const dependencies = {
    createMovements: () => movements,
    createGoal: (target) => ({ ...target }),
  };
  return { controller: new BoundedMovementController(bot, 1_000, dependencies), movements };
};

test("bounded movement disables world changes and constrains every path step", async () => {
  const bot = createFakeBot();
  const { controller, movements } = createMovementHarness(bot);
  const target = {
    dimension: "minecraft:overworld",
    x: 2,
    y: 64,
    z: -2,
  };
  const region = {
    dimension: "minecraft:overworld",
    min: { x: 0, y: 64, z: -4 },
    max: { x: 2, y: 64, z: -2 },
  };

  await controller.moveTo(target, [region]);

  assert.equal(movements.canDig, false);
  assert.equal(movements.canOpenDoors, false);
  assert.equal(movements.allow1by1towers, false);
  assert.equal(movements.allowParkour, false);
  assert.equal(movements.allowSprinting, false);
  assert.deepEqual(movements.scafoldingBlocks, []);
  assert.equal(
    movements.exclusionAreasStep[0]({ position: { x: 2, y: 64, z: -2 } }),
    0,
  );
  assert.equal(
    movements.exclusionAreasStep[0]({ position: { x: 2, y: 65, z: -2 } }),
    100,
  );
  assert.equal(
    movements.exclusionAreasStep[0]({ position: { x: 3, y: 64, z: -2 } }),
    100,
  );
  assert.equal(movements.exclusionAreasBreak[0](), 100);
  assert.equal(movements.exclusionAreasPlace[0](), 100);
});

test("bounded movement rejects invalid, cross-dimension and out-of-scope requests", async () => {
  const bot = createFakeBot();
  const { controller } = createMovementHarness(bot);
  const region = {
    dimension: "minecraft:overworld",
    min: { x: 0, y: 60, z: -5 },
    max: { x: 5, y: 70, z: 0 },
  };

  await assert.rejects(
    controller.moveTo({ dimension: "minecraft:overworld", x: 2, y: 64, z: -2 }, []),
    hasDriverCode("INVALID_MOVEMENT_SCOPE"),
  );
  await assert.rejects(
    controller.moveTo(
      { dimension: "minecraft:the_nether", x: 2, y: 64, z: -2 },
      [region],
    ),
    hasDriverCode("DIMENSION_MISMATCH"),
  );
  await assert.rejects(
    controller.moveTo(
      { dimension: "minecraft:overworld", x: 6, y: 64, z: -2 },
      [region],
    ),
    hasDriverCode("OUTSIDE_ALLOWED_REGION"),
  );
});

test("bounded movement rejects concurrent requests and stops on timeout", async () => {
  const bot = createFakeBot();
  let finishMovement;
  bot.pathfinder.goto = (goal) =>
    new Promise((resolve) => {
      finishMovement = () => {
        bot.entity.position = { x: goal.x, y: goal.y, z: goal.z };
        resolve();
      };
    });
  const { controller } = createMovementHarness(bot);
  const target = { dimension: "minecraft:overworld", x: 2, y: 64, z: -2 };
  const region = {
    dimension: "minecraft:overworld",
    min: { x: 0, y: 60, z: -5 },
    max: { x: 5, y: 70, z: 0 },
  };

  const movement = controller.moveTo(target, [region]);
  await assert.rejects(
    controller.moveTo(target, [region]),
    hasDriverCode("MOVEMENT_IN_PROGRESS"),
  );
  finishMovement();
  await movement;

  const timeoutBot = createFakeBot();
  timeoutBot.pathfinder.goto = () => new Promise(() => undefined);
  const timeoutController = new BoundedMovementController(timeoutBot, 5, {
    createMovements: () => ({
      exclusionAreasStep: [],
      exclusionAreasBreak: [],
      exclusionAreasPlace: [],
    }),
    createGoal: (value) => ({ ...value }),
  });
  await assert.rejects(
    timeoutController.moveTo(target, [region]),
    hasDriverCode("MOVEMENT_FAILED"),
  );
  assert.ok(timeoutBot.stopCount >= 1);

  const setupBot = createFakeBot();
  let failSetup = true;
  setupBot.pathfinder.setMovements = () => {
    if (failSetup) {
      failSetup = false;
      throw new Error("setup failed");
    }
  };
  const { controller: setupController } = createMovementHarness(setupBot);
  await assert.rejects(
    setupController.moveTo(target, [region]),
    hasDriverCode("MOVEMENT_FAILED"),
  );
  await setupController.moveTo(target, [region]);
});

test("movement smoke discovers a walkable target, moves and returns without writes", async () => {
  const origin = {
    dimension: "minecraft:overworld",
    x: 0,
    y: 65,
    z: 0,
  };
  let current = { ...origin };
  const movements = [];
  const driver = {
    async getState() {
      return { connected: true, position: { ...current } };
    },
    async inspectBlock(position) {
      const solid = position.y === 64;
      return {
        position: { ...position },
        name: solid ? "minecraft:stone" : "minecraft:air",
        solid,
      };
    },
    async moveTo(target, allowedRegions) {
      assert.equal(allowedRegions.length, 1);
      movements.push({ ...target });
      current = { ...target };
    },
    async placeBlock() {
      throw new Error("unexpected write");
    },
    async breakBlock() {
      throw new Error("unexpected write");
    },
  };

  const result = await runBoundedMovementSmoke(driver, { searchRadius: 1 });

  assert.deepEqual(result.origin, origin);
  assert.deepEqual(result.target, {
    dimension: "minecraft:overworld",
    x: -1,
    y: 65,
    z: -1,
  });
  assert.equal(result.blocksUnchanged, true);
  assert.equal(result.attempts, 1);
  assert.deepEqual(movements, [result.target, origin]);
});

test("Mineflayer connection uses explicit offline identity and waits for chunks", async () => {
  const bot = createFakeBot();
  let receivedOptions;

  const connection = connectMineflayerDriver(
    {
      host: "minecraft",
      port: 25565,
      username: "MineObserver",
      version: "1.21.11",
      connectTimeoutMs: 1_000,
      chunksTimeoutMs: 1_000,
    },
    {
      createBot(options) {
        receivedOptions = options;
        void Promise.resolve().then(() => bot.emit("spawn"));
        return bot;
      },
      pathfinderPlugin() {},
    },
  );

  const driver = await connection;
  assert.equal(receivedOptions.auth, "offline");
  assert.equal(receivedOptions.host, "minecraft");
  assert.equal(receivedOptions.version, "1.21.11");
  assert.ok(bot.pathfinder);
  driver.close();
});

test("observer configuration rejects unsafe coordinator URLs and invalid ports", () => {
  assert.throws(
    () =>
      parseMineflayerObserverConfig({
        MINECRAFT_PORT: "0",
      }),
    hasDriverCode("INVALID_CONFIG"),
  );
  assert.throws(
    () =>
      parseMineflayerObserverConfig({
        COORDINATOR_URL: "https://user:secret@example.test/path",
      }),
    hasDriverCode("INVALID_CONFIG"),
  );

  const config = parseMineflayerObserverConfig({
    MINECRAFT_HOST: "minecraft",
    MINECRAFT_PORT: "25565",
    MINECRAFT_VERSION: "1.21.11",
  });
  assert.equal(config.host, "minecraft");
  assert.equal(config.port, 25565);
  assert.equal(config.version, "1.21.11");
  assert.equal(config.movementTimeoutMs, 30_000);
});

test("coordinator heartbeat uses the bounded agent endpoint", async () => {
  let request;
  await sendCoordinatorHeartbeat(
    "http://coordinator:3000",
    { id: "mineflayer-observer", name: "MineObserver", role: "observer" },
    async (url, init) => {
      request = { url: String(url), init };
      return { ok: true, status: 200 };
    },
  );

  assert.equal(request.url, "http://coordinator:3000/agents/heartbeat");
  assert.equal(request.init.method, "POST");
  assert.deepEqual(JSON.parse(request.init.body), {
    id: "mineflayer-observer",
    name: "MineObserver",
    role: "observer",
  });
});
