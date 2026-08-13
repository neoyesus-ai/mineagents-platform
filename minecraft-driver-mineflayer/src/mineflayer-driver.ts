import {
  EventEmitter,
} from "node:events";

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

import pathfinderPackage
  from "mineflayer-pathfinder";

import {
  Vec3,
} from "vec3";

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
  | "block breaking"
  | "inventory drop";

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
  createBot:
    typeof createBot;

  pathfinderPlugin?:
    typeof pathfinder;
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

const MAX_INVENTORY_DROP_QUANTITY =
  256;

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

const withTimeout =
  async <T>(
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

const waitForSpawn =
  async (
    bot: Bot,
    timeoutMs: number,
  ): Promise<void> => {
    const events =
      bot as unknown as
        EventEmitter;

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
    return (
      this.getInventoryCount(
        blockName,
      ) >
      0
    );
  }

  getInventoryCount(
    itemName: string,
  ): number {
    this.assertConnected();

    this.assertInventoryItemName(
      itemName,
      "Inventory counts",
    );

    return this.bot
      .inventory
      .items()
      .filter(
        (
          item,
        ) =>
          namespacedBlock(
            item.name,
          ) ===
          itemName,
      )
      .reduce(
        (
          total,
          item,
        ) =>
          total +
          item.count,

        0,
      );
  }

  findNearbyDroppedItems(
    itemName: string,
    origins:
      readonly WorldPosition[],
    maxDistance = 8,
  ): readonly WorldPosition[] {
    this.assertConnected();

    this.assertInventoryItemName(
      itemName,
      "Dropped item discovery",
    );

    if (
      !Array.isArray(
        origins,
      ) ||
      origins.length ===
        0
    ) {
      throw new MineflayerDriverError(
        "INVALID_WRITE_REQUEST",

        "Dropped item discovery requires at least one origin position.",
      );
    }

    if (
      !Number.isFinite(
        maxDistance,
      ) ||
      maxDistance <=
        0 ||
      maxDistance >
        32
    ) {
      throw new MineflayerDriverError(
        "INVALID_WRITE_REQUEST",

        "Dropped item discovery maxDistance must be greater than 0 and at most 32.",
      );
    }

    const currentDimension =
      namespacedDimension(
        this.bot.game
          .dimension,
      );

    for (
      const origin
      of origins
    ) {
      if (
        origin.dimension !==
        currentDimension
      ) {
        throw new MineflayerDriverError(
          "DIMENSION_MISMATCH",

          `The bot is in '${currentDimension}', not '${origin.dimension}'.`,
        );
      }
    }

    const maxDistanceSquared =
      maxDistance *
      maxDistance;

    const candidates:
      {
        position:
          WorldPosition;

        distanceSquared:
          number;
      }[] = [];

    for (
      const entity
      of Object.values(
        this.bot.entities,
      )
    ) {
      const droppedItem =
        entity.getDroppedItem();

      if (
        !droppedItem ||
        namespacedBlock(
          droppedItem.name,
        ) !==
          itemName
      ) {
        continue;
      }

      let nearestDistanceSquared =
        Number.POSITIVE_INFINITY;

      for (
        const origin
        of origins
      ) {
        const dx =
          entity.position.x -
          (
            origin.x +
            0.5
          );

        const dy =
          entity.position.y -
          origin.y;

        const dz =
          entity.position.z -
          (
            origin.z +
            0.5
          );

        const distanceSquared =
          dx * dx +
          dy * dy +
          dz * dz;

        nearestDistanceSquared =
          Math.min(
            nearestDistanceSquared,
            distanceSquared,
          );
      }

      if (
        nearestDistanceSquared >
        maxDistanceSquared
      ) {
        continue;
      }

      candidates.push({
        position: {
          dimension:
            currentDimension,

          x:
            Math.floor(
              entity.position.x,
            ),

          y:
            Math.floor(
              entity.position.y,
            ),

          z:
            Math.floor(
              entity.position.z,
            ),
        },

        distanceSquared:
          nearestDistanceSquared,
      });
    }

    candidates.sort(
      (
        left,
        right,
      ) =>
        left.distanceSquared -
        right.distanceSquared,
    );

    const unique:
      WorldPosition[] = [];

    const seen =
      new Set<string>();

    for (
      const candidate
      of candidates
    ) {
      const key =
        `${candidate.position.dimension}:${candidate.position.x}:${candidate.position.y}:${candidate.position.z}`;

      if (
        seen.has(
          key,
        )
      ) {
        continue;
      }

      seen.add(
        key,
      );

      unique.push({
        ...candidate.position,
      });
    }

    return unique;
  }

  async dropInventoryItem(
    itemName: string,
    quantity: number,
  ): Promise<void> {
    this.assertConnected();

    this.assertInventoryItemName(
      itemName,
      "Inventory drops",
    );

    if (
      !Number.isSafeInteger(
        quantity,
      ) ||
      quantity <
        1 ||
      quantity >
        MAX_INVENTORY_DROP_QUANTITY
    ) {
      throw new MineflayerDriverError(
        "INVALID_WRITE_REQUEST",

        `Inventory drop quantity must be an integer between 1 and ${MAX_INVENTORY_DROP_QUANTITY}.`,
      );
    }

    const before =
      this.getInventoryCount(
        itemName,
      );

    if (
      before <
      quantity
    ) {
      throw new MineflayerDriverError(
        "ITEM_NOT_AVAILABLE",

        `Mineflayer inventory contains ${before} ${itemName}, but ${quantity} were requested.`,
      );
    }

    const inventoryItem =
      this.bot
        .inventory
        .items()
        .find(
          (
            item,
          ) =>
            namespacedBlock(
              item.name,
            ) ===
            itemName,
        );

    if (
      !inventoryItem
    ) {
      throw new MineflayerDriverError(
        "ITEM_NOT_AVAILABLE",

        `Mineflayer inventory does not contain ${itemName}.`,
      );
    }

    await this.runExclusive(
      "inventory drop",

      async () => {
        try {
          await this.bot.toss(
            inventoryItem.type,
            inventoryItem.metadata ??
              null,
            quantity,
          );
        } catch (
          error
        ) {
          throw new MineflayerDriverError(
            "WRITE_FAILED",

            `Mineflayer inventory drop failed: ${reasonText(
              error,
            )}`,
          );
        }

        const after =
          this.getInventoryCount(
            itemName,
          );

        const expectedAfter =
          before -
          quantity;

        if (
          after !==
          expectedAfter
        ) {
          throw new MineflayerDriverError(
            "WRITE_VERIFICATION_FAILED",

            `Expected inventory count for ${itemName} to decrease from ${before} to ${expectedAfter}, found ${after}.`,
          );
        }
      },
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

  private assertInventoryItemName(
    itemName: string,
    operation: string,
  ): void {
    if (
      typeof itemName !==
        "string" ||
      !blockNamePattern.test(
        itemName,
      )
    ) {
      throw new MineflayerDriverError(
        "INVALID_WRITE_REQUEST",

        `${operation} require a namespaced Minecraft item identifier.`,
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
        dependencies
          .pathfinderPlugin ??
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