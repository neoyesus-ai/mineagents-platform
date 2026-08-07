import { EventEmitter } from "node:events";
import type {
  MinecraftAgentState,
  MinecraftBlockSnapshot,
  MinecraftDriver,
  WorldPosition,
  WorldRegion,
} from "@mineagents/minecraft-adapter";
import { createBot, type Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { MineflayerDriverError } from "./errors.js";

export interface MineflayerConnectionOptions {
  host: string;
  port: number;
  username: string;
  version: string;
  connectTimeoutMs?: number;
  chunksTimeoutMs?: number;
}

export interface MineflayerConnectionDependencies {
  createBot: typeof createBot;
}

const namespacedDimension = (dimension: string): string =>
  dimension.includes(":") ? dimension : `minecraft:${dimension}`;

const namespacedBlock = (name: string): string =>
  name.includes(":") ? name : `minecraft:${name}`;

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
    return "Unknown connection error";
  }
};

const withTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new MineflayerDriverError("CONNECTION_FAILED", message));
    }, timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });

const waitForSpawn = async (bot: Bot, timeoutMs: number): Promise<void> => {
  const events = bot as unknown as EventEmitter;

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        events.off("spawn", onSpawn);
        events.off("error", onError);
        events.off("kicked", onKicked);
        events.off("end", onEnd);
      };
      const succeed = (): void => {
        cleanup();
        resolve();
      };
      const fail = (reason: unknown): void => {
        cleanup();
        reject(
          new MineflayerDriverError(
            "CONNECTION_FAILED",
            `Mineflayer connection failed: ${reasonText(reason)}`,
          ),
        );
      };
      const onSpawn = (): void => succeed();
      const onError = (error: unknown): void => fail(error);
      const onKicked = (reason: unknown): void => fail(reason);
      const onEnd = (reason: unknown): void => fail(reason);

      events.once("spawn", onSpawn);
      events.once("error", onError);
      events.once("kicked", onKicked);
      events.once("end", onEnd);
    }),
    timeoutMs,
    "Timed out while waiting for Mineflayer to spawn.",
  );
};

const validateConnectionOptions = (options: MineflayerConnectionOptions): void => {
  if (
    options.host.trim().length === 0 ||
    options.username.trim().length === 0 ||
    options.version.trim().length === 0 ||
    !Number.isSafeInteger(options.port) ||
    options.port < 1 ||
    options.port > 65_535
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "Mineflayer requires a host, username, version and valid TCP port.",
    );
  }
};

export class MineflayerDriver implements MinecraftDriver {
  private connected = true;
  private lastPosition: WorldPosition;
  private readonly disconnectPromise: Promise<string>;

  constructor(private readonly bot: Bot) {
    this.lastPosition = this.readPosition();
    this.disconnectPromise = new Promise((resolve) => {
      bot.once("end", (reason) => {
        this.connected = false;
        resolve(reason);
      });
    });
  }

  async getState(): Promise<MinecraftAgentState> {
    if (this.connected && this.bot.entity) {
      this.lastPosition = this.readPosition();
    }

    return {
      connected: this.connected,
      position: { ...this.lastPosition },
    };
  }

  async inspectBlock(position: WorldPosition): Promise<MinecraftBlockSnapshot> {
    this.assertConnected();
    const currentDimension = namespacedDimension(this.bot.game.dimension);
    if (position.dimension !== currentDimension) {
      throw new MineflayerDriverError(
        "DIMENSION_MISMATCH",
        `The bot is in '${currentDimension}', not '${position.dimension}'.`,
      );
    }

    const block = this.bot.blockAt(new Vec3(position.x, position.y, position.z), false);
    if (!block) {
      throw new MineflayerDriverError(
        "CHUNK_NOT_LOADED",
        "The requested block is outside the chunks currently loaded by the bot.",
      );
    }

    return {
      position: { ...position },
      name: namespacedBlock(block.name),
      solid: block.boundingBox !== "empty",
    };
  }

  async moveTo(
    target: WorldPosition,
    allowedRegions: readonly WorldRegion[],
  ): Promise<void> {
    void target;
    void allowedRegions;
    this.unsupported("Movement");
  }

  async placeBlock(
    position: WorldPosition,
    blockName: string,
    expectedCurrentBlockNames: readonly string[],
  ): Promise<void> {
    void position;
    void blockName;
    void expectedCurrentBlockNames;
    this.unsupported("Block placement");
  }

  async breakBlock(
    position: WorldPosition,
    expectedBlockName: string,
  ): Promise<void> {
    void position;
    void expectedBlockName;
    this.unsupported("Block breaking");
  }

  waitForDisconnect(): Promise<string> {
    return this.disconnectPromise;
  }

  close(reason = "MineAgents observer shutdown"): void {
    if (this.connected) {
      this.bot.quit(reason);
    }
  }

  private readPosition(): WorldPosition {
    const position = this.bot.entity.position;
    return {
      dimension: namespacedDimension(this.bot.game.dimension),
      x: Math.floor(position.x),
      y: Math.floor(position.y),
      z: Math.floor(position.z),
    };
  }

  private assertConnected(): void {
    if (!this.connected || !this.bot.entity) {
      throw new MineflayerDriverError("NOT_CONNECTED", "Mineflayer is not connected.");
    }
  }

  private unsupported(operation: string): never {
    this.assertConnected();
    throw new MineflayerDriverError(
      "UNSUPPORTED_OPERATION",
      `${operation} is disabled in the read-only Mineflayer driver.`,
    );
  }
}

export const connectMineflayerDriver = async (
  options: MineflayerConnectionOptions,
  dependencies: MineflayerConnectionDependencies = { createBot },
): Promise<MineflayerDriver> => {
  validateConnectionOptions(options);
  const connectTimeoutMs = options.connectTimeoutMs ?? 30_000;
  const chunksTimeoutMs = options.chunksTimeoutMs ?? 30_000;

  const bot = dependencies.createBot({
    host: options.host,
    port: options.port,
    username: options.username,
    version: options.version,
    auth: "offline",
    hideErrors: true,
    logErrors: false,
  });

  try {
    await waitForSpawn(bot, connectTimeoutMs);
    await withTimeout(
      bot.waitForChunksToLoad(),
      chunksTimeoutMs,
      "Timed out while waiting for Mineflayer chunks to load.",
    );
    return new MineflayerDriver(bot);
  } catch (error) {
    bot.end("MineAgents connection failed");
    if (error instanceof MineflayerDriverError) {
      throw error;
    }
    throw new MineflayerDriverError(
      "CONNECTION_FAILED",
      `Mineflayer connection failed: ${reasonText(error)}`,
    );
  }
};
