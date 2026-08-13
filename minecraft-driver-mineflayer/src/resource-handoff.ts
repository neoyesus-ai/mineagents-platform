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
  left.x === right.x &&
  left.y === right.y &&
  left.z === right.z;

const assertQuantity = (
  quantity: number,
): void => {
  if (
    !Number.isSafeInteger(
      quantity,
    ) ||
    quantity < 1
  ) {
    throw new Error(
      "Resource handoff quantity must be a positive safe integer.",
    );
  }
};

const assertTimeout = (
  timeoutMs: number,
): void => {
  if (
    !Number.isSafeInteger(
      timeoutMs,
    ) ||
    timeoutMs < 1
  ) {
    throw new Error(
      "Resource handoff pickup timeout must be a positive safe integer.",
    );
  }
};

const waitForCollectedInventory =
  async (
    options:
      DeliverCollectedResourcesOptions,
  ): Promise<number> => {
    const expected =
      options.inventoryBefore +
      options.quantity;

    const deadline =
      Date.now() +
      options.pickupTimeoutMs;

    const pollIntervalMs =
      options.pollIntervalMs ??
      100;

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

    if (
      current <
      expected
    ) {
      throw new Error(
        `Collector inventory did not receive ${options.quantity} ${options.itemName} within ${options.pickupTimeoutMs} ms. Expected at least ${expected}, found ${current}.`,
      );
    }

    return current;
  };

export const deliverCollectedResources =
  async (
    options:
      DeliverCollectedResourcesOptions,
  ): Promise<void> => {
    assertQuantity(
      options.quantity,
    );

    assertTimeout(
      options.pickupTimeoutMs,
    );

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

    const inventoryReady =
      await waitForCollectedInventory(
        options,
      );

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