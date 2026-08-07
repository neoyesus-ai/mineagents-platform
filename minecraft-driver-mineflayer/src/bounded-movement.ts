import {
  assertWorldPosition,
  assertWorldRegion,
  cloneRegion,
  isPositionInRegion,
  type WorldPosition,
  type WorldRegion,
} from "@mineagents/minecraft-adapter";
import type { Bot } from "mineflayer";
import pathfinderPackage from "mineflayer-pathfinder";
import type { SafeBlock } from "mineflayer-pathfinder";
import { MineflayerDriverError } from "./errors.js";

const { Movements, goals } = pathfinderPackage;
type PathfinderGoal = Parameters<Bot["pathfinder"]["goto"]>[0];
type PathfinderMovements = InstanceType<typeof Movements>;

const reasonText = (reason: unknown): string => {
  if (reason instanceof Error) {
    return reason.message;
  }
  if (typeof reason === "string") {
    return reason;
  }
  try {
    return JSON.stringify(reason);
  } catch {
    return "Unknown movement error";
  }
};

export interface BoundedMovementDependencies {
  createMovements(bot: Bot): PathfinderMovements;
  createGoal(target: WorldPosition): PathfinderGoal;
}

const defaultDependencies: BoundedMovementDependencies = {
  createMovements: (bot) => new Movements(bot),
  createGoal: (target) => new goals.GoalBlock(target.x, target.y, target.z),
};

export class BoundedMovementController {
  private movementInProgress = false;

  constructor(
    private readonly bot: Bot,
    private readonly timeoutMs: number,
    private readonly dependencies = defaultDependencies,
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new MineflayerDriverError(
        "INVALID_CONFIG",
        "Mineflayer movement timeout must be a positive safe integer.",
      );
    }
  }

  async moveTo(
    target: WorldPosition,
    allowedRegions: readonly WorldRegion[],
  ): Promise<void> {
    const movementScope = this.validateScope(target, allowedRegions);
    const current = this.readPosition();

    if (target.dimension !== current.dimension) {
      throw new MineflayerDriverError(
        "DIMENSION_MISMATCH",
        `The bot is in '${current.dimension}', not '${target.dimension}'.`,
      );
    }
    this.assertInsideScope(current, movementScope, "current position");
    this.assertInsideScope(target, movementScope, "movement target");

    if (this.movementInProgress) {
      throw new MineflayerDriverError(
        "MOVEMENT_IN_PROGRESS",
        "Mineflayer is already executing a movement.",
      );
    }

    const movements = this.createBoundedMovements(current.dimension, movementScope);
    const goal = this.dependencies.createGoal(target);
    let boundaryViolation: WorldPosition | undefined;
    const monitorPosition = (): void => {
      const position = this.readPosition();
      if (!movementScope.some((region) => isPositionInRegion(position, region))) {
        boundaryViolation = position;
        this.bot.pathfinder.stop();
      }
    };

    this.movementInProgress = true;
    try {
      this.bot.on("move", monitorPosition);
      this.bot.pathfinder.setMovements(movements);
      await this.gotoWithTimeout(goal);
      if (boundaryViolation) {
        throw this.outsideScopeError(boundaryViolation);
      }

      const finalPosition = this.readPosition();
      this.assertInsideScope(finalPosition, movementScope, "final position");
      if (
        finalPosition.x !== target.x ||
        finalPosition.y !== target.y ||
        finalPosition.z !== target.z
      ) {
        throw new MineflayerDriverError(
          "MOVEMENT_FAILED",
          `Mineflayer stopped at ${this.formatPosition(finalPosition)} instead of the target.`,
        );
      }
    } catch (error) {
      this.bot.pathfinder.stop();
      if (boundaryViolation) {
        throw this.outsideScopeError(boundaryViolation);
      }
      if (error instanceof MineflayerDriverError) {
        throw error;
      }
      throw new MineflayerDriverError(
        "MOVEMENT_FAILED",
        `Mineflayer movement failed: ${reasonText(error)}`,
      );
    } finally {
      this.bot.off("move", monitorPosition);
      this.movementInProgress = false;
    }
  }

  stop(): void {
    if (this.movementInProgress) {
      this.bot.pathfinder.stop();
    }
  }

  private validateScope(
    target: WorldPosition,
    allowedRegions: readonly WorldRegion[],
  ): WorldRegion[] {
    if (!Array.isArray(allowedRegions) || allowedRegions.length === 0) {
      throw new MineflayerDriverError(
        "INVALID_MOVEMENT_SCOPE",
        "Movement requires at least one allowed region.",
      );
    }

    try {
      assertWorldPosition(target);
      for (const region of allowedRegions) {
        assertWorldRegion(region);
      }
    } catch (error) {
      throw new MineflayerDriverError(
        "INVALID_MOVEMENT_SCOPE",
        `Movement scope is invalid: ${reasonText(error)}`,
      );
    }
    return allowedRegions.map(cloneRegion);
  }

  private assertInsideScope(
    position: WorldPosition,
    allowedRegions: readonly WorldRegion[],
    label: string,
  ): void {
    if (!allowedRegions.some((region) => isPositionInRegion(position, region))) {
      throw new MineflayerDriverError(
        "OUTSIDE_ALLOWED_REGION",
        `The ${label} ${this.formatPosition(position)} is outside every allowed region.`,
      );
    }
  }

  private createBoundedMovements(
    dimension: string,
    allowedRegions: readonly WorldRegion[],
  ): PathfinderMovements {
    const movements = this.dependencies.createMovements(this.bot);
    movements.canDig = false;
    movements.canOpenDoors = false;
    movements.allow1by1towers = false;
    movements.allowFreeMotion = false;
    movements.allowParkour = false;
    movements.allowSprinting = false;
    movements.maxDropDown = 1;
    movements.infiniteLiquidDropdownDistance = false;
    movements.scafoldingBlocks = [];

    const isOutsideScope = (block: SafeBlock): number => {
      const x = Math.floor(block.position.x);
      const y = Math.floor(block.position.y);
      const z = Math.floor(block.position.z);
      const isInside = allowedRegions.some((region) => {
        return (
          region.dimension === dimension &&
          x >= region.min.x &&
          x <= region.max.x &&
          y >= region.min.y &&
          y <= region.max.y &&
          z >= region.min.z &&
          z <= region.max.z
        );
      });
      return isInside
        ? 0
        : 100;
    };
    movements.exclusionAreasStep.push(isOutsideScope);
    movements.exclusionAreasBreak.push(() => 100);
    movements.exclusionAreasPlace.push(() => 100);
    return movements;
  }

  private async gotoWithTimeout(goal: PathfinderGoal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        this.bot.pathfinder.stop();
        settle(() =>
          reject(
            new MineflayerDriverError(
              "MOVEMENT_FAILED",
              `Mineflayer movement timed out after ${this.timeoutMs} ms.`,
            ),
          ),
        );
      }, this.timeoutMs);
      const settle = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        callback();
      };

      this.bot.pathfinder.goto(goal).then(
        () => settle(resolve),
        (error: unknown) => settle(() => reject(error)),
      );
    });
  }

  private readPosition(): WorldPosition {
    const position = this.bot.entity.position;
    const dimension = this.bot.game.dimension;
    return {
      dimension: dimension.includes(":") ? dimension : `minecraft:${dimension}`,
      x: Math.floor(position.x),
      y: Math.floor(position.y),
      z: Math.floor(position.z),
    };
  }

  private outsideScopeError(position: WorldPosition): MineflayerDriverError {
    return new MineflayerDriverError(
      "OUTSIDE_ALLOWED_REGION",
      `Mineflayer left the allowed region at ${this.formatPosition(position)}.`,
    );
  }

  private formatPosition(position: WorldPosition): string {
    return `${position.dimension} (${position.x}, ${position.y}, ${position.z})`;
  }
}
