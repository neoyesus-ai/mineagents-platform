import { EventEmitter } from "node:events";

import type {
  MinecraftAgentState,
  MinecraftBlockSearch,
  MinecraftBlockSnapshot,
  MinecraftDriver,
  WorldPosition,
  WorldRegion,
} from "@mineagents/minecraft-adapter";

import {
  createBot,
  type Bot,
} from "mineflayer";

import pathfinderPackage from "mineflayer-pathfinder";
import { Vec3 } from "vec3";

import {
  BoundedMovementController,
} from "./bounded-movement.js";

import {
  BoundedWriteController,
} from "./bounded-writes.js";

import {
  MineflayerDriverError,
} from "./errors.js";

const {
  pathfinder,
} = pathfinderPackage;

type MutatingOperation =
  | "movement"
  | "block placement"
  | "block breaking";

export interface MineflayerConnectionOptions {
  host: string;
  port: number;
  username: string;
  version: string;
  connectTimeoutMs?: number;
  chunksTimeoutMs?: number;
  movementTimeoutMs?: number;
}

export interface MineflayerConnectionDependencies {
  createBot: typeof createBot;
  pathfinderPlugin?: typeof pathfinder;
}

const namespacedDimension = (
  dimension: string,
): string =>
  dimension.includes(":")
    ? dimension
    : `minecraft:${dimension}`;

const namespacedBlock = (
  name: string,
): string =>
  name.includes(":")
    ? name
    : `minecraft:${name}`;

const blockNamePattern =
  /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

const reasonText = (
  reason: unknown,
): string => {
  if (
    reason instanceof Error
  ) {
    return reason.message;
  }

  if (
    typeof reason ===
    "string"
  ) {
    return reason;
  }

  try {
    return JSON.stringify(
      reason,
    );
  } catch {
    return "Unknown connection error";
  }
};

const withTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> =>
  new Promise<T>(
    (
      resolve,
      reject,
    ) => {
      const timeout =
        setTimeout(
          () => {
            reject(
              new MineflayerDriverError(
                "CONNECTION_FAILED",
                message,
              ),
            );
          },
          timeoutMs,
        );

      operation.then(
        (value) => {
          clearTimeout(
            timeout,
          );

          resolve(
            value,
          );
        },

        (
          error:
            unknown,
        ) => {
          clearTimeout(
            timeout,
          );

          reject(
            error,
          );
        },
      );
    },
  );

const waitForSpawn = async (
  bot: Bot,
  timeoutMs: number,
): Promise<void> => {
  const events =
    bot as unknown as EventEmitter;

  await withTimeout(
    new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const cleanup =
          (): void => {
            events.off(
              "spawn",
              onSpawn,
            );

            events.off(
              "error",
              onError,
            );

            events.off(
              "kicked",
              onKicked,
            );

            events.off(
              "end",
              onEnd,
            );
          };

        const succeed =
          (): void => {
            cleanup();

            resolve();
          };

        const fail = (
          reason:
            unknown,
        ): void => {
          cleanup();

          reject(
            new MineflayerDriverError(
              "CONNECTION_FAILED",

              `Mineflayer connection failed: ${reasonText(
                reason,
              )}`,
            ),
          );
        };

        const onSpawn =
          (): void =>
            succeed();

        const onError = (
          error:
            unknown,
        ): void =>
          fail(
            error,
          );

        const onKicked = (
          reason:
            unknown,
        ): void =>
          fail(
            reason,
          );

        const onEnd = (
          reason:
            unknown,
        ): void =>
          fail(
            reason,
          );

        events.once(
          "spawn",
          onSpawn,
        );

        events.once(
          "error",
          onError,
        );

        events.once(
          "kicked",
          onKicked,
        );

        events.once(
          "end",
          onEnd,
        );
      },
    ),

    timeoutMs,

    "Timed out while waiting for Mineflayer to spawn.",
  );
};

const validateConnectionOptions = (
  options:
    MineflayerConnectionOptions,
): void => {
  if (
    options.host
      .trim()
      .length ===
      0 ||

    options.username
      .trim()
      .length ===
      0 ||

    options.version
      .trim()
      .length ===
      0 ||

    !Number.isSafeInteger(
      options.port,
    ) ||

    options.port <
      1 ||

    options.port >
      65_535
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",

      "Mineflayer requires a host, username, version and valid TCP port.",
    );
  }

  if (
    options.movementTimeoutMs !==
      undefined &&

    (
      !Number.isSafeInteger(
        options.movementTimeoutMs,
      ) ||

      options.movementTimeoutMs <
        1
    )
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",

      "Mineflayer movement timeout must be a positive safe integer.",
    );
  }
};

export class MineflayerDriver
  implements MinecraftDriver
{
  private connected =
    true;

  private lastPosition:
    WorldPosition;

  private readonly disconnectPromise:
    Promise<string>;

  private readonly movementController:
    BoundedMovementController;

  private readonly writeController:
    BoundedWriteController;

  private operationInProgress:
    MutatingOperation |
    undefined;

  constructor(
    private readonly bot:
      Bot,

    movementTimeoutMs =
      30_000,
  ) {
    this.lastPosition =
      this.readPosition();

    this.writeController =
      new BoundedWriteController(
        bot,
      );

    this.movementController =
      new BoundedMovementController(
        bot,
        movementTimeoutMs,
      );

    this.disconnectPromise =
      new Promise(
        (
          resolve,
        ) => {
          bot.once(
            "end",
            (
              reason,
            ) => {
              this.connected =
                false;

              resolve(
                reason,
              );
            },
          );
        },
      );
  }

  async getState():
    Promise<MinecraftAgentState>
  {
    if (
      this.connected &&
      this.bot.entity
    ) {
      this.lastPosition =
        this.readPosition();
    }

    return {
      connected:
        this.connected,

      position: {
        ...this.lastPosition,
      },
    };
  }

  hasInventoryItem(
    blockName: string,
  ): boolean {
    this.assertConnected();

    if (
      !blockNamePattern.test(
        blockName,
      )
    ) {
      throw new MineflayerDriverError(
        "INVALID_WRITE_REQUEST",

        "Inventory checks require a namespaced Minecraft block identifier.",
      );
    }

    return this.bot
      .inventory
      .items()
      .some(
        (
          item,
        ) =>
          namespacedBlock(
            item.name,
          ) ===
          blockName,
      );
  }

  async inspectBlock(
    position:
      WorldPosition,
  ): Promise<MinecraftBlockSnapshot> {
    this.assertConnected();

    const currentDimension =
      namespacedDimension(
        this.bot.game
          .dimension,
      );

    if (
      position.dimension !==
      currentDimension
    ) {
      throw new MineflayerDriverError(
        "DIMENSION_MISMATCH",

        `The bot is in '${currentDimension}', not '${position.dimension}'.`,
      );
    }

    const block =
      this.bot.blockAt(
        new Vec3(
          position.x,
          position.y,
          position.z,
        ),

        false,
      );

    if (
      !block
    ) {
      throw new MineflayerDriverError(
        "CHUNK_NOT_LOADED",

        "The requested block is outside the chunks currently loaded by the bot.",
      );
    }

    return {
      position: {
        ...position,
      },

      name:
        namespacedBlock(
          block.name,
        ),

      solid:
        block.boundingBox !==
        "empty",
    };
  }

  async findBlocks(
    search:
      MinecraftBlockSearch,
  ): Promise<
    readonly WorldPosition[]
  > {
    this.assertConnected();

    if (
      typeof search.blockName !==
        "string" ||

      !blockNamePattern.test(
        search.blockName,
      )
    ) {
      throw new MineflayerDriverError(
        "INVALID_WRITE_REQUEST",

        "Block discovery requires a namespaced Minecraft block identifier.",
      );
    }

    if (
      !Number.isSafeInteger(
        search.maxDistance,
      ) ||

      search.maxDistance <
        1 ||

      search.maxDistance >
        128
    ) {
      throw new MineflayerDriverError(
        "INVALID_CONFIG",

        "Block discovery maxDistance must be between 1 and 128.",
      );
    }

    if (
      !Number.isSafeInteger(
        search.maxResults,
      ) ||

      search.maxResults <
        1 ||

      search.maxResults >
        256
    ) {
      throw new MineflayerDriverError(
        "INVALID_CONFIG",

        "Block discovery maxResults must be between 1 and 256.",
      );
    }

    const simpleName =
      search.blockName.replace(
        /^minecraft:/,
        "",
      );

    const registryBlock =
      this.bot.registry
        .blocksByName[
          simpleName
        ];

    if (
      !registryBlock
    ) {
      throw new MineflayerDriverError(
        "INVALID_WRITE_REQUEST",

        `Unknown Minecraft block '${search.blockName}'.`,
      );
    }

    const currentDimension =
      namespacedDimension(
        this.bot.game
          .dimension,
      );

    const positions =
      this.bot.findBlocks({
        point:
          this.bot.entity
            .position,

        matching:
          registryBlock.id,

        maxDistance:
          search.maxDistance,

        count:
          search.maxResults,
      });

    return positions.map(
      (
        position,
      ): WorldPosition => ({
        dimension:
          currentDimension,

        x:
          Math.floor(
            position.x,
          ),

        y:
          Math.floor(
            position.y,
          ),

        z:
          Math.floor(
            position.z,
          ),
      }),
    );
  }

  async moveTo(
    target:
      WorldPosition,

    allowedRegions:
      readonly WorldRegion[],
  ): Promise<void> {
    this.assertConnected();

    await this.runExclusive(
      "movement",

      async () => {
        await this
          .movementController
          .moveTo(
            target,
            allowedRegions,
          );

        this.lastPosition =
          this.readPosition();
      },
    );
  }

  async placeBlock(
    position:
      WorldPosition,

    blockName:
      string,

    expectedCurrentBlockNames:
      readonly string[],
  ): Promise<void> {
    this.assertConnected();

    await this.runExclusive(
      "block placement",

      () =>
        this.writeController
          .placeBlock(
            position,
            blockName,
            expectedCurrentBlockNames,
          ),
    );
  }

  async breakBlock(
    position:
      WorldPosition,

    expectedBlockName:
      string,
  ): Promise<void> {
    this.assertConnected();

    await this.runExclusive(
      "block breaking",

      () =>
        this.writeController
          .breakBlock(
            position,
            expectedBlockName,
          ),
    );
  }

  waitForDisconnect():
    Promise<string>
  {
    return this
      .disconnectPromise;
  }

  close(
    reason =
      "MineAgents observer shutdown",
  ): void {
    if (
      this.connected
    ) {
      this
        .movementController
        .stop();

      this.bot.quit(
        reason,
      );
    }
  }

  private readPosition():
    WorldPosition
  {
    const position =
      this.bot.entity
        .position;

    return {
      dimension:
        namespacedDimension(
          this.bot.game
            .dimension,
        ),

      x:
        Math.floor(
          position.x,
        ),

      y:
        Math.floor(
          position.y,
        ),

      z:
        Math.floor(
          position.z,
        ),
    };
  }

  private assertConnected():
    void
  {
    if (
      !this.connected ||
      !this.bot.entity
    ) {
      throw new MineflayerDriverError(
        "NOT_CONNECTED",

        "Mineflayer is not connected.",
      );
    }
  }

  private async runExclusive<T>(
    operation:
      MutatingOperation,

    execute:
      () => Promise<T>,
  ): Promise<T> {
    if (
      this.operationInProgress
    ) {
      throw new MineflayerDriverError(
        "OPERATION_IN_PROGRESS",

        `Cannot start ${operation} while ${this.operationInProgress} is in progress.`,
      );
    }

    this.operationInProgress =
      operation;

    try {
      return await execute();
    } finally {
      this.operationInProgress =
        undefined;
    }
  }
}

export const connectMineflayerDriver =
  async (
    options:
      MineflayerConnectionOptions,

    dependencies:
      MineflayerConnectionDependencies = {
        createBot,
      },
  ): Promise<MineflayerDriver> => {
    validateConnectionOptions(
      options,
    );

    const connectTimeoutMs =
      options.connectTimeoutMs ??
      30_000;

    const chunksTimeoutMs =
      options.chunksTimeoutMs ??
      30_000;

    const movementTimeoutMs =
      options.movementTimeoutMs ??
      30_000;

    const bot =
      dependencies.createBot({
        host:
          options.host,

        port:
          options.port,

        username:
          options.username,

        version:
          options.version,

        auth:
          "offline",

        hideErrors:
          true,

        logErrors:
          false,
      });

    try {
      bot.loadPlugin(
        dependencies.pathfinderPlugin ??
          pathfinder,
      );

      await waitForSpawn(
        bot,
        connectTimeoutMs,
      );

      await withTimeout(
        bot.waitForChunksToLoad(),

        chunksTimeoutMs,

        "Timed out while waiting for Mineflayer chunks to load.",
      );

      return new MineflayerDriver(
        bot,
        movementTimeoutMs,
      );
    } catch (
      error
    ) {
      bot.end(
        "MineAgents connection failed",
      );

      if (
        error instanceof
        MineflayerDriverError
      ) {
        throw error;
      }

      throw new MineflayerDriverError(
        "CONNECTION_FAILED",

        `Mineflayer connection failed: ${reasonText(
          error,
        )}`,
      );
    }
  };