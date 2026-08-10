import { BuilderAgent, type BuilderRunResult } from "@mineagents/agent-builder";
import {
  CollectorAgent,
  type CollectorRunResult,
} from "@mineagents/agent-collector";
import {
  SafeMinecraftAdapter,
  type MinecraftAuthorization,
  type MinecraftAuthorizationVerifier,
  type MinecraftDriver,
  type WorldPosition,
  type WorldRegion,
} from "@mineagents/minecraft-adapter";
import { MineflayerDriverError } from "./errors.js";

export interface AgentSmokeDriver extends MinecraftDriver {
  hasInventoryItem(blockName: string): boolean;
}

export interface AgentSmokeOptions {
  target: WorldPosition;
  blockName: string;
  approved: true;
  now?: () => Date;
}

export interface AgentSmokeResult {
  target: WorldPosition;
  blockName: string;
  collector: CollectorRunResult;
  builder: BuilderRunResult;
  builderAttempts: 1 | 2;
  restored: true;
}

const emptyBlockNames = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
]);

const exactRegion = (position: WorldPosition): WorldRegion => ({
  dimension: position.dimension,
  min: { x: position.x, y: position.y, z: position.z },
  max: { x: position.x, y: position.y, z: position.z },
});

const authorization = (
  id: string,
  taskId: string,
  action: "place-block" | "break-block",
  region: WorldRegion,
  expiresAt: string,
): MinecraftAuthorization => ({
  id,
  taskId,
  allowedActions: [action],
  allowedRegion: region,
  expiresAt,
  maxActions: 1,
});

const exactAuthorizationVerifier = (
  expected: ReadonlyMap<string, "place-block" | "break-block">,
): MinecraftAuthorizationVerifier => ({
  async verify(candidate, request) {
    return expected.get(candidate.id) === request.action;
  },
});

const restoreAfterFailure = async (
  minecraft: SafeMinecraftAdapter,
  target: WorldPosition,
  blockName: string,
  recoveryAuthorization: MinecraftAuthorization,
): Promise<void> => {
  const current = await minecraft.inspectBlock(target);
  if (current.name === blockName) {
    return;
  }
  if (!emptyBlockNames.has(current.name)) {
    throw new MineflayerDriverError(
      "WRITE_VERIFICATION_FAILED",
      `Recovery refused to overwrite unexpected block ${current.name}.`,
    );
  }
  await minecraft.placeBlock(target, blockName, recoveryAuthorization);
};

export const runSupervisedAgentSmoke = async (
  driver: AgentSmokeDriver,
  options: AgentSmokeOptions,
): Promise<AgentSmokeResult> => {
  if (options.approved !== true) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "The supervised agent smoke test requires explicit disposable-world approval.",
    );
  }

  const before = await driver.inspectBlock(options.target);
  if (before.name !== options.blockName) {
    throw new MineflayerDriverError(
      "BLOCK_PRECONDITION_FAILED",
      `Expected ${options.blockName} at the smoke target, found ${before.name}.`,
    );
  }
  if (!driver.hasInventoryItem(options.blockName)) {
    throw new MineflayerDriverError(
      "ITEM_NOT_AVAILABLE",
      `The smoke bot must already hold ${options.blockName} so recovery is possible before any write.`,
    );
  }

  const now = options.now ?? (() => new Date());
  const expiresAt = new Date(now().getTime() + 60_000).toISOString();
  const region = exactRegion(options.target);
  const collectorTaskId = "agent-smoke:collector";
  const builderTaskId = "agent-smoke:builder";
  const builderRetryTaskId = "agent-smoke:builder-retry";
  const recoveryTaskId = "agent-smoke:recovery";
  const collectorAuthorization = authorization(
    "agent-smoke-break",
    collectorTaskId,
    "break-block",
    region,
    expiresAt,
  );
  const builderAuthorization = authorization(
    "agent-smoke-place",
    builderTaskId,
    "place-block",
    region,
    expiresAt,
  );
  const builderRetryAuthorization = authorization(
    "agent-smoke-place-retry",
    builderRetryTaskId,
    "place-block",
    region,
    expiresAt,
  );
  const recoveryAuthorization = authorization(
    "agent-smoke-recovery",
    recoveryTaskId,
    "place-block",
    region,
    expiresAt,
  );
  const verifier = exactAuthorizationVerifier(
    new Map([
      [collectorAuthorization.id, "break-block"],
      [builderAuthorization.id, "place-block"],
      [builderRetryAuthorization.id, "place-block"],
      [recoveryAuthorization.id, "place-block"],
    ]),
  );
  const minecraft = new SafeMinecraftAdapter({
    driver,
    policy: {
      allowedRegions: [region],
      allowMovement: false,
      allowedPlaceBlocks: [options.blockName],
      allowedBreakBlocks: [options.blockName],
      maxActionsPerAuthorization: 1,
    },
    authorizationVerifier: verifier,
    now,
  });
  const collector = new CollectorAgent({ minecraft });
  const builder = new BuilderAgent({ minecraft });

  const collectorResult = await collector.collectBlocks({
    taskId: collectorTaskId,
    blockName: options.blockName,
    quantity: 1,
    candidates: [options.target],
    authorization: collectorAuthorization,
  });

  let builderResult: BuilderRunResult;
  let builderAttempts: 1 | 2 = 1;
  try {
    builderResult = await builder.build({
      taskId: builderTaskId,
      placements: [{ position: options.target, blockName: options.blockName }],
      authorization: builderAuthorization,
    });
  } catch (firstBuilderError) {
    builderAttempts = 2;
    try {
      builderResult = await builder.build({
        taskId: builderRetryTaskId,
        placements: [{ position: options.target, blockName: options.blockName }],
        authorization: builderRetryAuthorization,
      });
    } catch (secondBuilderError) {
      try {
        await restoreAfterFailure(
          minecraft,
          options.target,
          options.blockName,
          recoveryAuthorization,
        );
      } catch (recoveryError) {
        throw new AggregateError(
          [firstBuilderError, secondBuilderError, recoveryError],
          "Agent smoke exhausted its builder attempts and could not restore the target.",
        );
      }
      throw new AggregateError(
        [firstBuilderError, secondBuilderError],
        "Agent smoke exhausted its builder attempts; the exact target was restored.",
      );
    }
  }

  const after = await minecraft.inspectBlock(options.target);
  if (after.name !== options.blockName) {
    throw new MineflayerDriverError(
      "WRITE_VERIFICATION_FAILED",
      `Agent smoke finished with ${after.name} instead of ${options.blockName}.`,
    );
  }

  return {
    target: { ...options.target },
    blockName: options.blockName,
    collector: collectorResult,
    builder: builderResult,
    builderAttempts,
    restored: true,
  };
};
