import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MineflayerDriver,
  MineflayerDriverError,
} from "../minecraft-driver-mineflayer/dist/index.js";

import {
  createWritableMineflayerBot,
} from "./helpers/mineflayer-write-harness.mjs";

const oakStack = (
  count,
  overrides = {},
) => ({
  name:
    "oak_log",

  type:
    17,

  metadata:
    null,

  count,

  ...overrides,
});

test(
  "Mineflayer driver counts inventory across multiple stacks",
  () => {
    const world =
      createWritableMineflayerBot({
        items: [
          oakStack(
            3,
          ),

          {
            name:
              "stone",

            type:
              1,

            metadata:
              null,

            count:
              64,
          },

          oakStack(
            5,
          ),
        ],
      });

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    assert.equal(
      driver.getInventoryCount(
        "minecraft:oak_log",
      ),
      8,
    );

    assert.equal(
      driver.getInventoryCount(
        "minecraft:stone",
      ),
      64,
    );

    assert.equal(
      driver.getInventoryCount(
        "minecraft:dirt",
      ),
      0,
    );

    assert.equal(
      driver.hasInventoryItem(
        "minecraft:oak_log",
      ),
      true,
    );

    assert.equal(
      driver.hasInventoryItem(
        "minecraft:dirt",
      ),
      false,
    );
  },
);

test(
  "Mineflayer driver drops an exact inventory quantity and verifies the result",
  async () => {
    const world =
      createWritableMineflayerBot({
        items: [
          oakStack(
            5,
          ),
        ],
      });

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    assert.equal(
      driver.getInventoryCount(
        "minecraft:oak_log",
      ),
      5,
    );

    await driver.dropInventoryItem(
      "minecraft:oak_log",
      2,
    );

    assert.equal(
      world.bot
        .tossCall
        .type,
      17,
    );

    assert.equal(
      world.bot
        .tossCall
        .metadata,
      null,
    );

    assert.equal(
      world.bot
        .tossCall
        .count,
      2,
    );

    assert.equal(
      driver.getInventoryCount(
        "minecraft:oak_log",
      ),
      3,
    );

    assert.equal(
      world.inventoryCount(
        "oak_log",
      ),
      3,
    );
  },
);

test(
  "Mineflayer driver rejects invalid inventory operations before toss",
  async () => {
    const world =
      createWritableMineflayerBot({
        items: [
          oakStack(
            5,
          ),
        ],
      });

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    await assert.rejects(
      driver.dropInventoryItem(
        "oak_log",
        1,
      ),

      (
        error,
      ) =>
        error instanceof
          MineflayerDriverError &&
        error.code ===
          "INVALID_WRITE_REQUEST",
    );

    await assert.rejects(
      driver.dropInventoryItem(
        "minecraft:oak_log",
        0,
      ),

      (
        error,
      ) =>
        error instanceof
          MineflayerDriverError &&
        error.code ===
          "INVALID_WRITE_REQUEST",
    );

    await assert.rejects(
      driver.dropInventoryItem(
        "minecraft:oak_log",
        257,
      ),

      (
        error,
      ) =>
        error instanceof
          MineflayerDriverError &&
        error.code ===
          "INVALID_WRITE_REQUEST",
    );

    assert.equal(
      world.bot.tossCall,
      undefined,
    );
  },
);

test(
  "Mineflayer driver rejects inventory drops larger than available inventory",
  async () => {
    const world =
      createWritableMineflayerBot({
        items: [
          oakStack(
            2,
          ),
        ],
      });

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    await assert.rejects(
      driver.dropInventoryItem(
        "minecraft:oak_log",
        3,
      ),

      (
        error,
      ) =>
        error instanceof
          MineflayerDriverError &&
        error.code ===
          "ITEM_NOT_AVAILABLE",
    );

    assert.equal(
      driver.getInventoryCount(
        "minecraft:oak_log",
      ),
      2,
    );

    assert.equal(
      world.bot.tossCall,
      undefined,
    );
  },
);

test(
  "Mineflayer driver wraps toss failures and preserves inventory",
  async () => {
    const world =
      createWritableMineflayerBot({
        items: [
          oakStack(
            4,
          ),
        ],

        async onToss() {
          throw new Error(
            "simulated toss failure",
          );
        },
      });

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    await assert.rejects(
      driver.dropInventoryItem(
        "minecraft:oak_log",
        2,
      ),

      (
        error,
      ) =>
        error instanceof
          MineflayerDriverError &&
        error.code ===
          "WRITE_FAILED" &&
        /simulated toss failure/.test(
          error.message,
        ),
    );

    assert.equal(
      driver.getInventoryCount(
        "minecraft:oak_log",
      ),
      4,
    );
  },
);

test(
  "Mineflayer driver detects inventory drop verification failures",
  async () => {
    const world =
      createWritableMineflayerBot({
        items: [
          oakStack(
            4,
          ),
        ],

        /*
         * Simulamos que Mineflayer informa
         * éxito pero el inventario no cambia.
         */
        async onToss() {
          return;
        },
      });

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    await assert.rejects(
      driver.dropInventoryItem(
        "minecraft:oak_log",
        2,
      ),

      (
        error,
      ) =>
        error instanceof
          MineflayerDriverError &&
        error.code ===
          "WRITE_VERIFICATION_FAILED",
    );

    assert.equal(
      driver.getInventoryCount(
        "minecraft:oak_log",
      ),
      4,
    );
  },
);

test(
  "Mineflayer driver serializes inventory drops against other mutating operations",
  async () => {
    let releaseToss;

    let notifyStarted;

    const tossStarted =
      new Promise(
        (
          resolve,
        ) => {
          notifyStarted =
            resolve;
        },
      );

    const world =
      createWritableMineflayerBot({
        items: [
          oakStack(
            4,
          ),
        ],

        async onToss({
          inventoryItems,
          count,
        }) {
          notifyStarted();

          await new Promise(
            (
              resolve,
            ) => {
              releaseToss =
                () => {
                  inventoryItems[0]
                    .count -=
                    count;

                  resolve();
                };
            },
          );
        },
      });

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    const dropping =
      driver.dropInventoryItem(
        "minecraft:oak_log",
        1,
      );

    /*
     * Esperamos hasta que toss()
     * esté realmente ejecutándose.
     *
     * En este momento runExclusive()
     * mantiene "inventory drop"
     * como operación activa.
     */
    await tossStarted;

    await assert.rejects(
      driver.moveTo(
        {
          dimension:
            "minecraft:overworld",

          x:
            1,

          y:
            64,

          z:
            0,
        },

        [
          {
            dimension:
              "minecraft:overworld",

            min: {
              x:
                -10,

              y:
                0,

              z:
                -10,
            },

            max: {
              x:
                10,

              y:
                100,

              z:
                10,
            },
          },
        ],
      ),

      (
        error,
      ) =>
        error instanceof
          MineflayerDriverError &&
        error.code ===
          "OPERATION_IN_PROGRESS",
    );

    /*
     * Permitimos terminar el toss.
     */
    releaseToss();

    await dropping;

    assert.equal(
      driver.getInventoryCount(
        "minecraft:oak_log",
      ),
      3,
    );
  },
);