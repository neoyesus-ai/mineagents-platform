import assert from "node:assert/strict";
import { test } from "node:test";
import { BuilderAgent } from "../agents/builder/dist/index.js";
import {
  BlueprintError,
  compileBlueprint,
  parseBlueprint,
} from "../blueprints/dist/index.js";

const blueprint = (overrides = {}) => ({
  schemaVersion: 1,
  id: "starter/shelter",
  size: { width: 3, height: 2, depth: 4 },
  palette: {
    stone: "minecraft:cobblestone",
    wood: "minecraft:oak_planks",
  },
  blocks: [
    { position: { x: 0, y: 0, z: 0 }, material: "stone" },
    { position: { x: 2, y: 1, z: 3 }, material: "wood" },
  ],
  ...overrides,
});

const expectBlueprintError = (code, path) => (error) => {
  assert.equal(error instanceof BlueprintError, true);
  assert.equal(error.code, code);
  if (path !== undefined) {
    assert.equal(error.path, path);
  }
  return true;
};

test("blueprint v1 is normalized without retaining caller-owned objects", () => {
  const input = blueprint();
  const parsed = parseBlueprint(input);

  input.size.width = 1;
  input.palette.stone = "minecraft:diamond_block";
  input.blocks[0].position.x = 1;

  assert.deepEqual(parsed, blueprint());
  assert.notEqual(parsed.size, input.size);
  assert.notEqual(parsed.blocks[0].position, input.blocks[0].position);
});

test("compiler translates relative blocks in document order and calculates least-privilege bounds", () => {
  const compiled = compileBlueprint(blueprint(), {
    dimension: "minecraft:overworld",
    x: 10,
    y: 64,
    z: -5,
  });

  assert.deepEqual(compiled, {
    blueprintId: "starter/shelter",
    placements: [
      {
        position: { dimension: "minecraft:overworld", x: 10, y: 64, z: -5 },
        blockName: "minecraft:cobblestone",
      },
      {
        position: { dimension: "minecraft:overworld", x: 12, y: 65, z: -2 },
        blockName: "minecraft:oak_planks",
      },
    ],
    requiredRegion: {
      dimension: "minecraft:overworld",
      min: { x: 10, y: 64, z: -5 },
      max: { x: 12, y: 65, z: -2 },
    },
  });
});

test("blueprint validation rejects ambiguous schema, palettes and positions", () => {
  assert.throws(
    () => parseBlueprint(blueprint({ schemaVersion: 2 })),
    expectBlueprintError("UNSUPPORTED_VERSION", "blueprint.schemaVersion"),
  );
  assert.throws(
    () => parseBlueprint({ ...blueprint(), rotation: "north" }),
    expectBlueprintError("INVALID_FORMAT", "blueprint.rotation"),
  );
  assert.throws(
    () => parseBlueprint(blueprint({ palette: { empty: "minecraft:air" } })),
    expectBlueprintError("INVALID_FORMAT", "palette.empty"),
  );
  assert.throws(
    () =>
      parseBlueprint(
        blueprint({
          blocks: [{ position: { x: 0, y: 0, z: 0 }, material: "missing" }],
        }),
      ),
    expectBlueprintError("INVALID_REFERENCE", "blocks[0].material"),
  );
  assert.throws(
    () =>
      parseBlueprint(
        blueprint({
          blocks: [
            { position: { x: 1, y: 0, z: 1 }, material: "stone" },
            { position: { x: 1, y: 0, z: 1 }, material: "wood" },
          ],
        }),
      ),
    expectBlueprintError("DUPLICATE_POSITION", "blocks[1].position"),
  );
  assert.throws(
    () =>
      parseBlueprint(
        blueprint({
          blocks: [{ position: { x: 3, y: 0, z: 0 }, material: "stone" }],
        }),
      ),
    expectBlueprintError("INVALID_FORMAT", "blocks[0].position.x"),
  );
});

test("blueprint limits and absolute coordinate overflow fail closed", () => {
  assert.throws(
    () => parseBlueprint(blueprint(), { maxBlocks: 1 }),
    expectBlueprintError("LIMIT_EXCEEDED", "blocks"),
  );
  assert.throws(
    () => parseBlueprint(blueprint(), { maxBlocks: 0 }),
    expectBlueprintError("INVALID_LIMITS"),
  );
  assert.throws(
    () =>
      compileBlueprint(blueprint(), {
        dimension: "minecraft:overworld",
        x: Number.MAX_SAFE_INTEGER,
        y: 64,
        z: 0,
      }),
    expectBlueprintError("COORDINATE_OVERFLOW", "blocks[1].position.x"),
  );
  assert.throws(
    () => compileBlueprint(blueprint(), { dimension: "", x: 0, y: 0, z: 0 }),
    expectBlueprintError("INVALID_ORIGIN", "origin"),
  );
});

test("compiled placements are accepted directly by the bounded builder", async () => {
  const compiled = compileBlueprint(blueprint(), {
    dimension: "minecraft:overworld",
    x: 10,
    y: 64,
    z: -5,
  });
  const placed = [];
  const builder = new BuilderAgent({
    minecraft: {
      async getState() {
        return { connected: true, position: compiled.placements[0].position };
      },
      async inspectBlock(position) {
        return { position: { ...position }, name: "minecraft:air", solid: false };
      },
      async moveTo() {},
      async placeBlock(position, blockName) {
        placed.push({ position: { ...position }, blockName });
      },
      async breakBlock() {
        throw new Error("blueprint builds must not break blocks");
      },
    },
  });

  const result = await builder.build({
    taskId: "task-blueprint-1",
    placements: compiled.placements,
    authorization: {
      id: "approval-blueprint-1",
      taskId: "task-blueprint-1",
      allowedActions: ["place-block"],
      allowedRegion: compiled.requiredRegion,
      expiresAt: "2026-08-06T15:00:00.000Z",
      maxActions: compiled.placements.length,
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(placed, compiled.placements);
});
