import {
  randomUUID,
} from "node:crypto";

import {
  CollectorAgent,
} from "@mineagents/agent-collector";

import {
  SafeMinecraftAdapter,
  isPositionInRegion,
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

interface CollectSearch {
  dimension?: string;
  maxDistance: number;
  maxCandidates: number;
}

interface CollectPayload {
  blockName: string;
  quantity: number;

  candidates?:
    readonly WorldPosition[];

  search?:
    CollectSearch;

  allowPartial?: boolean;
}

interface ResolvedCollectPayload {
  blockName: string;
  quantity: number;

  candidates:
    readonly WorldPosition[];

  allowPartial?: boolean;

  autonomousMovement:
    boolean;
}

interface AutonomousCollectResult {
  status:
    | "completed"
    | "partial"
    | "insufficient-resources";

  inspectedPositions: number;
  matchingBlocks: number;
  brokenBlocks: number;

  brokenPositions:
    readonly WorldPosition[];

  rejectedCandidates: number;
}

interface WorkerCollectResult {
  status:
    | "completed"
    | "partial"
    | "insufficient-resources"
    | "cancelled"
    | "failed";

  brokenBlocks: number;
}

const MAX_DISCOVERY_DISTANCE =
  128;

const MAX_DISCOVERY_CANDIDATES =
  256;

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

const parseSearch = (
  value: unknown,
  quantity: number,
  config: CollectorWorkerConfig,
): CollectSearch => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Collector search must be an object.",
    );
  }

  const search =
    value as Record<
      string,
      unknown
    >;

  const allowedKeys =
    new Set([
      "dimension",
      "maxDistance",
      "maxCandidates",
    ]);

  for (
    const key
    of Object.keys(search)
  ) {
    if (
      !allowedKeys.has(
        key,
      )
    ) {
      throw new Error(
        `Unknown collector search field '${key}'.`,
      );
    }
  }

  const dimension =
    search.dimension;

  if (
    dimension !== undefined &&
    (
      typeof dimension !==
        "string" ||
      dimension !==
        config.allowedRegion.dimension
    )
  ) {
    throw new Error(
      "Collector search dimension must match the configured allowed region.",
    );
  }

  const maxDistance =
    search.maxDistance;

  if (
    !Number.isSafeInteger(
      maxDistance,
    ) ||
    (maxDistance as number) <
      1 ||
    (maxDistance as number) >
      MAX_DISCOVERY_DISTANCE
  ) {
    throw new Error(
      `Collector search maxDistance must be between 1 and ${MAX_DISCOVERY_DISTANCE}.`,
    );
  }

  const maxCandidates =
    search.maxCandidates;

  if (
    !Number.isSafeInteger(
      maxCandidates,
    ) ||
    (maxCandidates as number) <
      1 ||
    (maxCandidates as number) >
      MAX_DISCOVERY_CANDIDATES
  ) {
    throw new Error(
      `Collector search maxCandidates must be between 1 and ${MAX_DISCOVERY_CANDIDATES}.`,
    );
  }

  if (
    (maxCandidates as number) <
    quantity
  ) {
    throw new Error(
      "Collector search maxCandidates must be at least the requested quantity.",
    );
  }

  return {
    dimension:
      config.allowedRegion
        .dimension,

    maxDistance:
      maxDistance as number,

    maxCandidates:
      maxCandidates as number,
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

  const search =
    payload.search;

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
    (quantity as number) <
      1 ||
    (quantity as number) >
      config.maxActionsPerTask
  ) {
    throw new Error(
      "Collector quantity exceeds configured limits.",
    );
  }

  const hasCandidates =
    Array.isArray(
      candidates,
    );

  const hasSearch =
    search !== undefined;

  if (
    hasCandidates ===
    hasSearch
  ) {
    throw new Error(
      "Collector task must provide exactly one of 'candidates' or 'search'.",
    );
  }

  if (
    hasCandidates
  ) {
    if (
      candidates.length ===
        0 ||
      candidates.length >
        MAX_DISCOVERY_CANDIDATES
    ) {
      throw new Error(
        `Collector candidates must contain between 1 and ${MAX_DISCOVERY_CANDIDATES} positions.`,
      );
    }

    const parsedCandidates =
      candidates.map(
        parsePosition,
      );

    for (
      const candidate
      of parsedCandidates
    ) {
      if (
        !isPositionInRegion(
          candidate,
          config.allowedRegion,
        )
      ) {
        throw new Error(
          "Collector candidate is outside the configured allowed region.",
        );
      }
    }

    return {
      blockName,

      quantity:
        quantity as number,

      candidates:
        parsedCandidates,

      allowPartial:
        payload.allowPartial ===
        true,
    };
  }

  return {
    blockName,

    quantity:
      quantity as number,

    search:
      parseSearch(
        search,
        quantity as number,
        config,
      ),

    allowPartial:
      payload.allowPartial ===
      true,
  };
};

const resolveCandidates = async (
  driver: MineflayerDriver,
  payload: CollectPayload,
  region: WorldRegion,
): Promise<{
  candidates:
    readonly WorldPosition[];

  autonomousMovement:
    boolean;
}> => {
  if (
    payload.candidates
  ) {
    return {
      candidates:
        payload.candidates,

      autonomousMovement:
        false,
    };
  }

  if (
    !payload.search
  ) {
    throw new Error(
      "Collector payload has no candidate source.",
    );
  }

  const discovered =
    await driver.findBlocks({
      blockName:
        payload.blockName,

      maxDistance:
        payload.search
          .maxDistance,

      maxResults:
        payload.search
          .maxCandidates,
    });

  const candidates =
    discovered.filter(
      (position) =>
        isPositionInRegion(
          position,
          region,
        ),
    );

  logger.info(
    "task.discovery_completed",
    {
      blockName:
        payload.blockName,

      discoveredBlocks:
        discovered.length,

      allowedCandidates:
        candidates.length,

      maxDistance:
        payload.search
          .maxDistance,
    },
  );

  if (
    candidates.length ===
    0
  ) {
    throw new Error(
      `Collector discovery found no '${payload.blockName}' blocks inside the allowed region.`,
    );
  }

  return {
    candidates,

    autonomousMovement:
      true,
  };
};

const createAuthorization = (
  task: TaskRecord,
  payload: ResolvedCollectPayload,
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
  minecraft: SafeMinecraftAdapter,
  position: WorldPosition,
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
  minecraft: SafeMinecraftAdapter,
  target: WorldPosition,
  region: WorldRegion,
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
       * Un approach descargado o ilegible no
       * es un destino válido. Probamos el
       * siguiente candidato.
       */
    }
  }

  throw new Error(
    `Collector could not find a walkable approach position for ${target.dimension} (${target.x}, ${target.y}, ${target.z}).`,
  );
};

const errorDetails = (
  error: unknown,
): {
  name: string;
  message: string;
  code?: string;
} => {
  if (
    error instanceof Error
  ) {
    const code =
      "code" in error &&
      typeof error.code ===
        "string"
        ? error.code
        : undefined;

    return {
      name:
        error.name,

      message:
        error.message,

      code,
    };
  }

  return {
    name:
      "UnknownError",

    message:
      "Unknown collector candidate error.",
  };
};

const collectAutonomously = async (
  minecraft: SafeMinecraftAdapter,
  payload: ResolvedCollectPayload,
  authorization: MinecraftAuthorization,
  region: WorldRegion,
): Promise<AutonomousCollectResult> => {
  let inspectedPositions =
    0;

  let rejectedCandidates =
    0;

  const matches:
    WorldPosition[] = [];

  const brokenPositions:
    WorldPosition[] = [];

  /*
   * Preflight completo.
   *
   * Antes de realizar cualquier escritura
   * inspeccionamos todos los candidatos
   * descubiertos.
   */
  for (
    const candidate
    of payload.candidates
  ) {
    const block =
      await minecraft.inspectBlock(
        candidate,
      );

    inspectedPositions +=
      1;

    if (
      block.name ===
      payload.blockName
    ) {
      matches.push(
        clonePosition(
          candidate,
        ),
      );
    }
  }

  if (
    matches.length <
      payload.quantity &&
    !payload.allowPartial
  ) {
    return {
      status:
        "insufficient-resources",

      inspectedPositions,

      matchingBlocks:
        matches.length,

      brokenBlocks:
        0,

      brokenPositions:
        [],

      rejectedCandidates:
        0,
    };
  }

  const desiredBlocks =
    payload.allowPartial
      ? Math.min(
          payload.quantity,
          matches.length,
        )
      : payload.quantity;

  for (
    const candidate
    of matches
  ) {
    if (
      brokenPositions.length >=
      desiredBlocks
    ) {
      break;
    }

    let approach:
      WorldPosition;

    try {
      approach =
        await findApproachPosition(
          minecraft,
          candidate,
          region,
        );
    } catch (error) {
      rejectedCandidates +=
        1;

      const details =
        errorDetails(
          error,
        );

      logger.info(
        "task.candidate_rejected",
        {
          target:
            candidate,

          phase:
            "approach",

          errorName:
            details.name,

          errorMessage:
            details.message,

          errorCode:
            details.code,
        },
      );

      continue;
    }

    const before =
      await minecraft.getState();

    const alreadyAtApproach =
      before.position.dimension ===
        approach.dimension &&
      before.position.x ===
        approach.x &&
      before.position.y ===
        approach.y &&
      before.position.z ===
        approach.z;

    if (
      !alreadyAtApproach
    ) {
      logger.info(
        "task.movement_started",
        {
          target:
            candidate,

          approach,
        },
      );

      try {
        await minecraft.moveTo(
          approach,
        );
      } catch (error) {
        rejectedCandidates +=
          1;

        const details =
          errorDetails(
            error,
          );

        logger.info(
          "task.candidate_rejected",
          {
            target:
              candidate,

            approach,

            phase:
              "movement",

            errorName:
              details.name,

            errorMessage:
              details.message,

            errorCode:
              details.code,
          },
        );

        continue;
      }

      const after =
        await minecraft.getState();

      logger.info(
        "task.movement_completed",
        {
          position:
            after.position,

          target:
            candidate,
        },
      );
    }

    /*
     * El mundo puede haber cambiado mientras
     * el bot se desplazaba. Revalidamos antes
     * de consumir la autorización de escritura.
     */
    const current =
      await minecraft.inspectBlock(
        candidate,
      );

    inspectedPositions +=
      1;

    if (
      current.name !==
      payload.blockName
    ) {
      rejectedCandidates +=
        1;

      logger.info(
        "task.candidate_rejected",
        {
          target:
            candidate,

          phase:
            "revalidation",

          expectedBlockName:
            payload.blockName,

          actualBlockName:
            current.name,
        },
      );

      continue;
    }

    /*
     * Un error de breakBlock no se convierte
     * en fallback.
     *
     * En ese punto la autorización puede haber
     * consumido una acción y el estado del
     * mundo puede ser ambiguo. Fallamos cerrado.
     */
    await minecraft.breakBlock(
      candidate,
      payload.blockName,
      authorization,
    );

    brokenPositions.push(
      clonePosition(
        candidate,
      ),
    );
  }

  if (
    brokenPositions.length ===
    payload.quantity
  ) {
    return {
      status:
        "completed",

      inspectedPositions,

      matchingBlocks:
        matches.length,

      brokenBlocks:
        brokenPositions.length,

      brokenPositions,

      rejectedCandidates,
    };
  }

  if (
    payload.allowPartial &&
    brokenPositions.length >
      0
  ) {
    return {
      status:
        "partial",

      inspectedPositions,

      matchingBlocks:
        matches.length,

      brokenBlocks:
        brokenPositions.length,

      brokenPositions,

      rejectedCandidates,
    };
  }

  return {
    status:
      "insufficient-resources",

    inspectedPositions,

    matchingBlocks:
      matches.length,

    brokenBlocks:
      brokenPositions.length,

    brokenPositions,

    rejectedCandidates,
  };
};

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
      const parsedPayload =
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

      const resolved =
        await resolveCandidates(
          this.driver,
          parsedPayload,
          this.config
            .allowedRegion,
        );

      const payload:
        ResolvedCollectPayload = {
          blockName:
            parsedPayload.blockName,

          quantity:
            parsedPayload.quantity,

          candidates:
            resolved.candidates,

          allowPartial:
            parsedPayload.allowPartial,

          autonomousMovement:
            resolved.autonomousMovement,
        };

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
             * Solo las tareas basadas en search
             * permiten movimiento autónomo.
             */
            allowMovement:
              payload.autonomousMovement,

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

      let result:
        WorkerCollectResult;

      if (
        payload.autonomousMovement
      ) {
        result =
          await collectAutonomously(
            safeMinecraft,
            payload,
            authorization,
            this.config
              .allowedRegion,
          );
      } else {
        /*
         * Las tareas legacy con candidates
         * explícitos conservan exactamente el
         * CollectorAgent existente.
         */
        const collector =
          new CollectorAgent({
            minecraft:
              safeMinecraft,

            limits: {
              maxBlocksPerTask:
                this.config
                  .maxActionsPerTask,

              maxCandidatesPerTask:
                MAX_DISCOVERY_CANDIDATES,
            },
          });

        result =
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
      }

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
              : "Unknown collector error.",

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