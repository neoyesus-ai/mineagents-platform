import { createJsonLogger } from "@mineagents/observability";
import { parseMineflayerObserverConfig } from "./config.js";
import { sendCoordinatorHeartbeat } from "./coordinator-heartbeat.js";
import {
  connectMineflayerDriver,
  type MineflayerDriver,
} from "./mineflayer-driver.js";

const logger = createJsonLogger({ service: "mineflayer-observer" });
const config = parseMineflayerObserverConfig();
let driver: MineflayerDriver | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;
let heartbeatInFlight = false;
let shuttingDown = false;

const heartbeat = async (): Promise<void> => {
  if (heartbeatInFlight) {
    return;
  }
  heartbeatInFlight = true;
  try {
    await sendCoordinatorHeartbeat(config.coordinatorBaseUrl, {
      id: "mineflayer-observer",
      name: config.username,
      role: "observer",
    });
  } catch (error) {
    logger.error("coordinator.heartbeat_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    heartbeatInFlight = false;
  }
};

const shutdown = (signal: string): void => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  logger.info("service.stopping", { signal });
  driver?.close();
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

const main = async (): Promise<void> => {
  driver = await connectMineflayerDriver({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version,
    connectTimeoutMs: config.connectTimeoutMs,
    chunksTimeoutMs: config.chunksTimeoutMs,
  });

  const state = await driver.getState();
  logger.info("minecraft.connected", {
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version,
    position: state.position,
    mode: "read-only",
  });

  await heartbeat();
  heartbeatTimer = setInterval(() => {
    void heartbeat();
  }, config.heartbeatIntervalMs);

  const reason = await driver.waitForDisconnect();
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  logger.info("minecraft.disconnected", { reason, expected: shuttingDown });
  if (!shuttingDown) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  logger.error("service.start_failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorCode:
      error instanceof Error && "code" in error
        ? (error as Error & { code: unknown }).code
        : null,
  });
  process.exitCode = 1;
});
