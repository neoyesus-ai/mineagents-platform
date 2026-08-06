import {
  clonePosition,
  type MinecraftAdapter,
  type WorldPosition,
} from "@mineagents/minecraft-adapter";
import type {
  CollectBlocksRequest,
  CollectorLimits,
  CollectorRunOptions,
  CollectorRunResult,
  CollectorRunStatus,
} from "./contracts.js";
import { CollectorExecutionError } from "./errors.js";
import {
  assertCollectorLimits,
  validateCollectBlocksRequest,
} from "./validation.js";

export interface CollectorAgentOptions {
  minecraft: MinecraftAdapter;
  limits?: Partial<CollectorLimits>;
}

export const defaultCollectorLimits: CollectorLimits = {
  maxBlocksPerTask: 64,
  maxCandidatesPerTask: 256,
};

export class CollectorAgent {
  private readonly minecraft: MinecraftAdapter;
  private readonly limits: CollectorLimits;

  constructor(options: CollectorAgentOptions) {
    this.minecraft = options.minecraft;
    this.limits = {
      ...defaultCollectorLimits,
      ...options.limits,
    };
    assertCollectorLimits(this.limits);
  }

  async collectBlocks(
    rawRequest: CollectBlocksRequest,
    options: CollectorRunOptions = {},
  ): Promise<CollectorRunResult> {
    const request = validateCollectBlocksRequest(rawRequest, this.limits);
    let inspectedPositions = 0;
    const matches: WorldPosition[] = [];
    const brokenPositions: WorldPosition[] = [];

    const result = (status: CollectorRunStatus): CollectorRunResult => ({
      taskId: request.taskId,
      blockName: request.blockName,
      status,
      requestedBlocks: request.quantity,
      inspectedPositions,
      matchingBlocks: matches.length,
      brokenBlocks: brokenPositions.length,
      brokenPositions: brokenPositions.map(clonePosition),
    });

    for (const candidate of request.candidates) {
      if (options.signal?.aborted) {
        return result("cancelled");
      }

      try {
        const block = await this.minecraft.inspectBlock(candidate);
        inspectedPositions += 1;
        if (block.name === request.blockName) {
          matches.push(clonePosition(candidate));
          if (matches.length === request.quantity) {
            break;
          }
        }
      } catch (error) {
        throw new CollectorExecutionError(
          "Collector failed while inspecting a candidate block.",
          result("failed"),
          error,
        );
      }
    }

    if (options.signal?.aborted) {
      return result("cancelled");
    }

    if (matches.length < request.quantity && !request.allowPartial) {
      return result("insufficient-resources");
    }

    for (const position of matches) {
      if (options.signal?.aborted) {
        return result("cancelled");
      }

      try {
        await this.minecraft.breakBlock(
          position,
          request.blockName,
          request.authorization,
        );
        brokenPositions.push(clonePosition(position));
      } catch (error) {
        throw new CollectorExecutionError(
          "Collector failed while breaking an approved block.",
          result("failed"),
          error,
        );
      }
    }

    return result(brokenPositions.length === request.quantity ? "completed" : "partial");
  }
}
