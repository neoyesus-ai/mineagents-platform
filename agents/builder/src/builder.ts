import {
  clonePosition,
  type MinecraftAdapter,
  type WorldPosition,
} from "@mineagents/minecraft-adapter";
import type {
  BlockedPlacement,
  BuildPlacement,
  BuildRequest,
  BuilderLimits,
  BuilderRunOptions,
  BuilderRunResult,
  BuilderRunStatus,
} from "./contracts.js";
import { BuilderExecutionError } from "./errors.js";
import { assertBuilderLimits, validateBuildRequest } from "./validation.js";

export interface BuilderAgentOptions {
  minecraft: MinecraftAdapter;
  limits?: Partial<BuilderLimits>;
}

export const defaultBuilderLimits: BuilderLimits = {
  maxPlacementsPerTask: 256,
};

const emptyBlockNames = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
]);

export class BuilderAgent {
  private readonly minecraft: MinecraftAdapter;
  private readonly limits: BuilderLimits;

  constructor(options: BuilderAgentOptions) {
    this.minecraft = options.minecraft;
    this.limits = {
      ...defaultBuilderLimits,
      ...options.limits,
    };
    assertBuilderLimits(this.limits);
  }

  async build(
    rawRequest: BuildRequest,
    options: BuilderRunOptions = {},
  ): Promise<BuilderRunResult> {
    const request = validateBuildRequest(rawRequest, this.limits);
    let inspectedPositions = 0;
    let alreadySatisfied = 0;
    const pending: BuildPlacement[] = [];
    const blocked: BlockedPlacement[] = [];
    const placedPositions: WorldPosition[] = [];

    const result = (status: BuilderRunStatus): BuilderRunResult => ({
      taskId: request.taskId,
      status,
      requestedPlacements: request.placements.length,
      inspectedPositions,
      alreadySatisfied,
      blockedPlacements: blocked.map((placement) => ({
        ...placement,
        position: clonePosition(placement.position),
      })),
      placedBlocks: placedPositions.length,
      placedPositions: placedPositions.map(clonePosition),
    });

    for (const placement of request.placements) {
      if (options.signal?.aborted) {
        return result("cancelled");
      }

      try {
        const current = await this.minecraft.inspectBlock(placement.position);
        inspectedPositions += 1;

        if (current.name === placement.blockName) {
          alreadySatisfied += 1;
        } else if (emptyBlockNames.has(current.name)) {
          pending.push({
            position: clonePosition(placement.position),
            blockName: placement.blockName,
          });
        } else {
          blocked.push({
            position: clonePosition(placement.position),
            blockName: placement.blockName,
            existingBlockName: current.name,
          });
        }
      } catch (error) {
        throw new BuilderExecutionError(
          "Builder failed while inspecting a placement target.",
          result("failed"),
          error,
        );
      }
    }

    if (options.signal?.aborted) {
      return result("cancelled");
    }

    if (blocked.length > 0 && !request.allowPartial) {
      return result("blocked");
    }

    for (const placement of pending) {
      if (options.signal?.aborted) {
        return result("cancelled");
      }

      try {
        await this.minecraft.placeBlock(
          placement.position,
          placement.blockName,
          request.authorization,
        );
        placedPositions.push(clonePosition(placement.position));
      } catch (error) {
        throw new BuilderExecutionError(
          "Builder failed while placing an approved block.",
          result("failed"),
          error,
        );
      }
    }

    return result(blocked.length > 0 ? "partial" : "completed");
  }
}
