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
  createCoordinatorServer,
} from "../coordinator/dist/index.js";

import {
  close,
  jsonRequest,
  listen,
} from "./helpers/mvp-harness.mjs";

test(
  "coordinator plans multiple material collections before one dependent build",
  async (t) => {
    const tempDir =
      await mkdtemp(
        join(
          tmpdir(),
          "mineagents-multi-material-planning-",
        ),
      );

    const server =
      createCoordinatorServer({
        dbPath:
          join(
            tempDir,
            "coordinator.sqlite",
          ),
      });

    const baseUrl =
      await listen(
        server,
      );

    t.after(
      async () => {
        await close(
          server,
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

    const {
      project,
      tasks,
    } =
      await jsonRequest(
        baseUrl,
        "/projects/plan",
        {
          method:
            "POST",

          status:
            201,

          body: {
            name:
              "Mixed material shelter",

            description:
              "Collect oak and cobblestone before construction.",

            collections: [
              {
                blockName:
                  "minecraft:oak_log",

                quantity:
                  2,

                search: {
                  dimension:
                    "minecraft:overworld",

                  maxDistance:
                    32,

                  maxCandidates:
                    16,
                },
              },

              {
                blockName:
                  "minecraft:cobblestone",

                quantity:
                  3,

                search: {
                  dimension:
                    "minecraft:overworld",

                  maxDistance:
                    32,

                  maxCandidates:
                    16,
                },
              },
            ],

            build: {
              placements: [
                {
                  position: {
                    dimension:
                      "minecraft:overworld",

                    x:
                      20,

                    y:
                      83,

                    z:
                      -7,
                  },

                  blockName:
                    "minecraft:oak_log",
                },

                {
                  position: {
                    dimension:
                      "minecraft:overworld",

                    x:
                      21,

                    y:
                      83,

                    z:
                      -7,
                  },

                  blockName:
                    "minecraft:cobblestone",
                },
              ],
            },
          },
        },
      );

    assert.ok(
      project,
    );

    assert.equal(
      tasks.length,
      3,
    );

    const oakTask =
      tasks.find(
        (
          task,
        ) =>
          task.kind ===
            "collect-blocks" &&
          task.payload
            .blockName ===
            "minecraft:oak_log",
      );

    const cobbleTask =
      tasks.find(
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
      tasks.find(
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
      cobbleTask,
    );

    assert.ok(
      buildTask,
    );

    assert.equal(
      oakTask.projectId,
      project.id,
    );

    assert.equal(
      cobbleTask.projectId,
      project.id,
    );

    assert.equal(
      buildTask.projectId,
      project.id,
    );

    assert.equal(
      oakTask.payload.quantity,
      2,
    );

    assert.equal(
      cobbleTask.payload.quantity,
      3,
    );

    assert.deepEqual(
      oakTask.dependsOnTaskIds,
      [],
    );

    assert.deepEqual(
      cobbleTask.dependsOnTaskIds,
      [],
    );

    assert.deepEqual(
      new Set(
        buildTask.dependsOnTaskIds,
      ),

      new Set([
        oakTask.id,
        cobbleTask.id,
      ]),
    );

    assert.deepEqual(
      buildTask.payload
        .placements,

      [
        {
          position: {
            dimension:
              "minecraft:overworld",

            x:
              20,

            y:
              83,

            z:
              -7,
          },

          blockName:
            "minecraft:oak_log",
        },

        {
          position: {
            dimension:
              "minecraft:overworld",

            x:
              21,

            y:
              83,

            z:
              -7,
          },

          blockName:
            "minecraft:cobblestone",
        },
      ],
    );
  },
);

test(
  "planner preserves the legacy single collection project shape",
  async (t) => {
    const tempDir =
      await mkdtemp(
        join(
          tmpdir(),
          "mineagents-legacy-planning-",
        ),
      );

    const server =
      createCoordinatorServer({
        dbPath:
          join(
            tempDir,
            "coordinator.sqlite",
          ),
      });

    const baseUrl =
      await listen(
        server,
      );

    t.after(
      async () => {
        await close(
          server,
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

    const {
      tasks,
    } =
      await jsonRequest(
        baseUrl,
        "/projects/plan",
        {
          method:
            "POST",

          status:
            201,

          body: {
            name:
              "Legacy collection project",

            collection: {
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

            build: {
              placements: [
                {
                  position: {
                    dimension:
                      "minecraft:overworld",

                    x:
                      8,

                    y:
                      64,

                    z:
                      8,
                  },

                  blockName:
                    "minecraft:oak_log",
                },
              ],
            },
          },
        },
      );

    assert.equal(
      tasks.length,
      2,
    );

    const collectTask =
      tasks.find(
        (
          task,
        ) =>
          task.kind ===
          "collect-blocks",
      );

    const buildTask =
      tasks.find(
        (
          task,
        ) =>
          task.kind ===
          "build-blueprint",
      );

    assert.ok(
      collectTask,
    );

    assert.ok(
      buildTask,
    );

    assert.equal(
      collectTask.payload
        .blockName,
      "minecraft:oak_log",
    );

    assert.equal(
      collectTask.payload
        .quantity,
      1,
    );

    assert.deepEqual(
      buildTask.dependsOnTaskIds,
      [
        collectTask.id,
      ],
    );
  },
);
