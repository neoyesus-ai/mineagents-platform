import {
  randomUUID,
} from "node:crypto";

import {
  CollectorAgent,
} from "@mineagents/agent-collector";

import {
  SafeMinecraftAdapter,
  type MinecraftAuthorization,
  type MinecraftAuthorizationVerifier,
  type WorldPosition,
  type WorldRegion,
} from "@mineagents/minecraft-adapter";

import type {
  TaskRecord,
} from "@mineagents/sdk";

import {
  createJsonLogger,
} from "@mineagents/observability";

import type {
  MineflayerDriver,
} from "./mineflayer-driver.js";

import type {
  CollectorWorkerConfig,
} from "./collector-worker-config.js";

import {
  CoordinatorWorkerClient,
} from "./coordinator-client.js";

const logger =
  createJsonLogger({
    service:
      "collector-worker",
  });

interface CollectPayload {
  blockName: string;
  quantity: number;
  candidates:
    readonly WorldPosition[];
  allowPartial?: boolean;
}

const sleep = (
  milliseconds: number,
): Promise<void> =>
  new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        milliseconds,
      ),
  );

const parsePosition = (
  value: unknown,
): WorldPosition => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Collector candidate must be an object.",
    );
  }

  const position =
    value as Record<
      string,
      unknown
    >;

  if (
    typeof position.dimension !==
      "string" ||
    !Number.isSafeInteger(
      position.x,
    ) ||
    !Number.isSafeInteger(
      position.y,
    ) ||
    !Number.isSafeInteger(
      position.z,
    )
  ) {
    throw new Error(
      "Collector candidate contains invalid coordinates.",
    );
  }

  return {
    dimension:
      position.dimension,

    x:
      position.x as number,

    y:
      position.y as number,

    z:
      position.z as number,
  };
};

const parsePayload = (
  task: TaskRecord,
  config: CollectorWorkerConfig,
): CollectPayload => {
  if (
    task.kind !==
    "collect-blocks"
  ) {
    throw new Error(
      `Unsupported task kind '${task.kind}'.`,
    );
  }

  const payload =
    task.payload;

  const blockName =
    payload.blockName;

  const quantity =
    payload.quantity;

  const candidates =
    payload.candidates;

  if (
    typeof blockName !==
      "string" ||
    !config.allowedBreakBlocks.includes(
      blockName,
    )
  ) {
    throw new Error(
      `Block '${String(
        blockName,
      )}' is not allowed for this collector.`,
    );
  }

  if (
    !Number.isSafeInteger(
      quantity,
    ) ||
    (quantity as number) < 1 ||
    (quantity as number) >
      config.maxActionsPerTask
  ) {
    throw new Error(
      "Collector quantity exceeds configured limits.",
    );
  }

  if (
    !Array.isArray(
      candidates,
    ) ||
    candidates.length === 0
  ) {
    throw new Error(
      "Collector task requires candidate positions.",
    );
  }

  return {
    blockName,

    quantity:
      quantity as number,

    candidates:
      candidates.map(
        parsePosition,
      ),

    allowPartial:
      payload.allowPartial ===
      true,
  };
};

const createAuthorization = (
  task: TaskRecord,
  payload: CollectPayload,
  region: WorldRegion,
): MinecraftAuthorization => ({
  id:
    randomUUID(),

  taskId:
    task.id,

  allowedActions: [
    "break-block",
  ],

  allowedRegion:
    region,

  expiresAt:
    new Date(
      Date.now() +
        5 * 60_000,
    ).toISOString(),

  maxActions:
    payload.quantity,
});

const createVerifier = (
  taskId: string,
  authorizationId: string,
): MinecraftAuthorizationVerifier => ({
  async verify(
    authorization,
    request,
  ) {
    return (
      authorization.id ===
        authorizationId &&
      authorization.taskId ===
        taskId &&
      request.action ===
        "break-block"
    );
  },
});

export class CollectorWorker {
  private readonly client:
    CoordinatorWorkerClient;

  private stopping =
    false;

  constructor(
    private readonly driver:
      MineflayerDriver,

    private readonly config:
      CollectorWorkerConfig,
  ) {
    this.client =
      new CoordinatorWorkerClient({
        baseUrl:
          config.connection
            .coordinatorBaseUrl,
      });
  }

  stop(): void {
    this.stopping =
      true;
  }

  async run(): Promise<void> {
    await this.sendHeartbeat();

    let heartbeatAt =
      Date.now();

    while (
      !this.stopping
    ) {
      if (
        Date.now() -
          heartbeatAt >=
        this.config
          .connection
          .heartbeatIntervalMs
      ) {
        await this.sendHeartbeat();

        heartbeatAt =
          Date.now();
      }

      let task:
        TaskRecord | null =
          null;

      try {
        task =
          await this.client.claimTask(
            this.config.agentId,
          );
      } catch (error) {
        logger.error(
          "coordinator.claim_failed",
          {
            errorName:
              error instanceof Error
                ? error.name
                : "UnknownError",
          },
        );

        await sleep(
          this.config
            .pollIntervalMs,
        );

        continue;
      }

      if (!task) {
        await sleep(
          this.config
            .pollIntervalMs,
        );

        continue;
      }

      await this.executeTask(
        task,
      );
    }
  }

  private async sendHeartbeat(): Promise<void> {
    await this.client.heartbeat({
      id:
        this.config.agentId,

      name:
        this.config.connection
          .username,

      role:
        "collector",
    });
  }

  private async executeTask(
    task: TaskRecord,
  ): Promise<void> {
    logger.info(
      "task.claimed",
      {
        taskId:
          task.id,

        kind:
          task.kind,
      },
    );

    try {
      const payload =
        parsePayload(
          task,
          this.config,
        );

      await this.client.patchTask(
        task.id,
        {
          status:
            "running",
        },
      );

      const authorization =
        createAuthorization(
          task,
          payload,
          this.config
            .allowedRegion,
        );

      const minecraft =
        new SafeMinecraftAdapter({
          driver:
            this.driver,

          policy: {
            allowedRegions: [
              this.config
                .allowedRegion,
            ],

            allowMovement:
              false,

            allowedPlaceBlocks:
              [],

            allowedBreakBlocks:
              this.config
                .allowedBreakBlocks,

            maxActionsPerAuthorization:
              this.config
                .maxActionsPerTask,
          },

          authorizationVerifier:
            createVerifier(
              task.id,
              authorization.id,
            ),
        });

      const collector =
        new CollectorAgent({
          minecraft,

          limits: {
            maxBlocksPerTask:
              this.config
                .maxActionsPerTask,
          },
        });

      const result =
        await collector.collectBlocks({
          taskId:
            task.id,

          blockName:
            payload.blockName,

          quantity:
            payload.quantity,

          candidates:
            payload.candidates,

          authorization,

          allowPartial:
            payload.allowPartial,
        });

      if (
        result.status ===
        "completed"
      ) {
        await this.client.patchTask(
          task.id,
          {
            status:
              "completed",

            failureReason:
              null,
          },
        );

        logger.info(
          "task.completed",
          {
            taskId:
              task.id,

            brokenBlocks:
              result.brokenBlocks,
          },
        );

        return;
      }

      if (
        result.status ===
        "cancelled"
      ) {
        await this.client.patchTask(
          task.id,
          {
            status:
              "cancelled",
          },
        );

        return;
      }

      throw new Error(
        `Collector finished with status '${result.status}'.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown collector error.";

      logger.error(
        "task.failed",
        {
          taskId:
            task.id,

          errorName:
            error instanceof Error
              ? error.name
              : "UnknownError",
        },
      );

      try {
        await this.client.patchTask(
          task.id,
          {
            status:
              "failed",

            failureReason:
              message.slice(
                0,
                1_000,
              ),
          },
        );
      } catch (
        coordinatorError
      ) {
        logger.error(
          "task.failure_report_failed",
          {
            taskId:
              task.id,

            errorName:
              coordinatorError instanceof
              Error
                ? coordinatorError.name
                : "UnknownError",
          },
        );
      }
    }
  }
}