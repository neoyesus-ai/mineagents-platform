import assert from "node:assert/strict";
import { test } from "node:test";

import { Vec3 } from "vec3";

import {
  CollectorWorker,
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
      "RecolectorTest",

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
    "collector-test",

  pollIntervalMs:
    3_000,

  allowedRegion,

  allowedBreakBlocks: [
    "minecraft:oak_log",
  ],

  maxActionsPerTask:
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
    "Collector worker test",

  description:
    null,

  kind:
    "collect-blocks",

  requiredRole:
    "collector",

  payload,

  dependsOnTaskIds:
    [],

  status:
    "assigned",

  assignedAgentId:
    "collector-test",

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

test(
  "collector worker discovers a distant block, moves to it and completes the task",
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
      createWritableMineflayerBot();

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

    /*
     * El worker debería escoger (7,64,0)
     * como aproximación:
     *
     * - pies libres
     * - cabeza libre
     * - soporte sólido debajo
     */
    world.setBlock(
      {
        dimension:
          "minecraft:overworld",

        x:
          7,

        y:
          63,

        z:
          0,
      },
      "stone",
    );

    world.bot.registry = {
      blocksByName: {
        oak_log: {
          id:
            17,
        },
      },
    };

    let findBlocksOptions;

    world.bot.findBlocks =
      (options) => {
        findBlocksOptions =
          options;

        return [
          new Vec3(
            target.x,
            target.y,
            target.z,
          ),
        ];
      };

    const movements = [];

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    /*
     * Aquí no probamos otra vez internamente
     * BoundedMovementController.
     *
     * Ese componente ya tiene sus propios
     * tests. Este test comprueba que
     * CollectorWorker solicita movimiento
     * correcto antes de romper.
     */
    driver.moveTo =
      async (
        movementTarget,
        regions,
      ) => {
        assert.equal(
          regions.length,
          1,
        );

        assert.deepEqual(
          regions[0],
          allowedRegion,
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
      new CollectorWorker(
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
          "discovery-movement-task",

        payload: {
          blockName:
            "minecraft:oak_log",

          quantity:
            1,

          search: {
            dimension:
              "minecraft:overworld",

            maxDistance:
              16,

            maxCandidates:
              16,
          },
        },
      });

    await worker.executeTask(
      task,
    );

    assert.equal(
      findBlocksOptions.matching,
      17,
    );

    assert.equal(
      findBlocksOptions.maxDistance,
      16,
    );

    assert.equal(
      findBlocksOptions.count,
      16,
    );

    assert.equal(
      movements.length,
      1,
    );

    assert.deepEqual(
      movements[0],
      {
        x:
          7,

        y:
          64,

        z:
          0,
      },
    );

    assert.deepEqual(
      {
        x:
          Math.floor(
            world.bot.entity
              .position.x,
          ),

        y:
          Math.floor(
            world.bot.entity
              .position.y,
          ),

        z:
          Math.floor(
            world.bot.entity
              .position.z,
          ),
      },
      {
        x:
          7,

        y:
          64,

        z:
          0,
      },
    );

    assert.equal(
      world.blockNameAt(
        target,
      ),
      "air",
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
  "collector worker preserves explicit candidate tasks without autonomous movement",
  async () => {
    const target = {
      dimension:
        "minecraft:overworld",

      x:
        1,

      y:
        64,

      z:
        0,
    };

    const world =
      createWritableMineflayerBot();

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

    world.bot.pathfinder.goto =
      async () => {
        movementCalls +=
          1;

        throw new Error(
          "Legacy candidate task must not move.",
        );
      };

    world.bot.findBlocks =
      () => {
        throw new Error(
          "Legacy candidate task must not discover blocks.",
        );
      };

    world.bot.registry = {
      blocksByName: {
        oak_log: {
          id:
            17,
        },
      },
    };

    const driver =
      new MineflayerDriver(
        world.bot,
      );

    const worker =
      new CollectorWorker(
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
          "legacy-candidate-task",

        payload: {
          blockName:
            "minecraft:oak_log",

          quantity:
            1,

          candidates: [
            target,
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