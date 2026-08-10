import {
  createJsonLogger,
} from "@mineagents/observability";

import {
  parseCollectorWorkerConfig,
} from "./collector-worker-config.js";

import {
  CollectorWorker,
} from "./collector-worker.js";

import {
  connectMineflayerDriver,
  type MineflayerDriver,
} from "./mineflayer-driver.js";

const logger =
  createJsonLogger({
    service:
      "collector-worker",
  });

const config =
  parseCollectorWorkerConfig();

let driver:
  MineflayerDriver | undefined;

let worker:
  CollectorWorker | undefined;

let shuttingDown =
  false;

const shutdown = (
  signal: string,
): void => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info(
    "service.stopping",
    {
      signal,
    },
  );

  worker?.stop();

  driver?.close(
    "Collector worker shutdown",
  );
};

process.once(
  "SIGTERM",
  () =>
    shutdown(
      "SIGTERM",
    ),
);

process.once(
  "SIGINT",
  () =>
    shutdown(
      "SIGINT",
    ),
);

const main =
  async (): Promise<void> => {
    driver =
      await connectMineflayerDriver({
        host:
          config.connection.host,

        port:
          config.connection.port,

        username:
          config.connection
            .username,

        version:
          config.connection
            .version,

        connectTimeoutMs:
          config.connection
            .connectTimeoutMs,

        chunksTimeoutMs:
          config.connection
            .chunksTimeoutMs,

        movementTimeoutMs:
          config.connection
            .movementTimeoutMs,
      });

    const state =
      await driver.getState();

    logger.info(
      "minecraft.connected",
      {
        username:
          config.connection
            .username,

        role:
          "collector",

        agentId:
          config.agentId,

        connected:
          state.connected,

        position:
          state.position,
      },
    );

    worker =
      new CollectorWorker(
        driver,
        config,
      );

    await worker.run();
  };

main().catch(
  (error: unknown) => {
    logger.error(
      "service.start_failed",
      {
        errorName:
          error instanceof Error
            ? error.name
            : "UnknownError",

        errorCode:
          error instanceof Error &&
          "code" in error
            ? (
                error as Error & {
                  code: unknown;
                }
              ).code
            : null,
      },
    );

    process.exitCode = 1;
  },
);