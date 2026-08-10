import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentSmokeApprovalPhrase,
  MineflayerDriverError,
  parseAgentSmokeConfig,
  runSupervisedAgentSmoke,
} from "../minecraft-driver-mineflayer/dist/index.js";

const target = {
  dimension: "minecraft:overworld",
  x: 4,
  y: 63,
  z: -2,
};

const createDriver = ({ inventory = true, failFirstPlacement = false } = {}) => {
  let blockName = "minecraft:dirt";
  let placementAttempts = 0;
  const driver = {
    hasInventoryItem(requestedBlockName) {
      return inventory && requestedBlockName === "minecraft:dirt";
    },
    async getState() {
      return { connected: true, position: { ...target, y: target.y + 1 } };
    },
    async inspectBlock(position) {
      return { position: { ...position }, name: blockName, solid: blockName !== "minecraft:air" };
    },
    async moveTo() {
      throw new Error("movement must remain disabled");
    },
    async breakBlock(position, expectedBlockName) {
      assert.deepEqual(position, target);
      assert.equal(expectedBlockName, blockName);
      blockName = "minecraft:air";
    },
    async placeBlock(position, requestedBlockName, expectedCurrentBlockNames) {
      placementAttempts += 1;
      assert.deepEqual(position, target);
      assert.equal(requestedBlockName, "minecraft:dirt");
      assert.equal(expectedCurrentBlockNames.includes(blockName), true);
      if (failFirstPlacement && placementAttempts === 1) {
        throw new Error("simulated transient placement failure");
      }
      blockName = requestedBlockName;
    },
  };
  return {
    driver,
    currentBlock: () => blockName,
    placementAttempts: () => placementAttempts,
  };
};

test("agent smoke config requires an explicit phrase and exact target", () => {
  assert.throws(
    () => parseAgentSmokeConfig({}),
    (error) => error instanceof MineflayerDriverError && error.code === "INVALID_CONFIG",
  );

  const config = parseAgentSmokeConfig({
    MINECRAFT_AGENT_SMOKE_APPROVAL: agentSmokeApprovalPhrase,
    MINECRAFT_AGENT_SMOKE_TARGET: "4,63,-2",
    MINECRAFT_AGENT_SMOKE_BLOCK: "minecraft:dirt",
    MINECRAFT_PORT: "25665",
    MINECRAFT_USERNAME: "MineAgentSmoke",
  });

  assert.equal(config.approved, true);
  assert.deepEqual(config.target, target);
  assert.equal(config.blockName, "minecraft:dirt");
  assert.equal(config.connection.port, 25665);
});

test("collector and builder round-trip one preapproved block", async () => {
  const world = createDriver();
  const result = await runSupervisedAgentSmoke(world.driver, {
    target,
    blockName: "minecraft:dirt",
    approved: true,
    now: () => new Date("2026-08-07T00:00:00.000Z"),
  });

  assert.equal(result.collector.status, "completed");
  assert.equal(result.collector.brokenBlocks, 1);
  assert.equal(result.builder.status, "completed");
  assert.equal(result.builder.placedBlocks, 1);
  assert.equal(result.builderAttempts, 1);
  assert.equal(result.restored, true);
  assert.equal(world.currentBlock(), "minecraft:dirt");
});

test("agent smoke performs no write without a replacement item", async () => {
  const world = createDriver({ inventory: false });

  await assert.rejects(
    runSupervisedAgentSmoke(world.driver, {
      target,
      blockName: "minecraft:dirt",
      approved: true,
    }),
    (error) => error instanceof MineflayerDriverError && error.code === "ITEM_NOT_AVAILABLE",
  );
  assert.equal(world.currentBlock(), "minecraft:dirt");
  assert.equal(world.placementAttempts(), 0);
});

test("agent smoke retries one idempotent builder placement with separate approval", async () => {
  const world = createDriver({ failFirstPlacement: true });

  const result = await runSupervisedAgentSmoke(world.driver, {
    target,
    blockName: "minecraft:dirt",
    approved: true,
  });

  assert.equal(result.builder.status, "completed");
  assert.equal(result.builder.placedBlocks, 1);
  assert.equal(result.builderAttempts, 2);
  assert.equal(world.placementAttempts(), 2);
  assert.equal(world.currentBlock(), "minecraft:dirt");
});
