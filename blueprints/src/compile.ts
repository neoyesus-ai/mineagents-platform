import type { BuildPlacement } from "@mineagents/agent-builder";
import {
  assertWorldPosition,
  type WorldPosition,
  type WorldRegion,
} from "@mineagents/minecraft-adapter";
import { BlueprintError } from "./errors.js";
import type { BlueprintLimits, CompiledBlueprint } from "./types.js";
import { parseBlueprint } from "./validation.js";

const addCoordinate = (origin: number, offset: number, path: string): number => {
  const result = origin + offset;
  if (!Number.isSafeInteger(result)) {
    throw new BlueprintError(
      "COORDINATE_OVERFLOW",
      "Compiled blueprint coordinates must remain safe integers.",
      path,
    );
  }
  return result;
};

const getRequiredRegion = (placements: readonly BuildPlacement[]): WorldRegion => {
  const first = placements[0];
  if (!first) {
    throw new BlueprintError("INVALID_FORMAT", "Compiled blueprints require placements.");
  }

  const region: WorldRegion = {
    dimension: first.position.dimension,
    min: { x: first.position.x, y: first.position.y, z: first.position.z },
    max: { x: first.position.x, y: first.position.y, z: first.position.z },
  };
  for (const placement of placements.slice(1)) {
    region.min.x = Math.min(region.min.x, placement.position.x);
    region.min.y = Math.min(region.min.y, placement.position.y);
    region.min.z = Math.min(region.min.z, placement.position.z);
    region.max.x = Math.max(region.max.x, placement.position.x);
    region.max.y = Math.max(region.max.y, placement.position.y);
    region.max.z = Math.max(region.max.z, placement.position.z);
  }
  return region;
};

export const compileBlueprint = (
  input: unknown,
  origin: WorldPosition,
  limits?: Partial<BlueprintLimits>,
): CompiledBlueprint => {
  try {
    assertWorldPosition(origin);
  } catch (error) {
    throw new BlueprintError(
      "INVALID_ORIGIN",
      "Blueprint origin must be a valid absolute world position.",
      "origin",
      { cause: error },
    );
  }

  const blueprint = parseBlueprint(input, limits);
  const placements = blueprint.blocks.map((block, index): BuildPlacement => ({
    position: {
      dimension: origin.dimension,
      x: addCoordinate(origin.x, block.position.x, `blocks[${index}].position.x`),
      y: addCoordinate(origin.y, block.position.y, `blocks[${index}].position.y`),
      z: addCoordinate(origin.z, block.position.z, `blocks[${index}].position.z`),
    },
    blockName: blueprint.palette[block.material] as string,
  }));

  return {
    blueprintId: blueprint.id,
    placements,
    requiredRegion: getRequiredRegion(placements),
  };
};
