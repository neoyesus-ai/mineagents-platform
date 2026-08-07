import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  MineflayerDriver,
  MineflayerDriverError,
  connectMineflayerDriver,
  parseMineflayerObserverConfig,
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
    hasDriverCode("UNSUPPORTED_OPERATION"),
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
    },
  );

  const driver = await connection;
  assert.equal(receivedOptions.auth, "offline");
  assert.equal(receivedOptions.host, "minecraft");
  assert.equal(receivedOptions.version, "1.21.11");
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
