import assert from "node:assert/strict";
import { test } from "node:test";

import { Vec3 } from "vec3";

import {
  BuilderWorker,
  MineflayerDriver,
} from "../minecraft-driver-mineflayer/dist/index.js";

import {
  createWritableMineflayerBot,
} from "./helpers/mineflayer-write-harness.mjs";

const allowedRegion = {
  dimension:
    "minecraft:overworld",

  min: {
    x: -32,
    y: 60,
    z: -32,
  },

  max: {
    x: 32,
    y: 80,
    z: 32,
  },
};

const createConfig = () => ({
  connection: {
    host:
      "minecraft",

    port:
      25565,

    username:
      "ConstructorTest",

    version:
      "1.21.11",

    connectTimeoutMs:
      30_000,

    chunksTimeoutMs:
      30_000,

    movementTimeoutMs:
      30_000,

    coordinatorBaseUrl:
      "http://coordinator:3000",

    heartbeatIntervalMs:
      15_000,
  },

  agentId:
    "builder-test",

  pollIntervalMs:
    3_000,

  allowedRegion,

  allowedPlaceBlocks: [
    "minecraft:oak_log",
  ],

  maxPlacementsPerTask:
    64,
});

const createTask = ({
  id,
  payload,
}) => ({
  id,

  projectId:
    null,

  title:
    "Builder worker test",

  description:
    null,

  kind:
    "build-blueprint",

  requiredRole:
    "builder",

  payload,

  dependsOnTaskIds:
    [],

  status:
    "assigned",

  assignedAgentId:
    "builder-test",

  failureReason:
    null,

  createdAt:
    "2026-08-12T00:00:00.000Z",

  updatedAt:
    "2026-08-12T00:00:00.000Z",

  startedAt:
    null,

  completedAt:
    null,

  failedAt:
    null,

  cancelledAt:
    null,
});

const installClientStub = (
  worker,
) => {
  const patches = [];

  worker.client = {
    async heartbeat() {
      throw new Error(
        "Unexpected heartbeat.",
      );
    },

    async claimTask() {
      throw new Error(
        "Unexpected claim.",
      );
    },

    async patchTask(
      taskId,
      input,
    ) {
      patches.push({
        taskId,
        input: {
          ...input,
        },
      });

      return {
        id:
          taskId,

        ...input,
      };
    },
  };

  return patches;
};

const createInventoryItem = (
  name,
) => ({
  name,
  count:
    64,
});

test(
  "builder worker moves to a distant placement and completes the task",
  async () => {
    const target = {
      dimension:
        "minecraft:overworld",

      x:
        8,

      y:
        64,

      z:
        0,
    };

    const world =
      createWritableMineflayerBot({
        items: [
          createInventoryItem(
            "oak_log",
          ),
        ],
      });

    world.bot.entity.position =
      new Vec3(
        0,
        64,
        0,
      );

    /*
     * Soporte para la posición objetivo.
     */
    world.setBlock(
      {
        x:
          8,

        y:
          63,

        z:
          0,
      },
      "stone",
    );

    /*
     * Soporte para el approach esperado:
     * (7,64,0).
     */
    world.setBlock(
      {
        x:
          7,

        y:
          63,

        z:
          0,
      },
      "stone",
    );

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    const movements = [];

    driver.moveTo =
      async (
        movementTarget,
        regions,
      ) => {
        assert.deepEqual(
          regions,
          [
            allowedRegion,
          ],
        );

        movements.push({
          x:
            movementTarget.x,

          y:
            movementTarget.y,

          z:
            movementTarget.z,
        });

        world.bot.entity.position =
          new Vec3(
            movementTarget.x,
            movementTarget.y,
            movementTarget.z,
          );
      };

    const worker =
      new BuilderWorker(
        driver,
        createConfig(),
      );

    const patches =
      installClientStub(
        worker,
      );

    const task =
      createTask({
        id:
          "builder-movement-task",

        payload: {
          placements: [
            {
              position:
                target,

              blockName:
                "minecraft:oak_log",
            },
          ],
        },
      });

    await worker.executeTask(
      task,
    );

    assert.deepEqual(
      movements,
      [
        {
          x:
            7,

          y:
            64,

          z:
            0,
        },
      ],
    );

    assert.equal(
      world.blockNameAt(
        target,
      ),
      "oak_log",
    );

    assert.deepEqual(
      patches,
      [
        {
          taskId:
            task.id,

          input: {
            status:
              "running",
          },
        },

        {
          taskId:
            task.id,

          input: {
            status:
              "completed",

            failureReason:
              null,
          },
        },
      ],
    );
  },
);

test(
  "builder worker repositions between distant placements",
  async () => {
    const first = {
      dimension:
        "minecraft:overworld",

      x:
        8,

      y:
        64,

      z:
        0,
    };

    const second = {
      dimension:
        "minecraft:overworld",

      x:
        0,

      y:
        64,

      z:
        8,
    };

    const world =
      createWritableMineflayerBot({
        items: [
          createInventoryItem(
            "oak_log",
          ),
        ],
      });

    world.bot.entity.position =
      new Vec3(
        0,
        64,
        0,
      );

    for (
      const support
      of [
        {
          x:
            8,
          y:
            63,
          z:
            0,
        },
        {
          x:
            7,
          y:
            63,
          z:
            0,
        },
        {
          x:
            0,
          y:
            63,
          z:
            8,
        },
        {
          x:
            0,
          y:
            63,
          z:
            7,
        },
      ]
    ) {
      world.setBlock(
        support,
        "stone",
      );
    }

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    const movements = [];

    driver.moveTo =
      async (
        target,
      ) => {
        movements.push({
          x:
            target.x,

          y:
            target.y,

          z:
            target.z,
        });

        world.bot.entity.position =
          new Vec3(
            target.x,
            target.y,
            target.z,
          );
      };

    const worker =
      new BuilderWorker(
        driver,
        createConfig(),
      );

    const patches =
      installClientStub(
        worker,
      );

    const task =
      createTask({
        id:
          "builder-multi-movement-task",

        payload: {
          placements: [
            {
              position:
                first,

              blockName:
                "minecraft:oak_log",
            },

            {
              position:
                second,

              blockName:
                "minecraft:oak_log",
            },
          ],
        },
      });

    await worker.executeTask(
      task,
    );

    assert.equal(
      movements.length,
      2,
    );

    assert.equal(
      world.blockNameAt(
        first,
      ),
      "oak_log",
    );

    assert.equal(
      world.blockNameAt(
        second,
      ),
      "oak_log",
    );

    assert.equal(
      patches.at(-1)
        .input
        .status,
      "completed",
    );
  },
);

test(
  "builder worker does not move or write when placement is already satisfied",
  async () => {
    const target = {
      dimension:
        "minecraft:overworld",

      x:
        8,

      y:
        64,

      z:
        0,
    };

    const world =
      createWritableMineflayerBot({
        items: [
          createInventoryItem(
            "oak_log",
          ),
        ],
      });

    world.bot.entity.position =
      new Vec3(
        0,
        64,
        0,
      );

    world.setBlock(
      target,
      "oak_log",
    );

    let movementCalls =
      0;

    driverlessSetup:
    {
      /*
       * Etiqueta deliberadamente vacía para
       * mantener este test visualmente separado.
       */
    }

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    driver.moveTo =
      async () => {
        movementCalls +=
          1;
      };

    const worker =
      new BuilderWorker(
        driver,
        createConfig(),
      );

    const patches =
      installClientStub(
        worker,
      );

    const task =
      createTask({
        id:
          "builder-satisfied-task",

        payload: {
          placements: [
            {
              position:
                target,

              blockName:
                "minecraft:oak_log",
            },
          ],
        },
      });

    await worker.executeTask(
      task,
    );

    assert.equal(
      movementCalls,
      0,
    );

    assert.equal(
      world.placeCall,
      undefined,
    );

    assert.deepEqual(
      patches,
      [
        {
          taskId:
            task.id,

          input: {
            status:
              "running",
          },
        },

        {
          taskId:
            task.id,

          input: {
            status:
              "completed",

            failureReason:
              null,
          },
        },
      ],
    );
  },
);

test(
  "builder worker fails closed when no walkable approach exists",
  async () => {
    const target = {
      dimension:
        "minecraft:overworld",

      x:
        8,

      y:
        64,

      z:
        0,
    };

    const world =
      createWritableMineflayerBot({
        items: [
          createInventoryItem(
            "oak_log",
          ),
        ],
      });

    world.bot.entity.position =
      new Vec3(
        0,
        64,
        0,
      );

    /*
     * Bloqueamos todas las posiciones
     * candidatas de aproximación.
     */
    for (
      const blocked
      of [
        { x: 9, y: 64, z: 0 },
        { x: 7, y: 64, z: 0 },
        { x: 8, y: 64, z: 1 },
        { x: 8, y: 64, z: -1 },
        { x: 9, y: 64, z: 1 },
        { x: 9, y: 64, z: -1 },
        { x: 7, y: 64, z: 1 },
        { x: 7, y: 64, z: -1 },
      ]
    ) {
      world.setBlock(
        blocked,
        "stone",
      );
    }

    /*
     * El objetivo debe seguir vacío para que
     * BuilderAgent lo considere pendiente.
     */
    world.setBlock(
      {
        x:
          8,

        y:
          63,

        z:
          0,
      },
      "stone",
    );

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    let movementCalls =
      0;

    driver.moveTo =
      async () => {
        movementCalls +=
          1;
      };

    const worker =
      new BuilderWorker(
        driver,
        createConfig(),
      );

    const patches =
      installClientStub(
        worker,
      );

    const task =
      createTask({
        id:
          "builder-unreachable-task",

        payload: {
          placements: [
            {
              position:
                target,

              blockName:
                "minecraft:oak_log",
            },
          ],
        },
      });

    await worker.executeTask(
      task,
    );

    assert.equal(
      movementCalls,
      0,
    );

    assert.equal(
      world.blockNameAt(
        target,
      ),
      "air",
    );

    assert.equal(
      patches.length,
      2,
    );

    assert.equal(
      patches[0]
        .input
        .status,
      "running",
    );

    assert.equal(
      patches[1]
        .input
        .status,
      "failed",
    );

    assert.match(
      patches[1]
        .input
        .failureReason,
      /Builder failed while placing an approved block/,
    );
  },
);
