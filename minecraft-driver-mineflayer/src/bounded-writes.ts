import { assertWorldPosition, type WorldPosition } from "@mineagents/minecraft-adapter";
import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { MineflayerDriverError } from "./errors.js";

type LoadedBlock = NonNullable<ReturnType<Bot["blockAt"]>>;

const blockNamePattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const placementReach = 5.1;
const verificationTimeoutMs = 1_000;
const verificationPollMs = 25;

const namespacedDimension = (dimension: string): string =>
  dimension.includes(":") ? dimension : `minecraft:${dimension}`;

const namespacedBlock = (name: string): string =>
  name.includes(":") ? name : `minecraft:${name}`;

const reasonText = (reason: unknown): string => {
  if (reason instanceof Error) {
    return reason.message;
  }
  return typeof reason === "string" ? reason : "Unknown Mineflayer write error";
};

const placementFaces = [
  { offset: new Vec3(0, -1, 0), face: new Vec3(0, 1, 0) },
  { offset: new Vec3(0, 1, 0), face: new Vec3(0, -1, 0) },
  { offset: new Vec3(-1, 0, 0), face: new Vec3(1, 0, 0) },
  { offset: new Vec3(1, 0, 0), face: new Vec3(-1, 0, 0) },
  { offset: new Vec3(0, 0, -1), face: new Vec3(0, 0, 1) },
  { offset: new Vec3(0, 0, 1), face: new Vec3(0, 0, -1) },
] as const;

export class BoundedWriteController {
  constructor(private readonly bot: Bot) {}

  async placeBlock(
    position: WorldPosition,
    blockName: string,
    expectedCurrentBlockNames: readonly string[],
  ): Promise<void> {
    this.validatePosition(position);
    const target = { ...position };
    this.validateBlockName(blockName, "placement block");
    if (
      !Array.isArray(expectedCurrentBlockNames) ||
      expectedCurrentBlockNames.length === 0
    ) {
      throw new MineflayerDriverError(
        "INVALID_WRITE_REQUEST",
        "Block placement requires at least one expected current block name.",
      );
    }
    for (const expectedName of expectedCurrentBlockNames) {
      this.validateBlockName(expectedName, "expected current block");
    }
    const expectedNames = [...expectedCurrentBlockNames];

    const current = this.readBlock(target);
    const currentName = namespacedBlock(current.name);
    if (!expectedNames.includes(currentName) || currentName === blockName) {
      throw new MineflayerDriverError(
        "BLOCK_PRECONDITION_FAILED",
        `Expected ${expectedNames.join(", ")} at the placement target, found ${currentName}.`,
      );
    }

    const inventoryItem = this.bot.inventory
      .items()
      .find((item) => namespacedBlock(item.name) === blockName);
    if (!inventoryItem) {
      throw new MineflayerDriverError(
        "ITEM_NOT_AVAILABLE",
        `Mineflayer inventory does not contain ${blockName}.`,
      );
    }

    const reference = this.findPlacementReference(target);
    if (!reference) {
      throw new MineflayerDriverError(
        "BLOCK_NOT_REACHABLE",
        "No loaded, solid and reachable adjacent block can support the placement.",
      );
    }

    let placementFailure: unknown;
    try {
      await this.bot.equip(inventoryItem, "hand");
      await this.bot.placeBlock(reference.block, reference.face);
    } catch (error) {
      placementFailure = error;
    }

    const placedName = await this.waitForBlockName(
      target,
      (currentName) => currentName === blockName,
    );
    if (placedName !== blockName) {
      if (placementFailure !== undefined) {
        throw new MineflayerDriverError(
          "WRITE_FAILED",
          `Mineflayer block placement failed: ${reasonText(placementFailure)}`,
        );
      }
      throw new MineflayerDriverError(
        "WRITE_VERIFICATION_FAILED",
        `Mineflayer reported placement success but the target contains ${placedName}.`,
      );
    }
  }

  async breakBlock(position: WorldPosition, expectedBlockName: string): Promise<void> {
    this.validatePosition(position);
    const target = { ...position };
    this.validateBlockName(expectedBlockName, "expected block");

    const current = this.readBlock(target);
    const currentName = namespacedBlock(current.name);
    if (currentName !== expectedBlockName) {
      throw new MineflayerDriverError(
        "BLOCK_PRECONDITION_FAILED",
        `Expected ${expectedBlockName} at the break target, found ${currentName}.`,
      );
    }
    if (!this.bot.canDigBlock(current)) {
      throw new MineflayerDriverError(
        "BLOCK_NOT_REACHABLE",
        "The expected block is not currently reachable and diggable.",
      );
    }

    let breakingFailure: unknown;
    try {
      await this.bot.dig(current, true, "raycast");
    } catch (error) {
      breakingFailure = error;
    }

    const remainingName = await this.waitForBlockName(
      target,
      (currentName) => currentName !== expectedBlockName,
    );
    if (remainingName === expectedBlockName) {
      if (breakingFailure !== undefined) {
        throw new MineflayerDriverError(
          "WRITE_FAILED",
          `Mineflayer block breaking failed: ${reasonText(breakingFailure)}`,
        );
      }
      throw new MineflayerDriverError(
        "WRITE_VERIFICATION_FAILED",
        `Mineflayer reported breaking success but the target still contains ${remainingName}.`,
      );
    }
  }

  private validatePosition(position: WorldPosition): void {
    try {
      assertWorldPosition(position);
    } catch (error) {
      throw new MineflayerDriverError(
        "INVALID_WRITE_REQUEST",
        `World-write position is invalid: ${reasonText(error)}`,
      );
    }

    const currentDimension = namespacedDimension(this.bot.game.dimension);
    if (position.dimension !== currentDimension) {
      throw new MineflayerDriverError(
        "DIMENSION_MISMATCH",
        `The bot is in '${currentDimension}', not '${position.dimension}'.`,
      );
    }
  }

  private validateBlockName(value: string, label: string): void {
    if (typeof value !== "string" || !blockNamePattern.test(value)) {
      throw new MineflayerDriverError(
        "INVALID_WRITE_REQUEST",
        `The ${label} must be a namespaced Minecraft identifier.`,
      );
    }
  }

  private readBlock(position: WorldPosition): LoadedBlock {
    const block = this.bot.blockAt(new Vec3(position.x, position.y, position.z), false);
    if (!block) {
      throw new MineflayerDriverError(
        "CHUNK_NOT_LOADED",
        "The write target is outside the chunks currently loaded by the bot.",
      );
    }
    return block;
  }

  private findPlacementReference(
    position: WorldPosition,
  ): { block: LoadedBlock; face: Vec3 } | undefined {
    const target = new Vec3(position.x, position.y, position.z);
    const eyePosition = this.bot.entity.position.offset(0, 1.65, 0);

    for (const { offset, face } of placementFaces) {
      const block = this.bot.blockAt(target.plus(offset), false);
      if (!block || block.boundingBox === "empty") {
        continue;
      }
      const faceX = block.position.x + 0.5 + face.x * 0.5;
      const faceY = block.position.y + 0.5 + face.y * 0.5;
      const faceZ = block.position.z + 0.5 + face.z * 0.5;
      const distance = Math.hypot(
        faceX - eyePosition.x,
        faceY - eyePosition.y,
        faceZ - eyePosition.z,
      );
      if (distance <= placementReach) {
        return { block, face: face.clone() };
      }
    }
    return undefined;
  }
  private async waitForBlockName(
    position: WorldPosition,
    matches: (blockName: string) => boolean,
  ): Promise<string> {
    const deadline = Date.now() + verificationTimeoutMs;
    let blockName = namespacedBlock(this.readBlock(position).name);

    while (!matches(blockName) && Date.now() < deadline) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, verificationPollMs);
      });
      blockName = namespacedBlock(this.readBlock(position).name);
    }

    return blockName;
  }
}
