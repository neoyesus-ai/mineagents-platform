import {
  assertWorldPosition,
  assertWorldRegion,
  clonePosition,
  cloneRegion,
  isPositionInRegion,
  type MinecraftAuthorization,
  type WorldPosition,
} from "@mineagents/minecraft-adapter";
import type { BuildPlacement, BuildRequest, BuilderLimits } from "./contracts.js";
import { BuilderError } from "./errors.js";

export interface ValidatedBuildRequest {
  taskId: string;
  placements: readonly BuildPlacement[];
  authorization: MinecraftAuthorization;
  allowPartial: boolean;
}

const blockNamePattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

export const assertBuilderLimits = (limits: BuilderLimits): void => {
  if (!Number.isSafeInteger(limits.maxPlacementsPerTask) || limits.maxPlacementsPerTask < 1) {
    throw new BuilderError(
      "INVALID_REQUEST",
      "Builder maxPlacementsPerTask must be a positive safe integer.",
    );
  }
};

const positionKey = (position: WorldPosition): string =>
  `${position.dimension}:${position.x}:${position.y}:${position.z}`;

export const validateBuildRequest = (
  request: BuildRequest,
  limits: BuilderLimits,
): ValidatedBuildRequest => {
  if (typeof request?.taskId !== "string" || request.taskId.trim().length === 0) {
    throw new BuilderError("INVALID_REQUEST", "Builder taskId must be a non-empty string.");
  }

  if (
    !Array.isArray(request.placements) ||
    request.placements.length === 0 ||
    request.placements.length > limits.maxPlacementsPerTask
  ) {
    throw new BuilderError(
      "INVALID_REQUEST",
      `Builder placements must contain between 1 and ${limits.maxPlacementsPerTask} entries.`,
    );
  }

  const authorization = request.authorization;
  if (!authorization || authorization.taskId !== request.taskId.trim()) {
    throw new BuilderError(
      "TASK_AUTHORIZATION_MISMATCH",
      "Builder authorization must belong to the requested task.",
    );
  }

  if (
    !Array.isArray(authorization.allowedActions) ||
    !authorization.allowedActions.includes("place-block") ||
    !Number.isSafeInteger(authorization.maxActions)
  ) {
    throw new BuilderError(
      "AUTHORIZATION_SCOPE_MISMATCH",
      "Builder authorization does not permit block placement.",
    );
  }

  try {
    assertWorldRegion(authorization.allowedRegion);
  } catch (error) {
    throw new BuilderError(
      "AUTHORIZATION_SCOPE_MISMATCH",
      "Builder authorization region is invalid.",
      { cause: error },
    );
  }

  const placementsByPosition = new Map<string, BuildPlacement>();
  for (const placement of request.placements) {
    if (typeof placement?.blockName !== "string" || !blockNamePattern.test(placement.blockName)) {
      throw new BuilderError(
        "INVALID_REQUEST",
        "Every builder blockName must be a namespaced Minecraft identifier.",
      );
    }

    try {
      assertWorldPosition(placement.position);
    } catch (error) {
      throw new BuilderError("INVALID_REQUEST", "Builder placement position is invalid.", {
        cause: error,
      });
    }

    if (!isPositionInRegion(placement.position, authorization.allowedRegion)) {
      throw new BuilderError(
        "AUTHORIZATION_SCOPE_MISMATCH",
        "Every builder placement must be inside the authorization region.",
      );
    }

    const key = positionKey(placement.position);
    const existing = placementsByPosition.get(key);
    if (existing && existing.blockName !== placement.blockName) {
      throw new BuilderError(
        "INVALID_REQUEST",
        "A builder position cannot request multiple block types.",
      );
    }

    placementsByPosition.set(key, {
      position: clonePosition(placement.position),
      blockName: placement.blockName,
    });
  }

  const placements = [...placementsByPosition.values()];
  if (placements.length > authorization.maxActions) {
    throw new BuilderError(
      "AUTHORIZATION_SCOPE_MISMATCH",
      "Builder authorization action limit is smaller than the placement request.",
    );
  }

  return {
    taskId: request.taskId.trim(),
    placements,
    authorization: {
      ...authorization,
      allowedActions: [...authorization.allowedActions],
      allowedRegion: cloneRegion(authorization.allowedRegion),
    },
    allowPartial: request.allowPartial === true,
  };
};
