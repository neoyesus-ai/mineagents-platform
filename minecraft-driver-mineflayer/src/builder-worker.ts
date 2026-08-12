import {
  randomUUID,
} from "node:crypto";

import {
  BuilderAgent,
  type BuildPlacement,
} from "@mineagents/agent-builder";

import {
  SafeMinecraftAdapter,
  isPositionInRegion,
  type MinecraftAdapter,
  type MinecraftAuthorization,
  type MinecraftAuthorizationVerifier,
  type WorldPosition,
  type WorldRegion,
} from "@mineagents/minecraft-adapter";

import {
  createJsonLogger,
} from "@mineagents/observability";

import type {
  TaskRecord,
} from "@mineagents/sdk";

import type {
  BuilderWorkerConfig,
} from "./builder-worker-config.js";

import {
  CoordinatorWorkerClient,
} from "./coordinator-client.js";

import type {
  MineflayerDriver,
} from "./mineflayer-driver.js";

const logger =
  createJsonLogger({
    service:
      "builder-worker",
  });

interface BuildPayload {
  placements:
    readonly BuildPlacement[];

  allowPartial?: boolean;
}

const emptyBlockNames =
  new Set([
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air",
  ]);

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

const blockNamePattern =
  /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

const clonePosition = (
  position: WorldPosition,
): WorldPosition => ({
  dimension:
    position.dimension,

  x:
    position.x,

  y:
    position.y,

  z:
    position.z,
});

const parsePosition = (
  value: unknown,
): WorldPosition => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Builder placement position must be an object.",
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
      "Builder placement contains invalid coordinates.",
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

const parsePlacement = (
  value: unknown,
  config: BuilderWorkerConfig,
): BuildPlacement => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Builder placement must be an object.",
    );
  }

  const placement =
    value as Record<
      string,
      unknown
    >;

  if (
    typeof placement.blockName !==
      "string" ||
    !blockNamePattern.test(
      placement.blockName,
    )
  ) {
    throw new Error(
      "Builder placement requires a namespaced blockName.",
    );
  }

  if (
    !config.allowedPlaceBlocks.includes(
      placement.blockName,
    )
  ) {
    throw new Error(
      `Block '${placement.blockName}' is not allowed for this builder.`,
    );
  }

  return {
    position:
      parsePosition(
        placement.position,
      ),

    blockName:
      placement.blockName,
  };
};

const parsePayload = (
  task: TaskRecord,
  config: BuilderWorkerConfig,
): BuildPayload => {
  if (
    task.kind !==
    "build-blueprint"
  ) {
    throw new Error(
      `Unsupported task kind '${task.kind}'.`,
    );
  }

  const placements =
    task.payload.placements;

  if (
    !Array.isArray(
      placements,
    ) ||
    placements.length === 0
  ) {
    throw new Error(
      "Builder task requires at least one placement.",
    );
  }

  if (
    placements.length >
    config.maxPlacementsPerTask
  ) {
    throw new Error(
      "Builder task exceeds the configured placement limit.",
    );
  }

  return {
    placements:
      placements.map(
        (placement) =>
          parsePlacement(
            placement,
            config,
          ),
      ),

    allowPartial:
      task.payload.allowPartial ===
      true,
  };
};

const createAuthorization = (
  task: TaskRecord,
  payload: BuildPayload,
  region: WorldRegion,
): MinecraftAuthorization => ({
  id:
    randomUUID(),

  taskId:
    task.id,

  allowedActions: [
    "place-block",
  ],

  allowedRegion:
    region,

  expiresAt:
    new Date(
      Date.now() +
        5 * 60_000,
    ).toISOString(),

  maxActions:
    payload.placements.length,
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
        "place-block"
    );
  },
});

const squaredHorizontalDistance = (
  left: WorldPosition,
  right: WorldPosition,
): number => {
  const dx =
    left.x -
    right.x;

  const dz =
    left.z -
    right.z;

  return (
    dx * dx +
    dz * dz
  );
};

const candidateApproachPositions = (
  target: WorldPosition,
): readonly WorldPosition[] => [
  {
    dimension:
      target.dimension,

    x:
      target.x + 1,

    y:
      target.y,

    z:
      target.z,
  },

  {
    dimension:
      target.dimension,

    x:
      target.x - 1,

    y:
      target.y,

    z:
      target.z,
  },

  {
    dimension:
      target.dimension,

    x:
      target.x,

    y:
      target.y,

    z:
      target.z + 1,
  },

  {
    dimension:
      target.dimension,

    x:
      target.x,

    y:
      target.y,

    z:
      target.z - 1,
  },

  {
    dimension:
      target.dimension,

    x:
      target.x + 1,

    y:
      target.y,

    z:
      target.z + 1,
  },

  {
    dimension:
      target.dimension,

    x:
      target.x + 1,

    y:
      target.y,

    z:
      target.z - 1,
  },

  {
    dimension:
      target.dimension,

    x:
      target.x - 1,

    y:
      target.y,

    z:
      target.z + 1,
  },

  {
    dimension:
      target.dimension,

    x:
      target.x - 1,

    y:
      target.y,

    z:
      target.z - 1,
  },
];

const isWalkableApproach = async (
  minecraft:
    SafeMinecraftAdapter,

  position:
    WorldPosition,
): Promise<boolean> => {
  const feet =
    await minecraft.inspectBlock(
      position,
    );

  if (
    !emptyBlockNames.has(
      feet.name,
    )
  ) {
    return false;
  }

  const head =
    await minecraft.inspectBlock({
      ...position,

      y:
        position.y + 1,
    });

  if (
    !emptyBlockNames.has(
      head.name,
    )
  ) {
    return false;
  }

  const support =
    await minecraft.inspectBlock({
      ...position,

      y:
        position.y - 1,
    });

  return support.solid;
};

const findApproachPosition = async (
  minecraft:
    SafeMinecraftAdapter,

  target:
    WorldPosition,

  region:
    WorldRegion,
): Promise<WorldPosition> => {
  const state =
    await minecraft.getState();

  const approaches =
    candidateApproachPositions(
      target,
    )
      .filter(
        (position) =>
          isPositionInRegion(
            position,
            region,
          ) &&
          isPositionInRegion(
            {
              ...position,

              y:
                position.y + 1,
            },
            region,
          ) &&
          isPositionInRegion(
            {
              ...position,

              y:
                position.y - 1,
            },
            region,
          ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          squaredHorizontalDistance(
            state.position,
            left,
          ) -
          squaredHorizontalDistance(
            state.position,
            right,
          ),
      );

  for (
    const approach
    of approaches
  ) {
    try {
      if (
        await isWalkableApproach(
          minecraft,
          approach,
        )
      ) {
        return clonePosition(
          approach,
        );
      }
    } catch {
      /*
       * Una posición descargada o ilegible
       * no es una aproximación segura.
       */
    }
  }

  throw new Error(
    `Builder could not find a walkable approach position for ${target.dimension} (${target.x}, ${target.y}, ${target.z}).`,
  );
};

const createAutonomousBuilderAdapter = (
  minecraft:
    SafeMinecraftAdapter,

  region:
    WorldRegion,
): MinecraftAdapter => ({
  getState:
    () =>
      minecraft.getState(),

  inspectBlock:
    (position) =>
      minecraft.inspectBlock(
        position,
      ),

  moveTo:
    (target) =>
      minecraft.moveTo(
        target,
      ),

  breakBlock:
    (
      position,
      expectedBlockName,
      authorization,
    ) =>
      minecraft.breakBlock(
        position,
        expectedBlockName,
        authorization,
      ),

  async placeBlock(
    position,
    blockName,
    authorization,
  ) {
    const approach =
      await findApproachPosition(
        minecraft,
        position,
        region,
      );

    const state =
      await minecraft.getState();

    const alreadyAtApproach =
      state.position.dimension ===
        approach.dimension &&
      state.position.x ===
        approach.x &&
      state.position.y ===
        approach.y &&
      state.position.z ===
        approach.z;

    if (
      !alreadyAtApproach
    ) {
      logger.info(
        "task.movement_started",
        {
          target:
            position,

          approach,
        },
      );

      await minecraft.moveTo(
        approach,
      );

      const after =
        await minecraft.getState();

      logger.info(
        "task.movement_completed",
        {
          position:
            after.position,

          target:
            position,
        },
      );
    }

    /*
     * BuilderAgent hizo preflight antes de
     * llegar aquí, pero el mundo puede haber
     * cambiado durante el desplazamiento.
     *
     * SafeMinecraftAdapter + el driver
     * volverán a validar que el destino sigue
     * siendo aire antes de consumir la escritura.
     */
    await minecraft.placeBlock(
      position,
      blockName,
      authorization,
    );
  },
});

export class BuilderWorker {
  private readonly client:
    CoordinatorWorkerClient;

  private stopping =
    false;

  constructor(
    private readonly driver:
      MineflayerDriver,

    private readonly config:
      BuilderWorkerConfig,
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

      if (
        !task
      ) {
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

  private async sendHeartbeat():
    Promise<void>
  {
    await this.client.heartbeat({
      id:
        this.config.agentId,

      name:
        this.config.connection
          .username,

      role:
        "builder",
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

      const safeMinecraft =
        new SafeMinecraftAdapter({
          driver:
            this.driver,

          policy: {
            allowedRegions: [
              this.config
                .allowedRegion,
            ],

            /*
             * El worker puede desplazarse,
             * pero BoundedMovementController
             * sigue impidiendo cavar, parkour,
             * bloques auxiliares o salir de la
             * región permitida.
             */
            allowMovement:
              true,

            allowedPlaceBlocks:
              this.config
                .allowedPlaceBlocks,

            allowedBreakBlocks:
              [],

            maxActionsPerAuthorization:
              this.config
                .maxPlacementsPerTask,
          },

          authorizationVerifier:
            createVerifier(
              task.id,
              authorization.id,
            ),
        });

      const minecraft =
        createAutonomousBuilderAdapter(
          safeMinecraft,
          this.config
            .allowedRegion,
        );

      const builder =
        new BuilderAgent({
          minecraft,

          limits: {
            maxPlacementsPerTask:
              this.config
                .maxPlacementsPerTask,
          },
        });

      const result =
        await builder.build({
          taskId:
            task.id,

          placements:
            payload.placements,

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

            placedBlocks:
              result.placedBlocks,

            alreadySatisfied:
              result.alreadySatisfied,
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
        `Builder finished with status '${result.status}'.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown builder error.";

      const cause =
        error instanceof Error &&
        "cause" in error
          ? error.cause
          : undefined;

      logger.error(
        "task.failed",
        {
          taskId:
            task.id,

          errorName:
            error instanceof Error
              ? error.name
              : "UnknownError",

          errorMessage:
            error instanceof Error
              ? error.message
              : "Unknown builder error.",

          causeName:
            cause instanceof Error
              ? cause.name
              : undefined,

          causeMessage:
            cause instanceof Error
              ? cause.message
              : undefined,

          causeCode:
            (
              cause !== null &&
              typeof cause ===
                "object" &&
              "code" in cause &&
              typeof cause.code ===
                "string"
            )
              ? cause.code
              : undefined,
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