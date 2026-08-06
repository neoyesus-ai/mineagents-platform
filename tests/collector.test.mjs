import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CollectorAgent,
  CollectorError,
  CollectorExecutionError,
} from "../agents/collector/dist/index.js";

const region = {
  dimension: "minecraft:overworld",
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10, y: 100, z: 10 },
};

const position = (x) => ({
  dimension: "minecraft:overworld",
  x,
  y: 64,
  z: 1,
});

const key = ({ dimension, x, y, z }) => `${dimension}:${x}:${y}:${z}`;

const authorization = (overrides = {}) => ({
  id: "approval-collector-1",
  taskId: "task-collector-1",
  allowedActions: ["break-block"],
  allowedRegion: {
    dimension: region.dimension,
    min: { ...region.min },
    max: { ...region.max },
  },
  expiresAt: "2026-08-06T13:00:00.000Z",
  maxActions: 4,
  ...overrides,
});

const createHarness = ({ blocks = new Map(), onBreak, onInspect } = {}) => {
  const calls = [];
  const minecraft = {
    async getState() {
      return { connected: true, position: position(0) };
    },
    async inspectBlock(target) {
      calls.push({ operation: "inspect", position: { ...target } });
      await onInspect?.(target, calls);
      return {
        position: { ...target },
        name: blocks.get(key(target)) ?? "minecraft:air",
        solid: blocks.has(key(target)),
      };
    },
    async moveTo() {},
    async placeBlock() {},
    async breakBlock(target, expectedBlockName, approved) {
      calls.push({
        operation: "break",
        position: { ...target },
        expectedBlockName,
        authorizationId: approved?.id,
      });
      await onBreak?.(target, calls);
    },
  };

  return {
    agent: new CollectorAgent({
      minecraft,
      limits: { maxBlocksPerTask: 4, maxCandidatesPerTask: 8 },
    }),
    calls,
  };
};

const request = (overrides = {}) => ({
  taskId: "task-collector-1",
  blockName: "minecraft:oak_log",
  quantity: 2,
  candidates: [position(1), position(2), position(3)],
  authorization: authorization(),
  ...overrides,
});

test("collector inspects unique candidates before breaking exact matches", async () => {
  const blocks = new Map([
    [key(position(1)), "minecraft:oak_log"],
    [key(position(2)), "minecraft:dirt"],
    [key(position(3)), "minecraft:oak_log"],
  ]);
  const { agent, calls } = createHarness({ blocks });

  const result = await agent.collectBlocks(
    request({ candidates: [position(1), position(2), position(1), position(3)] }),
  );

  assert.deepEqual(result, {
    taskId: "task-collector-1",
    blockName: "minecraft:oak_log",
    status: "completed",
    requestedBlocks: 2,
    inspectedPositions: 3,
    matchingBlocks: 2,
    brokenBlocks: 2,
    brokenPositions: [position(1), position(3)],
  });
  assert.deepEqual(calls.map(({ operation }) => operation), [
    "inspect",
    "inspect",
    "inspect",
    "break",
    "break",
  ]);
  assert.equal(calls.at(-1).expectedBlockName, "minecraft:oak_log");
  assert.equal(calls.at(-1).authorizationId, "approval-collector-1");
});

test("collector avoids writes on shortage unless partial work is explicit", async () => {
  const blocks = new Map([[key(position(1)), "minecraft:oak_log"]]);
  const strictHarness = createHarness({ blocks });

  const insufficient = await strictHarness.agent.collectBlocks(request());
  assert.equal(insufficient.status, "insufficient-resources");
  assert.equal(insufficient.matchingBlocks, 1);
  assert.equal(insufficient.brokenBlocks, 0);
  assert.equal(strictHarness.calls.some(({ operation }) => operation === "break"), false);

  const partialHarness = createHarness({ blocks });
  const partial = await partialHarness.agent.collectBlocks(
    request({ allowPartial: true }),
  );
  assert.equal(partial.status, "partial");
  assert.equal(partial.brokenBlocks, 1);
});

test("collector validates task, quota and candidate scope before inspection", async () => {
  const { agent, calls } = createHarness();

  await assert.rejects(
    agent.collectBlocks(request({ authorization: authorization({ taskId: "another-task" }) })),
    (error) =>
      error instanceof CollectorError && error.code === "TASK_AUTHORIZATION_MISMATCH",
  );
  await assert.rejects(
    agent.collectBlocks(request({ authorization: authorization({ maxActions: 1 }) })),
    (error) =>
      error instanceof CollectorError && error.code === "AUTHORIZATION_SCOPE_MISMATCH",
  );
  await assert.rejects(
    agent.collectBlocks(
      request({
        candidates: [
          { dimension: "minecraft:overworld", x: 20, y: 64, z: 1 },
        ],
      }),
    ),
    (error) =>
      error instanceof CollectorError && error.code === "AUTHORIZATION_SCOPE_MISMATCH",
  );
  assert.equal(calls.length, 0);
});

test("collector cancellation preserves completed block operations", async () => {
  const controller = new globalThis.AbortController();
  const blocks = new Map([
    [key(position(1)), "minecraft:oak_log"],
    [key(position(2)), "minecraft:oak_log"],
  ]);
  const { agent, calls } = createHarness({
    blocks,
    onBreak: async () => controller.abort(),
  });

  const result = await agent.collectBlocks(
    request({ candidates: [position(1), position(2)] }),
    { signal: controller.signal },
  );

  assert.equal(result.status, "cancelled");
  assert.equal(result.brokenBlocks, 1);
  assert.deepEqual(result.brokenPositions, [position(1)]);
  assert.equal(calls.filter(({ operation }) => operation === "break").length, 1);
});

test("collector failures expose a partial result for safe retries", async () => {
  const blocks = new Map([
    [key(position(1)), "minecraft:oak_log"],
    [key(position(2)), "minecraft:oak_log"],
  ]);
  let breaks = 0;
  const { agent } = createHarness({
    blocks,
    onBreak: async () => {
      breaks += 1;
      if (breaks === 2) {
        throw new Error("simulated stale block");
      }
    },
  });

  await assert.rejects(
    agent.collectBlocks(request({ candidates: [position(1), position(2)] })),
    (error) => {
      assert.equal(error instanceof CollectorExecutionError, true);
      assert.equal(error.code, "ADAPTER_OPERATION_FAILED");
      assert.equal(error.result.status, "failed");
      assert.equal(error.result.brokenBlocks, 1);
      assert.deepEqual(error.result.brokenPositions, [position(1)]);
      return true;
    },
  );
});
