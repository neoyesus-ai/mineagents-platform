import {
  isPositionInRegion,
  type WorldPosition,
  type WorldRegion,
} from "@mineagents/minecraft-adapter";

import {
  parseMineflayerObserverConfig,
  type MineflayerObserverConfig,
} from "./config.js";

import {
  MineflayerDriverError,
} from "./errors.js";

export const collectorWorkerApprovalPhrase =
  "I_APPROVE_COLLECTOR_WRITES_TO_THE_DISPOSABLE_WORLD";

export interface CollectorWorkerConfig {
  connection:
    MineflayerObserverConfig;

  agentId:
    string;

  pollIntervalMs:
    number;

  allowedRegion:
    WorldRegion;

  allowedBreakBlocks:
    readonly string[];

  maxActionsPerTask:
    number;

  handoffPosition?:
    WorldPosition;

  handoffPickupTimeoutMs:
    number;
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
      : Number(
          value,
        );

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
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
    (
      value ??
      fallback
    ).trim();

  if (
    !result
  ) {
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
    (
      value ??
      ""
    )
      .split(
        ",",
      )
      .map(
        (
          item,
        ) =>
          item.trim(),
      );

  if (
    parts.length !==
    3
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      `${name} must use x,y,z.`,
    );
  }

  const values =
    parts.map(
      Number,
    );

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

const optionalHandoffPosition = (
  environment:
    NodeJS.ProcessEnv,

  dimension:
    string,

  allowedRegion:
    WorldRegion,
): WorldPosition | undefined => {
  const raw =
    environment
      .COLLECTOR_HANDOFF_POSITION;

  if (
    raw === undefined ||
    raw.trim()
      .length ===
      0
  ) {
    return undefined;
  }

  const coordinates =
    coordinateTriple(
      raw,
      "COLLECTOR_HANDOFF_POSITION",
    );

  const position:
    WorldPosition = {
      dimension,
      ...coordinates,
    };

  if (
    !isPositionInRegion(
      position,
      allowedRegion,
    )
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "COLLECTOR_HANDOFF_POSITION must be inside the collector allowed region.",
    );
  }

  return position;
};

export const parseCollectorWorkerConfig = (
  environment:
    NodeJS.ProcessEnv =
      process.env,
): CollectorWorkerConfig => {
  if (
    environment
      .COLLECTOR_WRITE_APPROVAL !==
    collectorWorkerApprovalPhrase
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      `COLLECTOR_WRITE_APPROVAL must equal '${collectorWorkerApprovalPhrase}'.`,
    );
  }

  const connection =
    parseMineflayerObserverConfig(
      environment,
    );

  const dimension =
    text(
      environment
        .COLLECTOR_ALLOWED_DIMENSION,

      "minecraft:overworld",

      "COLLECTOR_ALLOWED_DIMENSION",
    );

  if (
    !/^minecraft:[a-z0-9_./-]+$/.test(
      dimension,
    )
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "COLLECTOR_ALLOWED_DIMENSION must be a namespaced dimension.",
    );
  }

  const min =
    coordinateTriple(
      environment
        .COLLECTOR_ALLOWED_MIN,

      "COLLECTOR_ALLOWED_MIN",
    );

  const max =
    coordinateTriple(
      environment
        .COLLECTOR_ALLOWED_MAX,

      "COLLECTOR_ALLOWED_MAX",
    );

  if (
    min.x >
      max.x ||
    min.y >
      max.y ||
    min.z >
      max.z
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "Collector allowed region minimum must not exceed maximum.",
    );
  }

  const allowedRegion:
    WorldRegion = {
      dimension,
      min,
      max,
    };

  const allowedBreakBlocks =
    text(
      environment
        .COLLECTOR_ALLOWED_BLOCKS,

      "minecraft:oak_log",

      "COLLECTOR_ALLOWED_BLOCKS",
    )
      .split(
        ",",
      )
      .map(
        (
          block,
        ) =>
          block.trim(),
      )
      .filter(
        Boolean,
      );

  if (
    allowedBreakBlocks.length ===
      0 ||
    !allowedBreakBlocks.every(
      (
        block,
      ) =>
        namespacedPattern.test(
          block,
        ),
    )
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "COLLECTOR_ALLOWED_BLOCKS must contain comma-separated namespaced block identifiers.",
    );
  }

  const handoffPosition =
    optionalHandoffPosition(
      environment,
      dimension,
      allowedRegion,
    );

  return {
    connection,

    agentId:
      text(
        environment
          .AGENT_ID,

        "collector-1",

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

    allowedRegion,

    allowedBreakBlocks,

    maxActionsPerTask:
      integer(
        environment
          .COLLECTOR_MAX_ACTIONS_PER_TASK,

        64,

        "COLLECTOR_MAX_ACTIONS_PER_TASK",

        1,

        256,
      ),

    handoffPosition,

    handoffPickupTimeoutMs:
      integer(
        environment
          .COLLECTOR_HANDOFF_PICKUP_TIMEOUT_MS,

        8_000,

        "COLLECTOR_HANDOFF_PICKUP_TIMEOUT_MS",

        500,

        60_000,
      ),
  };
};