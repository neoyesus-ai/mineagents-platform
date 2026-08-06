import { MinecraftSafetyError } from "./errors.js";
import {
  assertWorldPosition,
  assertWorldRegion,
  clonePosition,
  cloneRegion,
  isPositionInRegion,
  isRegionContained,
} from "./geometry.js";
import type {
  MinecraftAdapter,
  MinecraftAuthorization,
  MinecraftAuthorizationVerifier,
  MinecraftDriver,
  MinecraftSafetyPolicy,
  MinecraftWriteAction,
  MinecraftWriteRequest,
  WorldPosition,
  WorldRegion,
} from "./types.js";

export interface SafeMinecraftAdapterOptions {
  driver: MinecraftDriver;
  policy: MinecraftSafetyPolicy;
  authorizationVerifier: MinecraftAuthorizationVerifier;
  now?: () => Date;
}

interface NormalizedPolicy {
  allowedRegions: readonly WorldRegion[];
  allowMovement: boolean;
  allowedPlaceBlocks: ReadonlySet<string>;
  allowedBreakBlocks: ReadonlySet<string>;
  maxActionsPerAuthorization: number;
}

const blockNamePattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

const assertBlockNames = (values: readonly string[]): void => {
  if (!values.every((value) => blockNamePattern.test(value))) {
    throw new MinecraftSafetyError(
      "INVALID_POLICY",
      "Allowed blocks must use namespaced Minecraft identifiers.",
    );
  }
};

const normalizePolicy = (policy: MinecraftSafetyPolicy): NormalizedPolicy => {
  if (!Array.isArray(policy.allowedRegions) || policy.allowedRegions.length === 0) {
    throw new MinecraftSafetyError(
      "INVALID_POLICY",
      "At least one allowed world region is required.",
    );
  }

  for (const region of policy.allowedRegions) {
    assertWorldRegion(region);
  }

  assertBlockNames(policy.allowedPlaceBlocks);
  assertBlockNames(policy.allowedBreakBlocks);

  if (
    !Number.isSafeInteger(policy.maxActionsPerAuthorization) ||
    policy.maxActionsPerAuthorization < 1
  ) {
    throw new MinecraftSafetyError(
      "INVALID_POLICY",
      "The per-authorization action limit must be a positive safe integer.",
    );
  }

  return {
    allowedRegions: policy.allowedRegions.map(cloneRegion),
    allowMovement: policy.allowMovement,
    allowedPlaceBlocks: new Set(policy.allowedPlaceBlocks),
    allowedBreakBlocks: new Set(policy.allowedBreakBlocks),
    maxActionsPerAuthorization: policy.maxActionsPerAuthorization,
  };
};

export class SafeMinecraftAdapter implements MinecraftAdapter {
  private readonly driver: MinecraftDriver;
  private readonly policy: NormalizedPolicy;
  private readonly authorizationVerifier: MinecraftAuthorizationVerifier;
  private readonly now: () => Date;
  private readonly actionCounts = new Map<string, number>();

  constructor(options: SafeMinecraftAdapterOptions) {
    this.driver = options.driver;
    this.policy = normalizePolicy(options.policy);
    this.authorizationVerifier = options.authorizationVerifier;
    this.now = options.now ?? (() => new Date());
  }

  getState() {
    return this.driver.getState();
  }

  async inspectBlock(position: WorldPosition) {
    this.assertAllowedPosition(position);
    return this.driver.inspectBlock(clonePosition(position));
  }

  async moveTo(target: WorldPosition): Promise<void> {
    if (!this.policy.allowMovement) {
      throw new MinecraftSafetyError("MOVEMENT_DISABLED", "Movement is disabled by policy.");
    }

    this.assertAllowedPosition(target);
    await this.driver.moveTo(
      clonePosition(target),
      this.policy.allowedRegions.map(cloneRegion),
    );
  }

  async placeBlock(
    position: WorldPosition,
    blockName: string,
    authorization?: MinecraftAuthorization,
  ): Promise<void> {
    await this.executeWrite("place-block", position, blockName, authorization, (request) =>
      this.driver.placeBlock(clonePosition(request.position), request.blockName),
    );
  }

  async breakBlock(
    position: WorldPosition,
    expectedBlockName: string,
    authorization?: MinecraftAuthorization,
  ): Promise<void> {
    await this.executeWrite("break-block", position, expectedBlockName, authorization, (request) =>
      this.driver.breakBlock(clonePosition(request.position), request.blockName),
    );
  }

  private assertAllowedPosition(position: WorldPosition): void {
    assertWorldPosition(position);
    if (!this.policy.allowedRegions.some((region) => isPositionInRegion(position, region))) {
      throw new MinecraftSafetyError(
        "OUTSIDE_ALLOWED_REGION",
        "The requested position is outside every allowed world region.",
      );
    }
  }

  private async executeWrite(
    action: MinecraftWriteAction,
    position: WorldPosition,
    blockName: string,
    authorization: MinecraftAuthorization | undefined,
    execute: (request: MinecraftWriteRequest) => Promise<void>,
  ): Promise<void> {
    this.assertAllowedPosition(position);
    this.assertActionAllowed(action, blockName);

    const request: MinecraftWriteRequest = {
      action,
      position: clonePosition(position),
      blockName,
    };
    await this.assertAuthorized(authorization, request);
    await execute(request);
  }

  private assertActionAllowed(action: MinecraftWriteAction, blockName: string): void {
    if (!blockNamePattern.test(blockName)) {
      throw new MinecraftSafetyError(
        "INVALID_REQUEST",
        "Block names must use a namespaced Minecraft identifier.",
      );
    }

    const allowedBlocks =
      action === "place-block"
        ? this.policy.allowedPlaceBlocks
        : this.policy.allowedBreakBlocks;

    if (allowedBlocks.size === 0) {
      throw new MinecraftSafetyError(
        "ACTION_NOT_ALLOWED",
        `Action '${action}' is disabled by policy.`,
      );
    }

    if (!allowedBlocks.has(blockName)) {
      throw new MinecraftSafetyError(
        "BLOCK_NOT_ALLOWED",
        `Block '${blockName}' is not allowed for action '${action}'.`,
      );
    }
  }

  private async assertAuthorized(
    authorization: MinecraftAuthorization | undefined,
    request: MinecraftWriteRequest,
  ): Promise<void> {
    if (!authorization) {
      throw new MinecraftSafetyError(
        "APPROVAL_REQUIRED",
        "A verified authorization is required for world writes.",
      );
    }

    const authorizationSnapshot = this.cloneAuthorization(authorization);
    this.assertAuthorizationScope(authorizationSnapshot, request);

    let approved = false;
    try {
      approved = await this.authorizationVerifier.verify(
        this.cloneAuthorization(authorizationSnapshot),
        {
          ...request,
          position: clonePosition(request.position),
        },
      );
    } catch {
      approved = false;
    }

    if (!approved) {
      throw new MinecraftSafetyError(
        "APPROVAL_REJECTED",
        "The external authorization verifier rejected the world write.",
      );
    }

    this.assertAuthorizationScope(authorizationSnapshot, request);

    const currentCount = this.actionCounts.get(authorizationSnapshot.id) ?? 0;
    if (currentCount >= authorizationSnapshot.maxActions) {
      throw new MinecraftSafetyError(
        "APPROVAL_LIMIT_EXCEEDED",
        "The authorization action limit has been reached.",
      );
    }

    this.actionCounts.set(authorizationSnapshot.id, currentCount + 1);
  }

  private cloneAuthorization(
    authorization: MinecraftAuthorization,
  ): MinecraftAuthorization {
    try {
      return {
        ...authorization,
        allowedActions: [...authorization.allowedActions],
        allowedRegion: cloneRegion(authorization.allowedRegion),
      };
    } catch {
      throw new MinecraftSafetyError(
        "APPROVAL_SCOPE_MISMATCH",
        "The authorization structure is invalid.",
      );
    }
  }

  private assertAuthorizationScope(
    authorization: MinecraftAuthorization,
    request: MinecraftWriteRequest,
  ): void {
    const expiration = Date.parse(authorization.expiresAt);
    if (!Number.isFinite(expiration) || expiration <= this.now().getTime()) {
      throw new MinecraftSafetyError(
        "APPROVAL_EXPIRED",
        "The world-write authorization is expired or invalid.",
      );
    }

    if (
      typeof authorization.id !== "string" ||
      authorization.id.trim().length === 0 ||
      typeof authorization.taskId !== "string" ||
      authorization.taskId.trim().length === 0 ||
      !Number.isSafeInteger(authorization.maxActions) ||
      authorization.maxActions < 1 ||
      authorization.maxActions > this.policy.maxActionsPerAuthorization
    ) {
      throw new MinecraftSafetyError(
        "APPROVAL_SCOPE_MISMATCH",
        "The authorization identity or action limit is outside policy.",
      );
    }

    assertWorldRegion(authorization.allowedRegion);
    const regionIsAllowed = this.policy.allowedRegions.some((region) =>
      isRegionContained(authorization.allowedRegion, region),
    );

    if (
      !regionIsAllowed ||
      !isPositionInRegion(request.position, authorization.allowedRegion) ||
      !authorization.allowedActions.includes(request.action)
    ) {
      throw new MinecraftSafetyError(
        "APPROVAL_SCOPE_MISMATCH",
        "The requested write is outside the authorization scope.",
      );
    }
  }
}
