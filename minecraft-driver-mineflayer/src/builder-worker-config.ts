import type {
  WorldRegion,
} from "@mineagents/minecraft-adapter";

import {
  parseMineflayerObserverConfig,
  type MineflayerObserverConfig,
} from "./config.js";

import {
  MineflayerDriverError,
} from "./errors.js";

export const builderWorkerApprovalPhrase =
  "I_APPROVE_BUILDER_WRITES_TO_THE_DISPOSABLE_WORLD";

export interface BuilderWorkerConfig {
  connection: MineflayerObserverConfig;

  agentId: string;

  pollIntervalMs: number;

  allowedRegion: WorldRegion;

  allowedPlaceBlocks: readonly string[];

  maxPlacementsPerTask: number;
}

const namespacedPattern =
  /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

const integer = (
  value: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number => {
  const parsed =
    value === undefined
      ? fallback
      : Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      `${name} must be an integer between ${min} and ${max}.`,
    );
  }

  return parsed;
};

const text = (
  value: string | undefined,
  fallback: string,
  name: string,
): string => {
  const result =
    (value ?? fallback).trim();

  if (!result) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      `${name} must not be empty.`,
    );
  }

  return result;
};

const coordinateTriple = (
  value: string | undefined,
  name: string,
): {
  x: number;
  y: number;
  z: number;
} => {
  const parts =
    (value ?? "")
      .split(",")
      .map((item) => item.trim());

  if (parts.length !== 3) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      `${name} must use x,y,z.`,
    );
  }

  const values =
    parts.map(Number);

  if (
    !values.every(
      Number.isSafeInteger,
    )
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      `${name} coordinates must be safe integers.`,
    );
  }

  const [
    x,
    y,
    z,
  ] = values;

  if (
    x === undefined ||
    y === undefined ||
    z === undefined
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      `${name} is invalid.`,
    );
  }

  return {
    x,
    y,
    z,
  };
};

export const parseBuilderWorkerConfig = (
  environment:
    NodeJS.ProcessEnv =
      process.env,
): BuilderWorkerConfig => {
  if (
    environment.BUILDER_WRITE_APPROVAL !==
    builderWorkerApprovalPhrase
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      `BUILDER_WRITE_APPROVAL must equal '${builderWorkerApprovalPhrase}'.`,
    );
  }

  const connection =
    parseMineflayerObserverConfig(
      environment,
    );

  const dimension =
    text(
      environment
        .BUILDER_ALLOWED_DIMENSION,

      "minecraft:overworld",

      "BUILDER_ALLOWED_DIMENSION",
    );

  if (
    !/^minecraft:[a-z0-9_./-]+$/.test(
      dimension,
    )
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "BUILDER_ALLOWED_DIMENSION must be a namespaced dimension.",
    );
  }

  const min =
    coordinateTriple(
      environment
        .BUILDER_ALLOWED_MIN,

      "BUILDER_ALLOWED_MIN",
    );

  const max =
    coordinateTriple(
      environment
        .BUILDER_ALLOWED_MAX,

      "BUILDER_ALLOWED_MAX",
    );

  if (
    min.x > max.x ||
    min.y > max.y ||
    min.z > max.z
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "Builder allowed region minimum must not exceed maximum.",
    );
  }

  const allowedPlaceBlocks =
    text(
      environment
        .BUILDER_ALLOWED_BLOCKS,

      "minecraft:oak_log",

      "BUILDER_ALLOWED_BLOCKS",
    )
      .split(",")
      .map(
        (block) =>
          block.trim(),
      )
      .filter(Boolean);

  if (
    allowedPlaceBlocks.length === 0 ||
    !allowedPlaceBlocks.every(
      (block) =>
        namespacedPattern.test(
          block,
        ),
    )
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "BUILDER_ALLOWED_BLOCKS must contain comma-separated namespaced block identifiers.",
    );
  }

  return {
    connection,

    agentId:
      text(
        environment.AGENT_ID,
        "builder-1",
        "AGENT_ID",
      ),

    pollIntervalMs:
      integer(
        environment
          .AGENT_POLL_INTERVAL_MS,

        3_000,

        "AGENT_POLL_INTERVAL_MS",

        500,

        60_000,
      ),

    allowedRegion: {
      dimension,
      min,
      max,
    },

    allowedPlaceBlocks,

    maxPlacementsPerTask:
      integer(
        environment
          .BUILDER_MAX_PLACEMENTS_PER_TASK,

        256,

        "BUILDER_MAX_PLACEMENTS_PER_TASK",

        1,

        1_024,
      ),
  };
};