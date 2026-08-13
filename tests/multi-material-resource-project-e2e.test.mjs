import assert from "node:assert/strict";

import {
  mkdtemp,
  rm,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  test,
} from "node:test";

import {
  Vec3,
} from "vec3";

import {
  createCoordinatorServer,
} from "../coordinator/dist/index.js";

import {
  BuilderWorker,
  CollectorWorker,
  MineflayerDriver,
} from "../minecraft-driver-mineflayer/dist/index.js";

import {
  createWritableMineflayerBot,
} from "./helpers/mineflayer-write-harness.mjs";

import {
  close,
  jsonRequest,
  listen,
} from "./helpers/mvp-harness.mjs";

const allowedRegion = {
  dimension:
    "minecraft:overworld",

  min: {
    x:
      -32,

    y:
      60,

    z:
      -32,
  },

  max: {
    x:
      32,

    y:
      80,

    z:
      32,
  },
};

const handoffPosition = {
  dimension:
    "minecraft:overworld",

  x:
    0,

  y:
    64,

  z:
    0,
};

const oakSource = {
  dimension:
    "minecraft:overworld",

  x:
    8,

  y:
    64,

  z:
    0,
};

const cobblestoneSource = {
  dimension:
    "minecraft:overworld",

  x:
    10,

  y:
    64,

  z:
    0,
};

const oakBuild = {
  dimension:
    "minecraft:overworld",

  x:
    0,

  y:
    64,

  z:
    8,
};

const cobblestoneBuild = {
  dimension:
    "minecraft:overworld",

  x:
    2,

  y:
    64,

  z:
    8,
};

const connectionConfig = (
  coordinatorBaseUrl,
  username,
) => ({
  host:
    "minecraft",

  port:
    25565,

  username,

  version:
    "1.21.11",

  connectTimeoutMs:
    30_000,

  chunksTimeoutMs:
    30_000,

  movementTimeoutMs:
    30_000,

  coordinatorBaseUrl,

  heartbeatIntervalMs:
    15_000,
});

const collectorConfig = (
  coordinatorBaseUrl,
) => ({
  connection:
    connectionConfig(
      coordinatorBaseUrl,
      "RecolectorMultiMaterialE2E",
    ),

  agentId:
    "collector-multi-material-e2e",

  pollIntervalMs:
    3_000,

  allowedRegion,

  allowedBreakBlocks: [
    "minecraft:oak_log",
    "minecraft:cobblestone",
  ],

  maxActionsPerTask:
    64,

  handoffPosition,

  handoffPickupTimeoutMs:
    2_000,
});

const builderConfig = (
  coordinatorBaseUrl,
) => ({
  connection:
    connectionConfig(
      coordinatorBaseUrl,
      "ConstructorMultiMaterialE2E",
    ),

  agentId:
    "builder-multi-material-e2e",

  pollIntervalMs:
    3_000,

  allowedRegion,

  allowedPlaceBlocks: [
    "minecraft:oak_log",
    "minecraft:cobblestone",
  ],

  maxPlacementsPerTask:
    64,

  handoffPosition,

  handoffPickupTimeoutMs:
    2_000,
});

const sameBlockPosition = (
  left,
  right,
) =>
  Math.floor(
    left.x,
  ) ===
    right.x &&
  Math.floor(
    left.y,
  ) ===
    right.y &&
  Math.floor(
    left.z,
  ) ===
    right.z;

const decrementInventory = (
  inventoryItems,
  name,
  quantity,
) => {
  let remaining =
    quantity;

  for (
    const item
    of inventoryItems
  ) {
    if (
      item.name !==
        name ||
      item.count <=
        0
    ) {
      continue;
    }

    const removed =
      Math.min(
        item.count,
        remaining,
      );

    item.count -=
      removed;

    remaining -=
      removed;

    if (
      remaining ===
      0
    ) {
      break;
    }
  }

  assert.equal(
    remaining,
    0,
    `Expected ${quantity} ${name} in synthetic inventory.`,
  );
};

const pushInventoryItem = (
  inventoryItems,
  name,
  type,
  quantity,
) => {
  const existing =
    inventoryItems.find(
      (
        item,
      ) =>
        item.name ===
          name &&
        item.count >
          0,
    );

  if (
    existing
  ) {
    existing.count +=
      quantity;

    return;
  }

  inventoryItems.push({
    name,

    type,

    metadata:
      0,

    count:
      quantity,
  });
};

const itemTypeByName = {
  oak_log:
    17,

  cobblestone:
    4,
};

const itemNameByType = {
  17:
    "oak_log",

  4:
    "cobblestone",
};

const createDroppedItemEntity = (
  position,
  itemName,
  count = 1,
) => ({
  position:
    new Vec3(
      position.x +
        0.5,

      position.y,

      position.z +
        0.5,
    ),

  getDroppedItem() {
    return {
      name:
        itemName,

      count,
    };
  },
});

const installCoordinatorClient = (
  worker,
  coordinatorUrl,
) => {
  worker.client = {
    async heartbeat() {
      throw new Error(
        "Unexpected heartbeat from direct worker execution.",
      );
    },

    async claimTask() {
      throw new Error(
        "Unexpected claim from direct worker execution.",
      );
    },

    async patchTask(
      taskId,
      input,
    ) {
      const {
        task,
      } =
        await jsonRequest(
          coordinatorUrl,
          `/tasks/${taskId}`,
          {
            method:
              "PATCH",

            body:
              input,
          },
        );

      return task;
    },
  };
};

const claimTask = async (
  coordinatorUrl,
  agentId,
) => {
  const response =
    await globalThis.fetch(
      `${coordinatorUrl}/tasks/claim`,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",
        },

        body:
          JSON.stringify({
            agentId,
          }),
      },
    );

  if (
    response.status ===
    404
  ) {
    return null;
  }

  assert.equal(
    response.status,
    200,
  );

  const {
    task,
  } =
    await response.json();

  return task;
};

const installMovementAndPickup = (
  driver,
  world,
  sharedEntities,
) => {
  driver.moveTo =
    async (
      target,
      regions,
    ) => {
      assert.deepEqual(
        regions,
        [
          allowedRegion,
        ],
      );

      world.bot.entity.position =
        new Vec3(
          target.x,
          target.y,
          target.z,
        );

      for (
        const [
          entityId,
          entity,
        ]
        of Object.entries(
          sharedEntities,
        )
      ) {
        const dropped =
          entity.getDroppedItem();

        if (
          !dropped ||
          !sameBlockPosition(
            entity.position,
            target,
          )
        ) {
          continue;
        }

        const type =
          itemTypeByName[
            dropped.name
          ];

        assert.ok(
          type,
          `Unknown synthetic item type for ${dropped.name}.`,
        );

        pushInventoryItem(
          world.inventoryItems,
          dropped.name,
          type,
          dropped.count ??
            1,
        );

        delete sharedEntities[
          entityId
        ];
      }
    };
};

const addWalkableSupport = (
  world,
  target,
) => {
  const supports = [
    {
      x:
        target.x,

      y:
        target.y -
        1,

      z:
        target.z,
    },

    {
      x:
        target.x +
        1,

      y:
        target.y -
        1,

      z:
        target.z,
    },

    {
      x:
        target.x -
        1,

      y:
        target.y -
        1,

      z:
        target.z,
    },

    {
      x:
        target.x,

      y:
        target.y -
        1,

      z:
        target.z +
        1,
    },

    {
      x:
        target.x,

      y:
        target.y -
        1,

      z:
        target.z -
        1,
    },

    {
      x:
        target.x +
        1,

      y:
        target.y -
        1,

      z:
        target.z +
        1,
    },

    {
      x:
        target.x +
        1,

      y:
        target.y -
        1,

      z:
        target.z -
        1,
    },

    {
      x:
        target.x -
        1,

      y:
        target.y -
        1,

      z:
        target.z +
        1,
    },

    {
      x:
        target.x -
        1,

      y:
        target.y -
        1,

      z:
        target.z -
        1,
    },
  ];

  for (
    const support
    of supports
  ) {
    world.setBlock(
      support,
      "stone",
    );
  }
};

test(
  "multi-material project physically transfers every resource before building",
  async (t) => {
    const tempDir =
      await mkdtemp(
        join(
          tmpdir(),
          "mineagents-multi-material-resource-e2e-",
        ),
      );

    const coordinator =
      createCoordinatorServer({
        dbPath:
          join(
            tempDir,
            "coordinator.sqlite",
          ),
      });

    const coordinatorUrl =
      await listen(
        coordinator,
      );

    t.after(
      async () => {
        await close(
          coordinator,
        );

        await rm(
          tempDir,
          {
            recursive:
              true,

            force:
              true,
          },
        );
      },
    );

    const sharedEntities =
      {};

    let entitySequence =
      0;

    const nextEntityId =
      () =>
        `multi-material-drop-${++entitySequence}`;

    const collectorWorld =
      createWritableMineflayerBot({
        onDig:
          async ({
            block,
            setBlock,
          }) => {
            const itemName =
              block.name;

            assert.ok(
              itemTypeByName[
                itemName
              ],
              `Unexpected block ${itemName}.`,
            );

            setBlock(
              block.position,
              "air",
            );

            /*
             * Simulamos un drop real desplazado
             * un bloque respecto al bloque roto.
             */
            sharedEntities[
              nextEntityId()
            ] =
              createDroppedItemEntity(
                {
                  x:
                    block.position.x +
                    1,

                  y:
                    block.position.y,

                  z:
                    block.position.z,
                },

                itemName,
              );
          },

        onToss:
          async ({
            type,
            count,
            inventoryItems,
          }) => {
            const itemName =
              itemNameByType[
                type
              ];

            assert.ok(
              itemName,
              `Unexpected inventory type ${type}.`,
            );

            decrementInventory(
              inventoryItems,
              itemName,
              count,
            );

            /*
             * Cada collection deja su recurso
             * físicamente cerca del mismo handoff.
             */
            sharedEntities[
              nextEntityId()
            ] =
              createDroppedItemEntity(
                {
                  x:
                    handoffPosition.x +
                    2,

                  y:
                    handoffPosition.y,

                  z:
                    handoffPosition.z,
                },

                itemName,

                count,
              );
          },
      });

    collectorWorld.bot.entities =
      sharedEntities;

    collectorWorld.bot.entity.position =
      new Vec3(
        handoffPosition.x,
        handoffPosition.y,
        handoffPosition.z,
      );

    collectorWorld.bot.registry = {
      blocksByName: {
        oak_log: {
          id:
            17,
        },

        cobblestone: {
          id:
            4,
        },
      },
    };

    collectorWorld.setBlock(
      oakSource,
      "oak_log",
    );

    collectorWorld.setBlock(
      cobblestoneSource,
      "cobblestone",
    );

    addWalkableSupport(
      collectorWorld,
      oakSource,
    );

    addWalkableSupport(
      collectorWorld,
      cobblestoneSource,
    );

    collectorWorld.bot.findBlocks =
      (
        options,
      ) => {
        if (
          options.matching ===
          17
        ) {
          return [
            new Vec3(
              oakSource.x,
              oakSource.y,
              oakSource.z,
            ),
          ];
        }

        if (
          options.matching ===
          4
        ) {
          return [
            new Vec3(
              cobblestoneSource.x,
              cobblestoneSource.y,
              cobblestoneSource.z,
            ),
          ];
        }

        return [];
      };

    const collectorDriver =
      new MineflayerDriver(
        collectorWorld.bot,
      );

    installMovementAndPickup(
      collectorDriver,
      collectorWorld,
      sharedEntities,
    );

    let builderWorld;

    builderWorld =
      createWritableMineflayerBot({
        onPlace:
          async ({
            bot,
            referenceBlock,
            faceVector,
            setBlock,
          }) => {
            const heldItemName =
              bot.heldItem
                ?.name;

            assert.ok(
              heldItemName,
            );

            setBlock(
              referenceBlock
                .position
                .plus(
                  faceVector,
                ),

              heldItemName,
            );

            decrementInventory(
              builderWorld
                .inventoryItems,

              heldItemName,

              1,
            );
          },
      });

    builderWorld.bot.entities =
      sharedEntities;

    builderWorld.bot.entity.position =
      new Vec3(
        4,
        64,
        4,
      );

    addWalkableSupport(
      builderWorld,
      oakBuild,
    );

    addWalkableSupport(
      builderWorld,
      cobblestoneBuild,
    );

    const builderDriver =
      new MineflayerDriver(
        builderWorld.bot,
      );

    installMovementAndPickup(
      builderDriver,
      builderWorld,
      sharedEntities,
    );

    const collectorWorker =
      new CollectorWorker(
        collectorDriver,
        collectorConfig(
          coordinatorUrl,
        ),
      );

    const builderWorker =
      new BuilderWorker(
        builderDriver,
        builderConfig(
          coordinatorUrl,
        ),
      );

    installCoordinatorClient(
      collectorWorker,
      coordinatorUrl,
    );

    installCoordinatorClient(
      builderWorker,
      coordinatorUrl,
    );

    const {
      agent:
        collectorAgent,
    } =
      await jsonRequest(
        coordinatorUrl,
        "/agents/heartbeat",
        {
          method:
            "POST",

          body: {
            name:
              "collector-multi-material",

            role:
              "collector",
          },
        },
      );

    const {
      agent:
        builderAgent,
    } =
      await jsonRequest(
        coordinatorUrl,
        "/agents/heartbeat",
        {
          method:
            "POST",

          body: {
            name:
              "builder-multi-material",

            role:
              "builder",
          },
        },
      );

    const {
      project,
      tasks:
        plannedTasks,
    } =
      await jsonRequest(
        coordinatorUrl,
        "/projects/plan",
        {
          method:
            "POST",

          status:
            201,

          body: {
            name:
              "Oak and cobblestone E2E",

            description:
              "Both physical materials must reach the builder before construction.",

            collections: [
              {
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

              {
                blockName:
                  "minecraft:cobblestone",

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
            ],

            build: {
              placements: [
                {
                  position:
                    oakBuild,

                  blockName:
                    "minecraft:oak_log",
                },

                {
                  position:
                    cobblestoneBuild,

                  blockName:
                    "minecraft:cobblestone",
                },
              ],
            },
          },
        },
      );

    assert.equal(
      plannedTasks.length,
      3,
    );

    const oakTask =
      plannedTasks.find(
        (
          task,
        ) =>
          task.kind ===
            "collect-blocks" &&
          task.payload
            .blockName ===
            "minecraft:oak_log",
      );

    const cobblestoneTask =
      plannedTasks.find(
        (
          task,
        ) =>
          task.kind ===
            "collect-blocks" &&
          task.payload
            .blockName ===
            "minecraft:cobblestone",
      );

    const buildTask =
      plannedTasks.find(
        (
          task,
        ) =>
          task.kind ===
          "build-blueprint",
      );

    assert.ok(
      oakTask,
    );

    assert.ok(
      cobblestoneTask,
    );

    assert.ok(
      buildTask,
    );

    assert.equal(
      oakTask.projectId,
      project.id,
    );

    assert.equal(
      cobblestoneTask.projectId,
      project.id,
    );

    assert.equal(
      buildTask.projectId,
      project.id,
    );

    assert.deepEqual(
      new Set(
        buildTask.dependsOnTaskIds,
      ),

      new Set([
        oakTask.id,
        cobblestoneTask.id,
      ]),
    );

    /*
     * El builder no puede empezar mientras
     * falten collections.
     */
    assert.equal(
      await claimTask(
        coordinatorUrl,
        builderAgent.id,
      ),
      null,
    );

    const firstCollection =
      await claimTask(
        coordinatorUrl,
        collectorAgent.id,
      );

    assert.ok(
      firstCollection,
    );

    assert.equal(
      firstCollection.kind,
      "collect-blocks",
    );

    await collectorWorker
      .executeTask(
        firstCollection,
      );

    /*
     * Solo una de las dos collections está
     * terminada: build continúa bloqueada.
     */
    assert.equal(
      await claimTask(
        coordinatorUrl,
        builderAgent.id,
      ),
      null,
    );

    const secondCollection =
      await claimTask(
        coordinatorUrl,
        collectorAgent.id,
      );

    assert.ok(
      secondCollection,
    );

    assert.equal(
      secondCollection.kind,
      "collect-blocks",
    );

    assert.notEqual(
      secondCollection.id,
      firstCollection.id,
    );

    await collectorWorker
      .executeTask(
        secondCollection,
      );

    /*
     * Los dos bloques originales deben haber
     * desaparecido.
     */
    assert.equal(
      collectorWorld
        .blockNameAt(
          oakSource,
        ),
      "air",
    );

    assert.equal(
      collectorWorld
        .blockNameAt(
          cobblestoneSource,
        ),
      "air",
    );

    /*
     * Collector entregó ambos materiales y
     * quedó sin ellos.
     */
    assert.equal(
      collectorDriver
        .getInventoryCount(
          "minecraft:oak_log",
        ),
      0,
    );

    assert.equal(
      collectorDriver
        .getInventoryCount(
          "minecraft:cobblestone",
        ),
      0,
    );

    /*
     * Deben existir físicamente dos drops,
     * uno por material, antes de que Builder
     * reclame su tarea.
     */
    assert.equal(
      Object.keys(
        sharedEntities,
      ).length,
      2,
    );

    const claimedBuildTask =
      await claimTask(
        coordinatorUrl,
        builderAgent.id,
      );

    assert.ok(
      claimedBuildTask,
    );

    assert.equal(
      claimedBuildTask.id,
      buildTask.id,
    );

    assert.equal(
      builderDriver
        .getInventoryCount(
          "minecraft:oak_log",
        ),
      0,
    );

    assert.equal(
      builderDriver
        .getInventoryCount(
          "minecraft:cobblestone",
        ),
      0,
    );

    await builderWorker
      .executeTask(
        claimedBuildTask,
      );

    /*
     * Los drops del handoff fueron recogidos.
     */
    assert.equal(
      Object.keys(
        sharedEntities,
      ).length,
      0,
    );

    /*
     * Ambos materiales fueron consumidos por
     * las dos colocaciones.
     */
    assert.equal(
      builderDriver
        .getInventoryCount(
          "minecraft:oak_log",
        ),
      0,
    );

    assert.equal(
      builderDriver
        .getInventoryCount(
          "minecraft:cobblestone",
        ),
      0,
    );

    assert.equal(
      builderWorld
        .blockNameAt(
          oakBuild,
        ),
      "oak_log",
    );

    assert.equal(
      builderWorld
        .blockNameAt(
          cobblestoneBuild,
        ),
      "cobblestone",
    );

    const {
      tasks:
        finalTasks,
    } =
      await jsonRequest(
        coordinatorUrl,
        "/tasks",
      );

    const finalOakTask =
      finalTasks.find(
        (
          task,
        ) =>
          task.id ===
          oakTask.id,
      );

    const finalCobblestoneTask =
      finalTasks.find(
        (
          task,
        ) =>
          task.id ===
          cobblestoneTask.id,
      );

    const finalBuildTask =
      finalTasks.find(
        (
          task,
        ) =>
          task.id ===
          buildTask.id,
      );

    assert.ok(
      finalOakTask,
    );

    assert.ok(
      finalCobblestoneTask,
    );

    assert.ok(
      finalBuildTask,
    );

    assert.equal(
      finalOakTask.status,
      "completed",
    );

    assert.equal(
      finalCobblestoneTask.status,
      "completed",
    );

    assert.equal(
      finalBuildTask.status,
      "completed",
    );

    assert.equal(
      finalOakTask.failureReason,
      null,
    );

    assert.equal(
      finalCobblestoneTask.failureReason,
      null,
    );

    assert.equal(
      finalBuildTask.failureReason,
      null,
    );

    /*
     * Build solo pudo comenzar después de
     * completar las dos dependencies.
     */
    const latestCollectionCompletion =
      Math.max(
        Date.parse(
          finalOakTask.completedAt,
        ),

        Date.parse(
          finalCobblestoneTask.completedAt,
        ),
      );

    assert.ok(
      Date.parse(
        finalBuildTask.startedAt,
      ) >=
        latestCollectionCompletion,
    );
  },
);
