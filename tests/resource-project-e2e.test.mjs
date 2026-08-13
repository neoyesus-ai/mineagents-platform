import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Vec3 } from "vec3";

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
  dimension: "minecraft:overworld",
  min: { x: -32, y: 60, z: -32 },
  max: { x: 32, y: 80, z: 32 },
};

const sourcePosition = {
  dimension: "minecraft:overworld",
  x: 8,
  y: 64,
  z: 0,
};

const handoffPosition = {
  dimension: "minecraft:overworld",
  x: 0,
  y: 64,
  z: 0,
};

const buildPosition = {
  dimension: "minecraft:overworld",
  x: 0,
  y: 64,
  z: 8,
};

const connectionConfig = (coordinatorBaseUrl, username) => ({
  host: "minecraft",
  port: 25565,
  username,
  version: "1.21.11",
  connectTimeoutMs: 30_000,
  chunksTimeoutMs: 30_000,
  movementTimeoutMs: 30_000,
  coordinatorBaseUrl,
  heartbeatIntervalMs: 15_000,
});

const collectorConfig = (coordinatorBaseUrl) => ({
  connection: connectionConfig(coordinatorBaseUrl, "RecolectorE2E"),
  agentId: "collector-e2e",
  pollIntervalMs: 3_000,
  allowedRegion,
  allowedBreakBlocks: ["minecraft:oak_log"],
  maxActionsPerTask: 64,
  handoffPosition,
  handoffPickupTimeoutMs: 2_000,
});

const builderConfig = (coordinatorBaseUrl) => ({
  connection: connectionConfig(coordinatorBaseUrl, "ConstructorE2E"),
  agentId: "builder-e2e",
  pollIntervalMs: 3_000,
  allowedRegion,
  allowedPlaceBlocks: ["minecraft:oak_log"],
  maxPlacementsPerTask: 64,
  handoffPosition,
  handoffPickupTimeoutMs: 2_000,
});

const sameBlockPosition = (left, right) =>
  Math.floor(left.x) === right.x &&
  Math.floor(left.y) === right.y &&
  Math.floor(left.z) === right.z;

const decrementInventory = (inventoryItems, name, quantity) => {
  let remaining = quantity;

  for (const item of inventoryItems) {
    if (item.name !== name || item.count <= 0) {
      continue;
    }

    const removed = Math.min(item.count, remaining);
    item.count -= removed;
    remaining -= removed;

    if (remaining === 0) {
      break;
    }
  }

  assert.equal(
    remaining,
    0,
    `Expected ${quantity} ${name} in synthetic inventory.`,
  );
};

const pushInventoryItem = (inventoryItems, name, quantity) => {
  const existing = inventoryItems.find(
    (item) => item.name === name && item.count > 0,
  );

  if (existing) {
    existing.count += quantity;
    return;
  }

  inventoryItems.push({
    name,
    type: 17,
    metadata: 0,
    count: quantity,
  });
};

const createDroppedItemEntity = (position, itemName) => ({
  position: new Vec3(
    position.x + 0.5,
    position.y,
    position.z + 0.5,
  ),

  getDroppedItem() {
    return {
      name: itemName,
      count: 1,
    };
  },
});

const installCoordinatorClient = (worker, coordinatorUrl) => {
  worker.client = {
    async heartbeat() {
      throw new Error("Unexpected heartbeat from direct worker execution.");
    },

    async claimTask() {
      throw new Error("Unexpected claim from direct worker execution.");
    },

    async patchTask(taskId, input) {
      const { task } = await jsonRequest(
        coordinatorUrl,
        `/tasks/${taskId}`,
        {
          method: "PATCH",
          body: input,
        },
      );

      return task;
    },
  };
};

const claimTask = async (coordinatorUrl, agentId) => {
  const response = await globalThis.fetch(
    `${coordinatorUrl}/tasks/claim`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ agentId }),
    },
  );

  if (response.status === 404) {
    return null;
  }

  assert.equal(response.status, 200);
  const { task } = await response.json();
  return task;
};

const installMovementAndPickup = (
  driver,
  world,
  sharedEntities,
) => {
  driver.moveTo = async (target, regions) => {
    assert.deepEqual(regions, [allowedRegion]);

    world.bot.entity.position = new Vec3(
      target.x,
      target.y,
      target.z,
    );

    for (const [entityId, entity] of Object.entries(sharedEntities)) {
      const dropped = entity.getDroppedItem();

      if (!dropped || !sameBlockPosition(entity.position, target)) {
        continue;
      }

      pushInventoryItem(
        world.inventoryItems,
        dropped.name,
        dropped.count ?? 1,
      );

      delete sharedEntities[entityId];
    }
  };
};

const addWalkableSupport = (world, target) => {
  const supports = [
    { x: target.x, y: target.y - 1, z: target.z },
    { x: target.x + 1, y: target.y - 1, z: target.z },
    { x: target.x - 1, y: target.y - 1, z: target.z },
    { x: target.x, y: target.y - 1, z: target.z + 1 },
    { x: target.x, y: target.y - 1, z: target.z - 1 },
    { x: target.x + 1, y: target.y - 1, z: target.z + 1 },
    { x: target.x + 1, y: target.y - 1, z: target.z - 1 },
    { x: target.x - 1, y: target.y - 1, z: target.z + 1 },
    { x: target.x - 1, y: target.y - 1, z: target.z - 1 },
  ];

  for (const support of supports) {
    world.setBlock(support, "stone");
  }
};

test(
  "planned project transfers a physical resource from collector to builder before construction",
  async (t) => {
    const tempDir = await mkdtemp(
      join(tmpdir(), "mineagents-resource-project-e2e-"),
    );

    const coordinator = createCoordinatorServer({
      dbPath: join(tempDir, "coordinator.sqlite"),
    });

    const coordinatorUrl = await listen(coordinator);

    t.after(async () => {
      await close(coordinator);
      await rm(tempDir, {
        recursive: true,
        force: true,
      });
    });

    const sharedEntities = {};
    let entitySequence = 0;
    const nextEntityId = () => `drop-${++entitySequence}`;

    const collectorWorld = createWritableMineflayerBot({
      onDig: async ({ block, setBlock }) => {
        setBlock(block.position, "air");

        sharedEntities[nextEntityId()] = createDroppedItemEntity(
          {
            x: sourcePosition.x + 1,
            y: sourcePosition.y,
            z: sourcePosition.z,
          },
          "oak_log",
        );
      },

      onToss: async ({ type, count, inventoryItems }) => {
        assert.equal(type, 17);

        decrementInventory(
          inventoryItems,
          "oak_log",
          count,
        );

        sharedEntities[nextEntityId()] = createDroppedItemEntity(
          {
            x: handoffPosition.x + 2,
            y: handoffPosition.y,
            z: handoffPosition.z,
          },
          "oak_log",
        );
      },
    });

    collectorWorld.bot.entities = sharedEntities;
    collectorWorld.bot.entity.position = new Vec3(
      handoffPosition.x,
      handoffPosition.y,
      handoffPosition.z,
    );

    collectorWorld.bot.registry = {
      blocksByName: {
        oak_log: {
          id: 17,
        },
      },
    };

    collectorWorld.setBlock(sourcePosition, "oak_log");
    addWalkableSupport(collectorWorld, sourcePosition);

    collectorWorld.bot.findBlocks = () => [
      new Vec3(
        sourcePosition.x,
        sourcePosition.y,
        sourcePosition.z,
      ),
    ];

    const collectorDriver = new MineflayerDriver(
      collectorWorld.bot,
    );

    installMovementAndPickup(
      collectorDriver,
      collectorWorld,
      sharedEntities,
    );

    let builderWorld;

    builderWorld = createWritableMineflayerBot({
      onPlace: async ({
        bot,
        referenceBlock,
        faceVector,
        setBlock,
      }) => {
        setBlock(
          referenceBlock.position.plus(faceVector),
          bot.heldItem.name,
        );

        decrementInventory(
          builderWorld.inventoryItems,
          bot.heldItem.name,
          1,
        );
      },
    });

    builderWorld.bot.entities = sharedEntities;
    builderWorld.bot.entity.position = new Vec3(4, 64, 4);
    addWalkableSupport(builderWorld, buildPosition);

    const builderDriver = new MineflayerDriver(
      builderWorld.bot,
    );

    installMovementAndPickup(
      builderDriver,
      builderWorld,
      sharedEntities,
    );

    const collectorWorker = new CollectorWorker(
      collectorDriver,
      collectorConfig(coordinatorUrl),
    );

    const builderWorker = new BuilderWorker(
      builderDriver,
      builderConfig(coordinatorUrl),
    );

    installCoordinatorClient(
      collectorWorker,
      coordinatorUrl,
    );

    installCoordinatorClient(
      builderWorker,
      coordinatorUrl,
    );

    const { agent: collectorAgent } = await jsonRequest(
      coordinatorUrl,
      "/agents/heartbeat",
      {
        method: "POST",
        body: {
          name: "collector-resource-e2e",
          role: "collector",
        },
      },
    );

    const { agent: builderAgent } = await jsonRequest(
      coordinatorUrl,
      "/agents/heartbeat",
      {
        method: "POST",
        body: {
          name: "builder-resource-e2e",
          role: "builder",
        },
      },
    );

    const {
      project,
      tasks: plannedTasks,
    } = await jsonRequest(
      coordinatorUrl,
      "/projects/plan",
      {
        method: "POST",
        status: 201,
        body: {
          name: "Physical handoff E2E",
          description:
            "Collector must physically transfer one oak log to the dependent builder.",
          collection: {
            blockName: "minecraft:oak_log",
            quantity: 1,
            search: {
              dimension: "minecraft:overworld",
              maxDistance: 16,
              maxCandidates: 16,
            },
          },
          build: {
            placements: [
              {
                position: buildPosition,
                blockName: "minecraft:oak_log",
              },
            ],
          },
        },
      },
    );

    assert.equal(plannedTasks.length, 2);

    const collectTask = plannedTasks.find(
      (task) => task.kind === "collect-blocks",
    );

    const buildTask = plannedTasks.find(
      (task) => task.kind === "build-blueprint",
    );

    assert.ok(collectTask);
    assert.ok(buildTask);
    assert.equal(collectTask.projectId, project.id);
    assert.equal(buildTask.projectId, project.id);

    assert.deepEqual(
      buildTask.dependsOnTaskIds,
      [collectTask.id],
    );

    assert.equal(
      await claimTask(
        coordinatorUrl,
        builderAgent.id,
      ),
      null,
    );

    const claimedCollectTask = await claimTask(
      coordinatorUrl,
      collectorAgent.id,
    );

    assert.ok(claimedCollectTask);
    assert.equal(claimedCollectTask.id, collectTask.id);

    assert.equal(
      collectorDriver.getInventoryCount("minecraft:oak_log"),
      0,
    );

    assert.equal(
      builderDriver.getInventoryCount("minecraft:oak_log"),
      0,
    );

    await collectorWorker.executeTask(claimedCollectTask);

    assert.equal(
      collectorWorld.blockNameAt(sourcePosition),
      "air",
    );

    assert.equal(
      collectorDriver.getInventoryCount("minecraft:oak_log"),
      0,
    );

    assert.equal(Object.keys(sharedEntities).length, 1);

    const { tasks: afterCollection } = await jsonRequest(
      coordinatorUrl,
      "/tasks",
    );

    const persistedCollectTask = afterCollection.find(
      (task) => task.id === collectTask.id,
    );

    const pendingBuildTask = afterCollection.find(
      (task) => task.id === buildTask.id,
    );
    assert.equal(
      persistedCollectTask.status,
      "completed",
    );

    assert.equal(
      pendingBuildTask.status,
      "pending",
    );

    /*
     * En este punto el collector ya ha:
     *
     * 1. roto el oak_log;
     * 2. recogido el drop físico;
     * 3. viajado al handoff;
     * 4. soltado el oak_log;
     * 5. completado su tarea.
     *
     * El builder sigue sin tener el recurso.
     */
    assert.equal(
      builderDriver.getInventoryCount(
        "minecraft:oak_log",
      ),
      0,
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

    /*
     * La dependencia debe estar satisfecha
     * antes de que el coordinator permita
     * reclamar la tarea del builder.
     */
    assert.deepEqual(
      claimedBuildTask.dependsOnTaskIds,
      [
        collectTask.id,
      ],
    );

    await builderWorker.executeTask(
      claimedBuildTask,
    );

    /*
     * El builder tuvo que recoger el drop
     * físico del handoff antes de poder
     * colocar el bloque.
     */
    assert.equal(
      Object.keys(
        sharedEntities,
      ).length,
      0,
    );

    /*
     * El recurso fue consumido por la
     * construcción.
     */
    assert.equal(
      builderDriver.getInventoryCount(
        "minecraft:oak_log",
      ),
      0,
    );

    assert.equal(
      builderWorld.blockNameAt(
        buildPosition,
      ),
      "oak_log",
    );

    const {
      tasks: finalTasks,
    } =
      await jsonRequest(
        coordinatorUrl,
        "/tasks",
      );

    const finalCollectTask =
      finalTasks.find(
        (task) =>
          task.id ===
          collectTask.id,
      );

    const finalBuildTask =
      finalTasks.find(
        (task) =>
          task.id ===
          buildTask.id,
      );

    assert.ok(
      finalCollectTask,
    );

    assert.ok(
      finalBuildTask,
    );

    assert.equal(
      finalCollectTask.status,
      "completed",
    );

    assert.equal(
      finalBuildTask.status,
      "completed",
    );
  },
);
