import {
  assertWorldPosition,
  assertWorldRegion,
  clonePosition,
  cloneRegion,
  isPositionInRegion,
  type MinecraftAuthorization,
  type WorldPosition,
} from "@mineagents/minecraft-adapter";
import type { CollectBlocksRequest, CollectorLimits } from "./contracts.js";
import { CollectorError } from "./errors.js";

export interface ValidatedCollectBlocksRequest {
  taskId: string;
  blockName: string;
  quantity: number;
  candidates: readonly WorldPosition[];
  authorization: MinecraftAuthorization;
  allowPartial: boolean;
}

const blockNamePattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

const assertPositiveLimit = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new CollectorError(
      "INVALID_REQUEST",
      `Collector limit '${field}' must be a positive safe integer.`,
    );
  }
};

export const assertCollectorLimits = (limits: CollectorLimits): void => {
  assertPositiveLimit(limits.maxBlocksPerTask, "maxBlocksPerTask");
  assertPositiveLimit(limits.maxCandidatesPerTask, "maxCandidatesPerTask");
};

const positionKey = (position: WorldPosition): string =>
  `${position.dimension}:${position.x}:${position.y}:${position.z}`;

export const validateCollectBlocksRequest = (
  request: CollectBlocksRequest,
  limits: CollectorLimits,
): ValidatedCollectBlocksRequest => {
  if (typeof request?.taskId !== "string" || request.taskId.trim().length === 0) {
    throw new CollectorError("INVALID_REQUEST", "Collector taskId must be a non-empty string.");
  }

  if (typeof request.blockName !== "string" || !blockNamePattern.test(request.blockName)) {
    throw new CollectorError(
      "INVALID_REQUEST",
      "Collector blockName must be a namespaced Minecraft identifier.",
    );
  }

  if (
    !Number.isSafeInteger(request.quantity) ||
    request.quantity < 1 ||
    request.quantity > limits.maxBlocksPerTask
  ) {
    throw new CollectorError(
      "INVALID_REQUEST",
      `Collector quantity must be between 1 and ${limits.maxBlocksPerTask}.`,
    );
  }

  if (
    !Array.isArray(request.candidates) ||
    request.candidates.length === 0 ||
    request.candidates.length > limits.maxCandidatesPerTask
  ) {
    throw new CollectorError(
      "INVALID_REQUEST",
      `Collector candidates must contain between 1 and ${limits.maxCandidatesPerTask} positions.`,
    );
  }

  const authorization = request.authorization;
  if (!authorization || authorization.taskId !== request.taskId.trim()) {
    throw new CollectorError(
      "TASK_AUTHORIZATION_MISMATCH",
      "Collector authorization must belong to the requested task.",
    );
  }

  if (
    !Array.isArray(authorization.allowedActions) ||
    !authorization.allowedActions.includes("break-block") ||
    !Number.isSafeInteger(authorization.maxActions) ||
    request.quantity > authorization.maxActions
  ) {
    throw new CollectorError(
      "AUTHORIZATION_SCOPE_MISMATCH",
      "Collector authorization does not allow the requested number of block breaks.",
    );
  }

  try {
    assertWorldRegion(authorization.allowedRegion);
  } catch (error) {
    throw new CollectorError(
      "AUTHORIZATION_SCOPE_MISMATCH",
      "Collector authorization region is invalid.",
      { cause: error },
    );
  }

  const uniqueCandidates: WorldPosition[] = [];
  const seen = new Set<string>();
  for (const candidate of request.candidates) {
    try {
      assertWorldPosition(candidate);
    } catch (error) {
      throw new CollectorError("INVALID_REQUEST", "Collector candidate position is invalid.", {
        cause: error,
      });
    }

    if (!isPositionInRegion(candidate, authorization.allowedRegion)) {
      throw new CollectorError(
        "AUTHORIZATION_SCOPE_MISMATCH",
        "Every collector candidate must be inside the authorization region.",
      );
    }

    const key = positionKey(candidate);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCandidates.push(clonePosition(candidate));
    }
  }

  return {
    taskId: request.taskId.trim(),
    blockName: request.blockName,
    quantity: request.quantity,
    candidates: uniqueCandidates,
    authorization: {
      ...authorization,
      allowedActions: [...authorization.allowedActions],
      allowedRegion: cloneRegion(authorization.allowedRegion),
    },
    allowPartial: request.allowPartial === true,
  };
};
