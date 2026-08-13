import {
  isPositionInRegion,
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
      "resource-handoff",
  });

export interface DeliverCollectedResourcesOptions {
  driver:
    MineflayerDriver;

  taskId:
    string;

  itemName:
    string;

  quantity:
    number;

  inventoryBefore:
    number;

  brokenPositions:
    readonly WorldPosition[];

  handoffPosition:
    WorldPosition;

  allowedRegion:
    WorldRegion;

  pickupTimeoutMs:
    number;

  pollIntervalMs?:
    number;
}

const sleep = (
  milliseconds: number,
): Promise<void> =>
  new Promise(
    (
      resolve,
    ) =>
      setTimeout(
        resolve,
        milliseconds,
      ),
  );

const samePosition = (
  left:
    WorldPosition,
  right:
    WorldPosition,
): boolean =>
  left.dimension ===
    right.dimension &&
  left.x ===
    right.x &&
  left.y ===
    right.y &&
  left.z ===
    right.z;

const expectedInventory = (
  options:
    DeliverCollectedResourcesOptions,
): number =>
  options.inventoryBefore +
  options.quantity;

const waitForExpectedInventory =
  async (
    options:
      DeliverCollectedResourcesOptions,

    timeoutMs:
      number,
  ): Promise<number> => {
    const expected =
      expectedInventory(
        options,
      );

    const pollIntervalMs =
      options.pollIntervalMs ??
      100;

    const deadline =
      Date.now() +
      timeoutMs;

    let current =
      options.driver
        .getInventoryCount(
          options.itemName,
        );

    while (
      current <
        expected &&
      Date.now() <
        deadline
    ) {
      await sleep(
        pollIntervalMs,
      );

      current =
        options.driver
          .getInventoryCount(
            options.itemName,
          );
    }

    return current;
  };

const collectPhysicalDrops =
  async (
    options:
      DeliverCollectedResourcesOptions,
  ): Promise<number> => {
    const expected =
      expectedInventory(
        options,
      );

    let current =
      await waitForExpectedInventory(
        options,
        Math.min(
          500,
          options.pickupTimeoutMs,
        ),
      );

    if (
      current >=
      expected
    ) {
      return current;
    }

    const startedAt =
      Date.now();

    logger.info(
      "handoff.pickup_started",
      {
        taskId:
          options.taskId,

        itemName:
          options.itemName,

        quantity:
          options.quantity,

        expectedInventory:
          expected,

        currentInventory:
          current,
      },
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
            options.itemName,
            options.brokenPositions,
            8,
          )
          .filter(
            (
              position,
            ) =>
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
              options.itemName,
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

      const state =
        await options.driver
          .getState();

      logger.info(
        "handoff.item_found",
        {
          taskId:
            options.taskId,

          itemName:
            options.itemName,

          position:
            pickupTarget,

          candidates:
            droppedItems.length,
        },
      );

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
                  : "Unknown pickup movement error.",
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

      current =
        await waitForExpectedInventory(
          options,
          Math.min(
            750,
            Math.max(
              1,
              options.pickupTimeoutMs -
                (
                  Date.now() -
                  startedAt
                ),
            ),
          ),
        );
    }

    logger.info(
      "handoff.pickup_completed",
      {
        taskId:
          options.taskId,

        itemName:
          options.itemName,

        expectedInventory:
          expected,

        currentInventory:
          current,
      },
    );

    return current;
  };

export const deliverCollectedResources =
  async (
    options:
      DeliverCollectedResourcesOptions,
  ): Promise<void> => {
    if (
      !Number.isSafeInteger(
        options.quantity,
      ) ||
      options.quantity <
        1
    ) {
      throw new Error(
        "Resource handoff quantity must be a positive safe integer.",
      );
    }

    if (
      !Number.isSafeInteger(
        options.pickupTimeoutMs,
      ) ||
      options.pickupTimeoutMs <
        1
    ) {
      throw new Error(
        "Resource handoff pickup timeout must be a positive safe integer.",
      );
    }

    if (
      !Array.isArray(
        options.brokenPositions,
      ) ||
      options.brokenPositions.length ===
        0
    ) {
      throw new Error(
        "Resource handoff requires at least one broken resource position.",
      );
    }

    if (
      !isPositionInRegion(
        options.handoffPosition,
        options.allowedRegion,
      )
    ) {
      throw new Error(
        "Resource handoff position is outside the collector allowed region.",
      );
    }

    const expected =
      expectedInventory(
        options,
      );

    const inventoryReady =
      await collectPhysicalDrops(
        options,
      );

    if (
      inventoryReady <
      expected
    ) {
      throw new Error(
        `Collector inventory did not receive ${options.quantity} ${options.itemName} within ${options.pickupTimeoutMs} ms. Expected at least ${expected}, found ${inventoryReady}.`,
      );
    }

    logger.info(
      "handoff.inventory_ready",
      {
        taskId:
          options.taskId,

        itemName:
          options.itemName,

        quantity:
          options.quantity,

        inventoryBefore:
          options.inventoryBefore,

        inventoryReady,
      },
    );

    const state =
      await options.driver
        .getState();

    if (
      !samePosition(
        state.position,
        options.handoffPosition,
      )
    ) {
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
    }

    const beforeDrop =
      options.driver
        .getInventoryCount(
          options.itemName,
        );

    if (
      beforeDrop <
      options.quantity
    ) {
      throw new Error(
        `Collector inventory contains only ${beforeDrop} ${options.itemName} before handoff drop.`,
      );
    }

    await options.driver
      .dropInventoryItem(
        options.itemName,
        options.quantity,
      );

    const afterDrop =
      options.driver
        .getInventoryCount(
          options.itemName,
        );

    if (
      afterDrop !==
      beforeDrop -
        options.quantity
    ) {
      throw new Error(
        `Resource handoff postcondition failed for ${options.itemName}.`,
      );
    }

    logger.info(
      "handoff.completed",
      {
        taskId:
          options.taskId,

        itemName:
          options.itemName,

        quantity:
          options.quantity,

        position:
          options.handoffPosition,

        inventoryBeforeDrop:
          beforeDrop,

        inventoryAfterDrop:
          afterDrop,
      },
    );
  };