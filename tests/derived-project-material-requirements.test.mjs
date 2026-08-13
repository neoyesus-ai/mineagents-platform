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

const createServer = async (t) => {
  const tempDir =
    await mkdtemp(
      join(
        tmpdir(),
        "mineagents-derived-materials-",
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

  return baseUrl;
};

const placement = (
  blockName,
  x,
) => ({
  position: {
    dimension:
      "minecraft:overworld",

    x,

    y:
      64,

    z:
      0,
  },

  blockName,
});

const strategy = (
  maxCandidates = 16,
) => ({
  search: {
    dimension:
      "minecraft:overworld",

    maxDistance:
      32,

    maxCandidates,
  },
});

test(
  "planner derives a single collection quantity from build placements",
  async (t) => {
    const baseUrl =
      await createServer(
        t,
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
              "Derived oak project",

            collectionStrategy:
              strategy(),

            build: {
              placements: [
                placement(
                  "minecraft:oak_log",
                  8,
                ),

                placement(
                  "minecraft:oak_log",
                  9,
                ),

                placement(
                  "minecraft:oak_log",
                  10,
                ),
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
      collectTask.payload.blockName,
      "minecraft:oak_log",
    );

    assert.equal(
      collectTask.payload.quantity,
      3,
    );

    assert.deepEqual(
      collectTask.payload.search,
      {
        dimension:
          "minecraft:overworld",

        maxDistance:
          32,

        maxCandidates:
          16,
      },
    );

    assert.deepEqual(
      buildTask.dependsOnTaskIds,
      [
        collectTask.id,
      ],
    );
  },
);

test(
  "planner derives one collection for every build material",
  async (t) => {
    const baseUrl =
      await createServer(
        t,
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
              "Derived multi-material project",

            collectionStrategy:
              strategy(),

            build: {
              placements: [
                placement(
                  "minecraft:oak_log",
                  8,
                ),

                placement(
                  "minecraft:cobblestone",
                  9,
                ),

                placement(
                  "minecraft:oak_log",
                  10,
                ),

                placement(
                  "minecraft:cobblestone",
                  11,
                ),

                placement(
                  "minecraft:cobblestone",
                  12,
                ),
              ],
            },
          },
        },
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
          task.payload.blockName ===
            "minecraft:oak_log",
      );

    const cobblestoneTask =
      tasks.find(
        (
          task,
        ) =>
          task.kind ===
            "collect-blocks" &&
          task.payload.blockName ===
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
      cobblestoneTask,
    );

    assert.ok(
      buildTask,
    );

    assert.equal(
      oakTask.payload.quantity,
      2,
    );

    assert.equal(
      cobblestoneTask.payload.quantity,
      3,
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
  },
);

test(
  "derived collections inherit allowPartial from the collection strategy",
  async (t) => {
    const baseUrl =
      await createServer(
        t,
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
              "Derived partial project",

            collectionStrategy: {
              ...strategy(),

              allowPartial:
                true,
            },

            build: {
              placements: [
                placement(
                  "minecraft:oak_log",
                  8,
                ),

                placement(
                  "minecraft:cobblestone",
                  9,
                ),
              ],
            },
          },
        },
      );

    const collectionTasks =
      tasks.filter(
        (
          task,
        ) =>
          task.kind ===
          "collect-blocks",
      );

    assert.equal(
      collectionTasks.length,
      2,
    );

    for (
      const task
      of collectionTasks
    ) {
      assert.equal(
        task.payload.allowPartial,
        true,
      );
    }
  },
);

test(
  "planner rejects ambiguous explicit collections and collection strategy",
  async (t) => {
    const baseUrl =
      await createServer(
        t,
      );

    const response =
      await globalThis.fetch(
        `${baseUrl}/projects/plan`,
        {
          method:
            "POST",

          headers: {
            "content-type":
              "application/json",
          },

          body:
            JSON.stringify({
              name:
                "Ambiguous resource plan",

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

              collectionStrategy:
                strategy(),

              build: {
                placements: [
                  placement(
                    "minecraft:oak_log",
                    8,
                  ),
                ],
              },
            }),
        },
      );

    assert.equal(
      response.status,
      400,
    );

    const body =
      await response.json();

    assert.match(
      JSON.stringify(
        body,
      ),
      /exactly one of 'collection', 'collections' or 'collectionStrategy'/i,
    );
  },
);

test(
  "planner rejects a derived search whose candidate limit cannot satisfy the largest material requirement",
  async (t) => {
    const baseUrl =
      await createServer(
        t,
      );

    const response =
      await globalThis.fetch(
        `${baseUrl}/projects/plan`,
        {
          method:
            "POST",

          headers: {
            "content-type":
              "application/json",
          },

          body:
            JSON.stringify({
              name:
                "Undersized derived search",

              collectionStrategy:
                strategy(
                  2,
                ),

              build: {
                placements: [
                  placement(
                    "minecraft:oak_log",
                    8,
                  ),

                  placement(
                    "minecraft:oak_log",
                    9,
                  ),

                  placement(
                    "minecraft:oak_log",
                    10,
                  ),
                ],
              },
            }),
        },
      );

    assert.equal(
      response.status,
      400,
    );

    const body =
      await response.json();

    assert.match(
      JSON.stringify(
        body,
      ),
      /maxCandidates must be at least the collection quantity/i,
    );
  },
);
