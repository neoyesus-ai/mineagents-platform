import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MinecraftSafetyError,
  SafeMinecraftAdapter,
  createReadOnlyMinecraftPolicy,
} from "../minecraft-adapter/dist/index.js";

const allowedRegion = {
  dimension: "minecraft:overworld",
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10, y: 100, z: 10 },
};

const fixedNow = new Date("2026-08-06T12:00:00.000Z");

const createHarness = ({ policy, verify = async () => true } = {}) => {
  const calls = [];
  const driver = {
    async getState() {
      return {
        connected: true,
        position: { dimension: "minecraft:overworld", x: 1, y: 64, z: 1 },
      };
    },
    async inspectBlock(position) {
      calls.push({ operation: "inspect", position });
      return { position, name: "minecraft:stone", solid: true };
    },
    async moveTo(target, allowedRegions) {
      calls.push({ operation: "move", target, allowedRegions });
    },
    async placeBlock(position, blockName, expectedCurrentBlockNames) {
      calls.push({ operation: "place", position, blockName, expectedCurrentBlockNames });
    },
    async breakBlock(position, expectedBlockName) {
      calls.push({ operation: "break", position, expectedBlockName });
    },
  };

  const adapter = new SafeMinecraftAdapter({
    driver,
    policy:
      policy ??
      {
        allowedRegions: [allowedRegion],
        allowMovement: true,
        allowedPlaceBlocks: ["minecraft:cobblestone"],
        allowedBreakBlocks: [],
        maxActionsPerAuthorization: 2,
      },
    authorizationVerifier: { verify },
    now: () => fixedNow,
  });

  return { adapter, calls };
};

const validAuthorization = (overrides = {}) => ({
  id: "approval-1",
  taskId: "task-1",
  allowedActions: ["place-block"],
  allowedRegion: {
    dimension: allowedRegion.dimension,
    min: { ...allowedRegion.min },
    max: { ...allowedRegion.max },
  },
  expiresAt: "2026-08-06T12:05:00.000Z",
  maxActions: 1,
  ...overrides,
});

const hasSafetyCode = (code) =>
  (error) => error instanceof MinecraftSafetyError && error.code === code;

test("read-only policy fails closed for movement and world writes", async () => {
  const policy = createReadOnlyMinecraftPolicy([allowedRegion]);
  const { adapter, calls } = createHarness({ policy });

  const block = await adapter.inspectBlock({
    dimension: "minecraft:overworld",
    x: 2,
    y: 64,
    z: 2,
  });
  assert.equal(block.name, "minecraft:stone");

  await assert.rejects(
    adapter.moveTo({ dimension: "minecraft:overworld", x: 3, y: 64, z: 3 }),
    hasSafetyCode("MOVEMENT_DISABLED"),
  );
  await assert.rejects(
    adapter.placeBlock(
      { dimension: "minecraft:overworld", x: 3, y: 64, z: 3 },
      "minecraft:cobblestone",
      validAuthorization(),
    ),
    hasSafetyCode("ACTION_NOT_ALLOWED"),
  );

  assert.deepEqual(calls.map(({ operation }) => operation), ["inspect"]);
});

test("inspection and movement stay inside configured regions", async () => {
  const { adapter, calls } = createHarness();
  const target = { dimension: "minecraft:overworld", x: 5, y: 64, z: 5 };

  await adapter.moveTo(target);
  assert.equal(calls[0].operation, "move");
  assert.deepEqual(calls[0].allowedRegions, [allowedRegion]);

  await assert.rejects(
    adapter.inspectBlock({ dimension: "minecraft:overworld", x: 11, y: 64, z: 5 }),
    hasSafetyCode("OUTSIDE_ALLOWED_REGION"),
  );
  await assert.rejects(
    adapter.moveTo({ dimension: "minecraft:the_nether", x: 5, y: 64, z: 5 }),
    hasSafetyCode("OUTSIDE_ALLOWED_REGION"),
  );
});

test("world writes require policy allowance and external approval", async () => {
  const verifiedRequests = [];
  const { adapter, calls } = createHarness({
    verify: async (authorization, request) => {
      verifiedRequests.push({ authorization, request });
      return true;
    },
  });
  const position = { dimension: "minecraft:overworld", x: 4, y: 64, z: 4 };

  await assert.rejects(
    adapter.placeBlock(position, "minecraft:cobblestone"),
    hasSafetyCode("APPROVAL_REQUIRED"),
  );
  await assert.rejects(
    adapter.placeBlock(position, "minecraft:diamond_block", validAuthorization()),
    hasSafetyCode("BLOCK_NOT_ALLOWED"),
  );
  await assert.rejects(
    adapter.breakBlock(position, "minecraft:stone", validAuthorization()),
    hasSafetyCode("ACTION_NOT_ALLOWED"),
  );

  const authorization = validAuthorization();
  await adapter.placeBlock(position, "minecraft:cobblestone", authorization);
  assert.equal(verifiedRequests.length, 1);
  assert.deepEqual(verifiedRequests[0].request, {
    action: "place-block",
    position,
    blockName: "minecraft:cobblestone",
  });
  assert.deepEqual(calls.at(-1), {
    operation: "place",
    position,
    blockName: "minecraft:cobblestone",
    expectedCurrentBlockNames: [
      "minecraft:air",
      "minecraft:cave_air",
      "minecraft:void_air",
    ],
  });

  await assert.rejects(
    adapter.placeBlock(position, "minecraft:cobblestone", authorization),
    hasSafetyCode("APPROVAL_LIMIT_EXCEEDED"),
  );
  assert.equal(calls.filter(({ operation }) => operation === "place").length, 1);
});

test("async verification cannot mutate the validated driver request", async () => {
  let callerPosition;
  let callerAuthorization;
  const { adapter, calls } = createHarness({
    verify: async (authorizationCopy, requestCopy) => {
      callerPosition.x = 100;
      callerAuthorization.allowedRegion.max.x = 100;
      authorizationCopy.id = "mutated-approval";
      requestCopy.position.x = 9;
      requestCopy.blockName = "minecraft:diamond_block";
      return true;
    },
  });

  callerPosition = { dimension: "minecraft:overworld", x: 4, y: 64, z: 4 };
  callerAuthorization = validAuthorization();
  await adapter.placeBlock(
    callerPosition,
    "minecraft:cobblestone",
    callerAuthorization,
  );

  assert.deepEqual(calls, [
    {
      operation: "place",
      position: { dimension: "minecraft:overworld", x: 4, y: 64, z: 4 },
      blockName: "minecraft:cobblestone",
      expectedCurrentBlockNames: [
        "minecraft:air",
        "minecraft:cave_air",
        "minecraft:void_air",
      ],
    },
  ]);
});

test("expired, oversized, out-of-scope and rejected approvals fail closed", async () => {
  const position = { dimension: "minecraft:overworld", x: 4, y: 64, z: 4 };
  const { adapter } = createHarness();

  await assert.rejects(
    adapter.placeBlock(
      position,
      "minecraft:cobblestone",
      validAuthorization({ expiresAt: "2026-08-06T11:59:59.000Z" }),
    ),
    hasSafetyCode("APPROVAL_EXPIRED"),
  );
  await assert.rejects(
    adapter.placeBlock(
      position,
      "minecraft:cobblestone",
      validAuthorization({ maxActions: 3 }),
    ),
    hasSafetyCode("APPROVAL_SCOPE_MISMATCH"),
  );
  await assert.rejects(
    adapter.placeBlock(
      position,
      "minecraft:cobblestone",
      validAuthorization({
        allowedRegion: {
          dimension: "minecraft:overworld",
          min: { x: 4, y: 64, z: 4 },
          max: { x: 20, y: 64, z: 4 },
        },
      }),
    ),
    hasSafetyCode("APPROVAL_SCOPE_MISMATCH"),
  );

  const rejectedHarness = createHarness({ verify: async () => false });
  await assert.rejects(
    rejectedHarness.adapter.placeBlock(
      position,
      "minecraft:cobblestone",
      validAuthorization(),
    ),
    hasSafetyCode("APPROVAL_REJECTED"),
  );
  assert.equal(rejectedHarness.calls.length, 0);
});
