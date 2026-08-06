import { MinecraftSafetyError } from "./errors.js";
import type { WorldPosition, WorldRegion } from "./types.js";

const isCoordinate = (value: number): boolean => Number.isSafeInteger(value);

export const assertWorldPosition = (position: WorldPosition): void => {
  if (
    typeof position?.dimension !== "string" ||
    position.dimension.trim().length === 0 ||
    !isCoordinate(position.x) ||
    !isCoordinate(position.y) ||
    !isCoordinate(position.z)
  ) {
    throw new MinecraftSafetyError(
      "INVALID_REQUEST",
      "World positions require a dimension and safe integer coordinates.",
    );
  }
};

export const assertWorldRegion = (region: WorldRegion): void => {
  const min = { dimension: region?.dimension, ...region?.min };
  const max = { dimension: region?.dimension, ...region?.max };
  assertWorldPosition(min);
  assertWorldPosition(max);

  if (region.min.x > region.max.x || region.min.y > region.max.y || region.min.z > region.max.z) {
    throw new MinecraftSafetyError(
      "INVALID_POLICY",
      "World region minimum coordinates must not exceed maximum coordinates.",
    );
  }
};

export const isPositionInRegion = (
  position: WorldPosition,
  region: WorldRegion,
): boolean =>
  position.dimension === region.dimension &&
  position.x >= region.min.x &&
  position.x <= region.max.x &&
  position.y >= region.min.y &&
  position.y <= region.max.y &&
  position.z >= region.min.z &&
  position.z <= region.max.z;

export const isRegionContained = (inner: WorldRegion, outer: WorldRegion): boolean =>
  inner.dimension === outer.dimension &&
  inner.min.x >= outer.min.x &&
  inner.min.y >= outer.min.y &&
  inner.min.z >= outer.min.z &&
  inner.max.x <= outer.max.x &&
  inner.max.y <= outer.max.y &&
  inner.max.z <= outer.max.z;

export const clonePosition = (position: WorldPosition): WorldPosition => ({ ...position });

export const cloneRegion = (region: WorldRegion): WorldRegion => ({
  dimension: region.dimension,
  min: { ...region.min },
  max: { ...region.max },
});
