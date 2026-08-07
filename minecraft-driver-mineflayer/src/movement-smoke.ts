import type {
  MinecraftBlockSnapshot,
  MinecraftDriver,
  WorldPosition,
  WorldRegion,
} from "@mineagents/minecraft-adapter";
import { MineflayerDriverError } from "./errors.js";

export interface MovementSmokeOptions {
  searchRadius?: number;
  horizontalMargin?: number;
  verticalMargin?: number;
}

export interface MovementSmokeResult {
  origin: WorldPosition;
  target: WorldPosition;
  reached: WorldPosition;
  returned: WorldPosition;
  attempts: number;
  blocksUnchanged: true;
}

const samePosition = (left: WorldPosition, right: WorldPosition): boolean =>
  left.dimension === right.dimension &&
  left.x === right.x &&
  left.y === right.y &&
  left.z === right.z;

const reasonText = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      `${label} must be a positive safe integer.`,
    );
  }
};

const movementRegion = (
  origin: WorldPosition,
  horizontalMargin: number,
  verticalMargin: number,
): WorldRegion => ({
  dimension: origin.dimension,
  min: {
    x: origin.x - horizontalMargin,
    y: origin.y - verticalMargin,
    z: origin.z - horizontalMargin,
  },
  max: {
    x: origin.x + horizontalMargin,
    y: origin.y + verticalMargin,
    z: origin.z + horizontalMargin,
  },
});

const candidatePositions = (
  origin: WorldPosition,
  searchRadius: number,
): WorldPosition[] => {
  const candidates: WorldPosition[] = [];
  for (let radius = 1; radius <= searchRadius; radius += 1) {
    for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
      for (let zOffset = -radius; zOffset <= radius; zOffset += 1) {
        if (Math.max(Math.abs(xOffset), Math.abs(zOffset)) !== radius) {
          continue;
        }
        for (const yOffset of [0, 1, -1]) {
          candidates.push({
            dimension: origin.dimension,
            x: origin.x + xOffset,
            y: origin.y + yOffset,
            z: origin.z + zOffset,
          });
        }
      }
    }
  }
  return candidates;
};

const isWalkableTarget = async (
  driver: MinecraftDriver,
  target: WorldPosition,
): Promise<boolean> => {
  const [floor, feet, head] = await Promise.all([
    driver.inspectBlock({ ...target, y: target.y - 1 }),
    driver.inspectBlock({ ...target }),
    driver.inspectBlock({ ...target, y: target.y + 1 }),
  ]);
  return floor.solid && !feet.solid && !head.solid;
};

const observedPositions = (
  origin: WorldPosition,
  target: WorldPosition,
): WorldPosition[] => [
  { ...origin, y: origin.y - 1 },
  { ...origin },
  { ...origin, y: origin.y + 1 },
  { ...target, y: target.y - 1 },
  { ...target },
  { ...target, y: target.y + 1 },
];

const captureBlocks = async (
  driver: MinecraftDriver,
  positions: readonly WorldPosition[],
): Promise<MinecraftBlockSnapshot[]> =>
  Promise.all(positions.map((position) => driver.inspectBlock({ ...position })));

const blocksMatch = (
  before: readonly MinecraftBlockSnapshot[],
  after: readonly MinecraftBlockSnapshot[],
): boolean =>
  before.length === after.length &&
  before.every((snapshot, index) => {
    const current = after[index];
    return (
      current !== undefined &&
      samePosition(snapshot.position, current.position) &&
      snapshot.name === current.name &&
      snapshot.solid === current.solid
    );
  });

const returnToOrigin = async (
  driver: MinecraftDriver,
  origin: WorldPosition,
  region: WorldRegion,
): Promise<WorldPosition> => {
  await driver.moveTo(origin, [region]);
  const returned = (await driver.getState()).position;
  if (!samePosition(returned, origin)) {
    throw new MineflayerDriverError(
      "MOVEMENT_FAILED",
      "The smoke-test bot did not return to its exact origin.",
    );
  }
  return returned;
};

export const runBoundedMovementSmoke = async (
  driver: MinecraftDriver,
  options: MovementSmokeOptions = {},
): Promise<MovementSmokeResult> => {
  const searchRadius = options.searchRadius ?? 4;
  const horizontalMargin = options.horizontalMargin ?? searchRadius + 4;
  const verticalMargin = options.verticalMargin ?? 4;
  assertPositiveInteger(searchRadius, "Movement smoke search radius");
  assertPositiveInteger(horizontalMargin, "Movement smoke horizontal margin");
  assertPositiveInteger(verticalMargin, "Movement smoke vertical margin");

  const origin = { ...(await driver.getState()).position };
  const region = movementRegion(origin, horizontalMargin, verticalMargin);
  const failures: string[] = [];
  let attempts = 0;

  for (const target of candidatePositions(origin, searchRadius)) {
    if (!(await isWalkableTarget(driver, target))) {
      continue;
    }

    attempts += 1;
    const positions = observedPositions(origin, target);
    const before = await captureBlocks(driver, positions);
    try {
      await driver.moveTo(target, [region]);
    } catch (error) {
      failures.push(reasonText(error));
      const current = (await driver.getState()).position;
      if (!samePosition(current, origin)) {
        try {
          await returnToOrigin(driver, origin, region);
        } catch (recoveryError) {
          throw new MineflayerDriverError(
            "MOVEMENT_FAILED",
            `Movement smoke recovery failed: ${reasonText(recoveryError)}`,
          );
        }
      }
      continue;
    }

    const reached = { ...(await driver.getState()).position };
    if (!samePosition(reached, target)) {
      throw new MineflayerDriverError(
        "MOVEMENT_FAILED",
        "The smoke-test bot did not reach the exact selected target.",
      );
    }

    const returned = await returnToOrigin(driver, origin, region);
    const after = await captureBlocks(driver, positions);
    if (!blocksMatch(before, after)) {
      throw new MineflayerDriverError(
        "MOVEMENT_FAILED",
        "Observed blocks changed during the bounded movement smoke test.",
      );
    }

    return {
      origin,
      target: { ...target },
      reached,
      returned,
      attempts,
      blocksUnchanged: true,
    };
  }

  throw new MineflayerDriverError(
    "MOVEMENT_FAILED",
    failures.length === 0
      ? "No walkable target was found near the smoke-test spawn."
      : `No walkable target completed the smoke test: ${failures.join(" | ")}`,
  );
};
