import type {
  BuildPlacement,
} from "@mineagents/agent-builder";

import {
  isPositionInRegion,
  type MinecraftAdapter,
  type WorldPosition,
  type WorldRegion,
} from "@mineagents/minecraft-adapter";

import {
  createJsonLogger,
} from "@mineagents/observability";

import type {
  MineflayerDriver,
} from "./mineflayer-driver.js";

const logger =
  createJsonLogger({
    service:
      "builder-resource-handoff",
  });

const emptyBlockNames =
  new Set([
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air",
  ]);

export interface BuilderResourceHandoffOptions {
  driver:
    MineflayerDriver;

  minecraft:
    MinecraftAdapter;

  taskId:
    string;

  placements:
    readonly BuildPlacement[];

  allowPartial:
    boolean;

  handoffPosition:
    WorldPosition;

  allowedRegion:
    WorldRegion;

  pickupTimeoutMs:
    number;

  pollIntervalMs?:
    number;
}

interface MaterialRequirement {
  itemName:
    string;

  quantity:
    number;
}

interface MaterialPreflight {
  blocked:
    boolean;

  requirements:
    readonly MaterialRequirement[];
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

const samePosition = (
  left: WorldPosition,
  right: WorldPosition,
): boolean =>
  left.dimension ===
    right.dimension &&
  left.x ===
    right.x &&
  left.y ===
    right.y &&
  left.z ===
    right.z;

const positionKey = (
  position: WorldPosition,
): string =>
  `${position.dimension}:${position.x}:${position.y}:${position.z}`;

const validateOptions = (
  options:
    BuilderResourceHandoffOptions,
): void => {
  if (
    !Number.isSafeInteger(
      options.pickupTimeoutMs,
    ) ||
    options.pickupTimeoutMs <
      1
  ) {
    throw new Error(
      "Builder handoff pickup timeout must be a positive safe integer.",
    );
  }

  if (
    !isPositionInRegion(
      options.handoffPosition,
      options.allowedRegion,
    )
  ) {
    throw new Error(
      "Builder handoff position is outside the builder allowed region.",
    );
  }
};

const inspectRequirements =
  async (
    options:
      BuilderResourceHandoffOptions,
  ): Promise<MaterialPreflight> => {
    const unique =
      new Map<
        string,
        BuildPlacement
      >();

    for (
      const placement
      of options.placements
    ) {
      const key =
        positionKey(
          placement.position,
        );

      const existing =
        unique.get(
          key,
        );

      if (
        existing &&
        existing.blockName !==
          placement.blockName
      ) {
        throw new Error(
          `Builder handoff preflight found conflicting placements at ${key}.`,
        );
      }

      if (
        !existing
      ) {
        unique.set(
          key,
          placement,
        );
      }
    }

    const requirements =
      new Map<
        string,
        number
      >();

    let blocked =
      false;

    for (
      const placement
      of unique.values()
    ) {
      const current =
        await options.minecraft
          .inspectBlock(
            placement.position,
          );

      if (
        current.name ===
        placement.blockName
      ) {
        continue;
      }

      if (
        !emptyBlockNames.has(
          current.name,
        )
      ) {
        blocked =
          true;

        if (
          !options.allowPartial
        ) {
          return {
            blocked:
              true,

            requirements:
              [],
          };
        }

        continue;
      }

      requirements.set(
        placement.blockName,
        (
          requirements.get(
            placement.blockName,
          ) ??
          0
        ) +
          1,
      );
    }

    return {
      blocked,

      requirements:
        [
          ...requirements.entries(),
        ].map(
          ([
            itemName,
            quantity,
          ]) => ({
            itemName,
            quantity,
          }),
        ),
    };
  };

const moveToHandoff =
  async (
    options:
      BuilderResourceHandoffOptions,
  ): Promise<void> => {
    const state =
      await options.driver
        .getState();

    if (
      samePosition(
        state.position,
        options.handoffPosition,
      )
    ) {
      return;
    }

    logger.info(
      "handoff.movement_started",
      {
        taskId:
          options.taskId,

        from:
          state.position,

        target:
          options.handoffPosition,
      },
    );

    await options.driver.moveTo(
      options.handoffPosition,
      [
        options.allowedRegion,
      ],
    );

    const after =
      await options.driver
        .getState();

    logger.info(
      "handoff.movement_completed",
      {
        taskId:
          options.taskId,

        position:
          after.position,
      },
    );
  };

const acquireMaterial =
  async (
    options:
      BuilderResourceHandoffOptions,

    requirement:
      MaterialRequirement,
  ): Promise<void> => {
    const initial =
      options.driver
        .getInventoryCount(
          requirement.itemName,
        );

    if (
      initial >=
      requirement.quantity
    ) {
      logger.info(
        "handoff.inventory_ready",
        {
          taskId:
            options.taskId,

          itemName:
            requirement.itemName,

          required:
            requirement.quantity,

          inventory:
            initial,
        },
      );

      return;
    }

    const expected =
      requirement.quantity;

    const startedAt =
      Date.now();

    logger.info(
      "handoff.pickup_started",
      {
        taskId:
          options.taskId,

        itemName:
          requirement.itemName,

        required:
          requirement.quantity,

        inventoryBefore:
          initial,

        missing:
          requirement.quantity -
          initial,
      },
    );

    await moveToHandoff(
      options,
    );

    let current =
      options.driver
        .getInventoryCount(
          requirement.itemName,
        );

    while (
      current <
        expected &&
      Date.now() -
        startedAt <
        options.pickupTimeoutMs
    ) {
      const droppedItems =
        options.driver
          .findNearbyDroppedItems(
            requirement.itemName,
            [
              options.handoffPosition,
            ],
            8,
          )
          .filter(
            (position) =>
              isPositionInRegion(
                position,
                options.allowedRegion,
              ),
          );

      if (
        droppedItems.length ===
        0
      ) {
        await sleep(
          options.pollIntervalMs ??
            100,
        );

        current =
          options.driver
            .getInventoryCount(
              requirement.itemName,
            );

        continue;
      }

      const pickupTarget =
        droppedItems[0];

      if (
        !pickupTarget
      ) {
        continue;
      }

      logger.info(
        "handoff.item_found",
        {
          taskId:
            options.taskId,

          itemName:
            requirement.itemName,

          position:
            pickupTarget,

          candidates:
            droppedItems.length,
        },
      );

      const state =
        await options.driver
          .getState();

      if (
        !samePosition(
          state.position,
          pickupTarget,
        )
      ) {
        logger.info(
          "handoff.pickup_movement_started",
          {
            taskId:
              options.taskId,

            from:
              state.position,

            target:
              pickupTarget,
          },
        );

        try {
          await options.driver.moveTo(
            pickupTarget,
            [
              options.allowedRegion,
            ],
          );
        } catch (
          error
        ) {
          logger.info(
            "handoff.pickup_position_rejected",
            {
              taskId:
                options.taskId,

              target:
                pickupTarget,

              errorName:
                error instanceof Error
                  ? error.name
                  : "UnknownError",

              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Unknown builder pickup movement error.",
            },
          );

          await sleep(
            options.pollIntervalMs ??
              100,
          );

          continue;
        }

        const after =
          await options.driver
            .getState();

        logger.info(
          "handoff.pickup_movement_completed",
          {
            taskId:
              options.taskId,

            position:
              after.position,

            target:
              pickupTarget,
          },
        );
      }

      await sleep(
        options.pollIntervalMs ??
          100,
      );

      current =
        options.driver
          .getInventoryCount(
            requirement.itemName,
          );
    }

    if (
      current <
      expected
    ) {
      throw new Error(
        `Builder inventory did not receive enough ${requirement.itemName} within ${options.pickupTimeoutMs} ms. Required ${expected}, found ${current}.`,
      );
    }

    logger.info(
      "handoff.pickup_completed",
      {
        taskId:
          options.taskId,

        itemName:
          requirement.itemName,

        required:
          requirement.quantity,

        inventory:
          current,
      },
    );
  };

export const acquireBuilderResources =
  async (
    options:
      BuilderResourceHandoffOptions,
  ): Promise<void> => {
    validateOptions(
      options,
    );

    const preflight =
      await inspectRequirements(
        options,
      );

    if (
      preflight.blocked &&
      !options.allowPartial
    ) {
      logger.info(
        "handoff.skipped_blocked_build",
        {
          taskId:
            options.taskId,
        },
      );

      return;
    }

    if (
      preflight.requirements.length ===
      0
    ) {
      logger.info(
        "handoff.not_required",
        {
          taskId:
            options.taskId,
        },
      );

      return;
    }

    for (
      const requirement
      of preflight.requirements
    ) {
      await acquireMaterial(
        options,
        requirement,
      );
    }

    logger.info(
      "handoff.completed",
      {
        taskId:
          options.taskId,

        materials:
          preflight.requirements,
      },
    );
  };