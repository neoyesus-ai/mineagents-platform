import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BuilderAgent,
  BuilderError,
  BuilderExecutionError,
} from "../agents/builder/dist/index.js";

const region = {
  dimension: "minecraft:overworld",
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10, y: 100, z: 10 },
};

const position = (x) => ({ dimension: "minecraft:overworld", x, y: 64, z: 1 });
const key = ({ dimension, x, y, z }) => `${dimension}:${x}:${y}:${z}`;

const authorization = (overrides = {}) => ({
  id: "approval-builder-1",
  taskId: "task-builder-1",
  allowedActions: ["place-block"],
  allowedRegion: {
    dimension: region.dimension,
    min: { ...region.min },
    max: { ...region.max },
  },
  expiresAt: "2026-08-06T13:00:00.000Z",
  maxActions: 4,
  ...overrides,
});

const createHarness = ({ blocks = new Map(), onPlace } = {}) => {
  const calls = [];
  const minecraft = {
    async getState() {
      return { connected: true, position: position(0) };
    },
    async inspectBlock(target) {
      calls.push({ operation: "inspect", position: { ...target } });
      const name = blocks.get(key(target)) ?? "minecraft:air";
      return { position: { ...target }, name, solid: name !== "minecraft:air" };
    },
    async moveTo() {},
    async breakBlock() {},
    async placeBlock(target, blockName, approved) {
      calls.push({
        operation: "place",
        position: { ...target },
        blockName,
        authorizationId: approved?.id,
      });
      await onPlace?.(target, calls);
    },
  };

  return {
    agent: new BuilderAgent({
      minecraft,
      limits: { maxPlacementsPerTask: 6 },
    }),
    calls,
  };
};

const placement = (x, blockName = "minecraft:cobblestone") => ({
  position: position(x),
  blockName,
});

const request = (overrides = {}) => ({
  taskId: "task-builder-1",
  placements: [placement(1), placement(2)],
  authorization: authorization(),
  ...overrides,
});

test("builder is idempotent and deduplicates identical placements", async () => {
  const blocks = new Map([[key(position(2)), "minecraft:cobblestone"]]);
  const { agent, calls } = createHarness({ blocks });

  const result = await agent.build(
    request({ placements: [placement(1), placement(2), placement(1)] }),
  );

  assert.deepEqual(result, {
    taskId: "task-builder-1",
    status: "completed",
    requestedPlacements: 2,
    inspectedPositions: 2,
    alreadySatisfied: 1,
    blockedPlacements: [],
    placedBlocks: 1,
    placedPositions: [position(1)],
  });
  assert.deepEqual(calls.map(({ operation }) => operation), ["inspect", "inspect", "place"]);
  assert.equal(calls.at(-1).authorizationId, "approval-builder-1");
});

test("builder performs no writes on blocked preflight unless partial work is explicit", async () => {
  const blocks = new Map([[key(position(2)), "minecraft:dirt"]]);
  const strictHarness = createHarness({ blocks });

  const blocked = await strictHarness.agent.build(request());
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.placedBlocks, 0);
  assert.equal(blocked.blockedPlacements[0].existingBlockName, "minecraft:dirt");
  assert.equal(strictHarness.calls.some(({ operation }) => operation === "place"), false);

  const partialHarness = createHarness({ blocks });
  const partial = await partialHarness.agent.build(request({ allowPartial: true }));
  assert.equal(partial.status, "partial");
  assert.equal(partial.placedBlocks, 1);
  assert.deepEqual(partial.placedPositions, [position(1)]);
});

test("builder rejects conflicts, wrong tasks, quota and out-of-scope targets before inspection", async () => {
  const { agent, calls } = createHarness();

  await assert.rejects(
    agent.build(request({ authorization: authorization({ taskId: "another-task" }) })),
    (error) => error instanceof BuilderError && error.code === "TASK_AUTHORIZATION_MISMATCH",
  );
  await assert.rejects(
    agent.build(request({ authorization: authorization({ maxActions: 1 }) })),
    (error) => error instanceof BuilderError && error.code === "AUTHORIZATION_SCOPE_MISMATCH",
  );
  await assert.rejects(
    agent.build(request({ placements: [placement(1), placement(1, "minecraft:oak_planks")] })),
    (error) => error instanceof BuilderError && error.code === "INVALID_REQUEST",
  );
  await assert.rejects(
    agent.build(request({ placements: [placement(20)] })),
    (error) => error instanceof BuilderError && error.code === "AUTHORIZATION_SCOPE_MISMATCH",
  );
  assert.equal(calls.length, 0);
});

test("builder cancellation preserves completed placements", async () => {
  const controller = new globalThis.AbortController();
  const { agent, calls } = createHarness({
    onPlace: async () => controller.abort(),
  });

  const result = await agent.build(request(), { signal: controller.signal });
  assert.equal(result.status, "cancelled");
  assert.equal(result.placedBlocks, 1);
  assert.deepEqual(result.placedPositions, [position(1)]);
  assert.equal(calls.filter(({ operation }) => operation === "place").length, 1);
});

test("builder failures expose a partial result for safe retries", async () => {
  let placements = 0;
  const { agent } = createHarness({
    onPlace: async () => {
      placements += 1;
      if (placements === 2) {
        throw new Error("simulated placement failure");
      }
    },
  });

  await assert.rejects(agent.build(request()), (error) => {
    assert.equal(error instanceof BuilderExecutionError, true);
    assert.equal(error.code, "ADAPTER_OPERATION_FAILED");
    assert.equal(error.result.status, "failed");
    assert.equal(error.result.placedBlocks, 1);
    assert.deepEqual(error.result.placedPositions, [position(1)]);
    return true;
  });
});
