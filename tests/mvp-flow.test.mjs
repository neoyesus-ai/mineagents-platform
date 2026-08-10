import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  CollectorAgent,
} from "../agents/collector/dist/index.js";

import {
  BuilderAgent,
} from "../agents/builder/dist/index.js";

import {
  compileBlueprint,
} from "../blueprints/dist/index.js";

import {
  createCoordinatorServer,
} from "../coordinator/dist/index.js";

import {
  createDashboardServer,
} from "../dashboard/dist/index.js";

import {
  SafeMinecraftAdapter,
} from "../minecraft-adapter/dist/index.js";

import {
  close,
  createWorldDriver,
  jsonRequest,
  listen,
  positionKey,
} from "./helpers/mvp-harness.mjs";

const region = {
  dimension: "minecraft:overworld",

  min: {
    x: 0,
    y: 60,
    z: 0,
  },

  max: {
    x: 12,
    y: 70,
    z: 12,
  },
};

const position = (
  x,
  z,
) => ({
  dimension:
    "minecraft:overworld",

  x,
  y: 64,
  z,
});

const authorization = (
  taskId,
  id,
  action,
  allowedRegion,
  maxActions,
) => ({
  id,
  taskId,

  allowedActions: [
    action,
  ],

  allowedRegion,

  expiresAt:
    "2031-01-01T00:00:00.000Z",

  maxActions,
});

test(
  "MVP flow persists coordinated collector and blueprint builder work",
  async (t) => {
    const tempDir =
      await mkdtemp(
        join(
          tmpdir(),
          "mineagents-mvp-flow-",
        ),
      );

    const dbPath =
      join(
        tempDir,
        "coordinator.sqlite",
      );

    let coordinator =
      createCoordinatorServer({
        dbPath,
      });

    let coordinatorUrl =
      await listen(
        coordinator,
      );

    let dashboard;

    t.after(async () => {
      if (dashboard) {
        await close(
          dashboard,
        );
      }

      await close(
        coordinator,
      );

      await rm(
        tempDir,
        {
          recursive: true,
          force: true,
        },
      );
    });

    const sourcePositions = [
      position(1, 1),
      position(2, 1),
    ];

    const buildOrigin =
      position(6, 6);

    const world =
      createWorldDriver(
        sourcePositions.map(
          (target) => [
            positionKey(target),
            "minecraft:oak_log",
          ],
        ),

        position(0, 0),
      );

    const approvedTaskIds =
      new Set();

    const verifiedWrites = [];

    const minecraft =
      new SafeMinecraftAdapter({
        driver:
          world.driver,

        policy: {
          allowedRegions: [
            region,
          ],

          allowMovement:
            false,

          allowedPlaceBlocks: [
            "minecraft:oak_log",
          ],

          allowedBreakBlocks: [
            "minecraft:oak_log",
          ],

          maxActionsPerAuthorization:
            4,
        },

        authorizationVerifier: {
          async verify(
            approval,
            request,
          ) {
            verifiedWrites.push({
              taskId:
                approval.taskId,

              action:
                request.action,
            });

            return approvedTaskIds.has(
              approval.taskId,
            );
          },
        },

        now: () =>
          new Date(
            "2030-01-01T00:00:00.000Z",
          ),
      });

    const { project } =
      await jsonRequest(
        coordinatorUrl,
        "/projects",
        {
          method: "POST",
          status: 201,

          body: {
            name:
              "MVP shelter",

            description:
              "Collector then builder",
          },
        },
      );

    const {
      agent:
        collectorRecord,
    } =
      await jsonRequest(
        coordinatorUrl,
        "/agents/heartbeat",
        {
          method: "POST",

          body: {
            name:
              "collector-e2e",

            role:
              "collector",
          },
        },
      );

    const {
      task:
        collectTask,
    } =
      await jsonRequest(
        coordinatorUrl,
        "/tasks",
        {
          method: "POST",
          status: 201,

          body: {
            projectId:
              project.id,

            title:
              "Collect oak logs",

            description:
              "Gather two approved blocks for the blueprint.",

            kind:
              "collect-blocks",

            requiredRole:
              "collector",

            payload: {
              blockName:
                "minecraft:oak_log",

              quantity: 2,

              candidates:
                sourcePositions,
            },
          },
        },
      );

    assert.equal(
      collectTask.kind,
      "collect-blocks",
    );

    assert.equal(
      collectTask.requiredRole,
      "collector",
    );

    const {
      task:
        claimedCollectTask,
    } =
      await jsonRequest(
        coordinatorUrl,
        "/tasks/claim",
        {
          method: "POST",

          body: {
            agentId:
              collectorRecord.id,
          },
        },
      );

    assert.equal(
      claimedCollectTask.id,
      collectTask.id,
    );

    assert.equal(
      claimedCollectTask.requiredRole,
      "collector",
    );

    await jsonRequest(
      coordinatorUrl,
      `/tasks/${collectTask.id}`,
      {
        method: "PATCH",

        body: {
          status:
            "running",
        },
      },
    );

    approvedTaskIds.add(
      collectTask.id,
    );

    const collector =
      new CollectorAgent({
        minecraft,
      });

    const collectResult =
      await collector.collectBlocks({
        taskId:
          collectTask.id,

        blockName:
          "minecraft:oak_log",

        quantity: 2,

        candidates:
          sourcePositions,

        authorization:
          authorization(
            collectTask.id,
            "approval-mvp-collector",
            "break-block",
            region,
            2,
          ),
      });

    assert.equal(
      collectResult.status,
      "completed",
    );

    await jsonRequest(
      coordinatorUrl,
      `/tasks/${collectTask.id}`,
      {
        method: "PATCH",

        body: {
          status:
            "completed",
        },
      },
    );

    const compiled =
      compileBlueprint(
        {
          schemaVersion: 1,

          id:
            "mvp/log-foundation",

          size: {
            width: 2,
            height: 1,
            depth: 1,
          },

          palette: {
            log:
              "minecraft:oak_log",
          },

          blocks: [
            {
              position: {
                x: 0,
                y: 0,
                z: 0,
              },

              material:
                "log",
            },

            {
              position: {
                x: 1,
                y: 0,
                z: 0,
              },

              material:
                "log",
            },
          ],
        },

        buildOrigin,
      );

    const {
      agent:
        builderRecord,
    } =
      await jsonRequest(
        coordinatorUrl,
        "/agents/heartbeat",
        {
          method: "POST",

          body: {
            name:
              "builder-e2e",

            role:
              "builder",
          },
        },
      );

    const {
      task:
        buildTask,
    } =
      await jsonRequest(
        coordinatorUrl,
        "/tasks",
        {
          method: "POST",
          status: 201,

          body: {
            projectId:
              project.id,

            title:
              "Build log foundation",

            description:
              `Compile and place ${compiled.blueprintId}.`,

            kind:
              "build-blueprint",

            requiredRole:
              "builder",

            payload: {
              blueprintId:
                compiled.blueprintId,

              origin:
                buildOrigin,

              placements:
                compiled.placements,
            },
          },
        },
      );

    assert.equal(
      buildTask.kind,
      "build-blueprint",
    );

    assert.equal(
      buildTask.requiredRole,
      "builder",
    );

    const {
      task:
        claimedBuildTask,
    } =
      await jsonRequest(
        coordinatorUrl,
        "/tasks/claim",
        {
          method: "POST",

          body: {
            agentId:
              builderRecord.id,
          },
        },
      );

    assert.equal(
      claimedBuildTask.id,
      buildTask.id,
    );

    assert.equal(
      claimedBuildTask.requiredRole,
      "builder",
    );

    await jsonRequest(
      coordinatorUrl,
      `/tasks/${buildTask.id}`,
      {
        method: "PATCH",

        body: {
          status:
            "running",
        },
      },
    );

    approvedTaskIds.add(
      buildTask.id,
    );

    const builder =
      new BuilderAgent({
        minecraft,
      });

    const buildResult =
      await builder.build({
        taskId:
          buildTask.id,

        placements:
          compiled.placements,

        authorization:
          authorization(
            buildTask.id,
            "approval-mvp-builder",
            "place-block",
            compiled.requiredRegion,
            compiled.placements.length,
          ),
      });

    assert.equal(
      buildResult.status,
      "completed",
    );

    await jsonRequest(
      coordinatorUrl,
      `/tasks/${buildTask.id}`,
      {
        method: "PATCH",

        body: {
          status:
            "completed",
        },
      },
    );

    assert.deepEqual(
      world.mutations.map(
        ({ action }) =>
          action,
      ),

      [
        "break-block",
        "break-block",
        "place-block",
        "place-block",
      ],
    );

    for (
      const target
      of sourcePositions
    ) {
      assert.equal(
        world.blocks.get(
          positionKey(
            target,
          ),
        ),

        "minecraft:air",
      );
    }

    for (
      const placement
      of compiled.placements
    ) {
      assert.equal(
        world.blocks.get(
          positionKey(
            placement.position,
          ),
        ),

        placement.blockName,
      );
    }

    assert.deepEqual(
      verifiedWrites.map(
        ({ taskId }) =>
          taskId,
      ),

      [
        collectTask.id,
        collectTask.id,
        buildTask.id,
        buildTask.id,
      ],
    );

    dashboard =
      createDashboardServer({
        coordinatorBaseUrl:
          coordinatorUrl,
      });

    const dashboardUrl =
      await listen(
        dashboard,
      );

    const snapshot =
      await jsonRequest(
        dashboardUrl,
        "/api/snapshot",
      );

    assert.equal(
      snapshot.projects.length,
      1,
    );

    assert.equal(
      snapshot.agents.length,
      2,
    );

    assert.equal(
      snapshot.taskCounts.completed,
      2,
    );

    assert.equal(
      snapshot.tasks.length,
      2,
    );

    assert.ok(
      snapshot.tasks.every(
        (task) =>
          task.kind !==
          "manual",
      ),
    );

    await close(
      dashboard,
    );

    dashboard =
      undefined;

    await close(
      coordinator,
    );

    coordinator =
      createCoordinatorServer({
        dbPath,
      });

    coordinatorUrl =
      await listen(
        coordinator,
      );

    const persisted =
      await jsonRequest(
        coordinatorUrl,
        "/tasks",
      );

    assert.equal(
      persisted.tasks.length,
      2,
    );

    assert.ok(
      persisted.tasks.every(
        ({ status }) =>
          status ===
          "completed",
      ),
    );

    assert.deepEqual(
      persisted.tasks
        .map(
          ({ kind }) =>
            kind,
        )
        .sort(),

      [
        "build-blueprint",
        "collect-blocks",
      ],
    );
  },
);