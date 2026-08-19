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
        "mineagents-per-material-strategy-",
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
  maxDistance,
  maxCandidates,
  allowPartial = false,
) => ({
  search: {
    dimension:
      "minecraft:overworld",

    maxDistance,

    maxCandidates,
  },

  allowPartial,
});

const multiMaterialBuild = {
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
      "minecraft:cobblestone",
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
};

test(
  "planner derives quantities while preserving a different search strategy per material",
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
              "Per material search",

            collectionStrategies: {
              "minecraft:oak_log":
                strategy(
                  48,
                  16,
                ),

              "minecraft:cobblestone":
                strategy(
                  20,
                  8,
                ),
            },

            build:
              multiMaterialBuild,
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

    const cobbleTask =
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
      cobbleTask,
    );

    assert.ok(
      buildTask,
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
      oakTask.payload.search,
      {
        dimension:
          "minecraft:overworld",

        maxDistance:
          48,

        maxCandidates:
          16,
      },
    );

    assert.deepEqual(
      cobbleTask.payload.search,
      {
        dimension:
          "minecraft:overworld",

        maxDistance:
          20,

        maxCandidates:
          8,
      },
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
  },
);

test(
  "per-material strategy preserves allowPartial independently for each material",
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
              "Independent partial strategies",

            collectionStrategies: {
              "minecraft:oak_log":
                strategy(
                  32,
                  16,
                  true,
                ),

              "minecraft:cobblestone":
                strategy(
                  16,
                  16,
                  false,
                ),
            },

            build:
              multiMaterialBuild,
          },
        },
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

    const cobbleTask =
      tasks.find(
        (
          task,
        ) =>
          task.kind ===
            "collect-blocks" &&
          task.payload.blockName ===
            "minecraft:cobblestone",
      );

    assert.ok(
      oakTask,
    );

    assert.ok(
      cobbleTask,
    );

    assert.equal(
      oakTask.payload.allowPartial,
      true,
    );

    assert.equal(
      cobbleTask.payload.allowPartial,
      false,
    );
  },
);

test(
  "planner rejects a missing per-material strategy",
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
                "Missing cobblestone strategy",

              collectionStrategies: {
                "minecraft:oak_log":
                  strategy(
                    32,
                    16,
                  ),
              },

              build:
                multiMaterialBuild,
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
      /must provide a strategy for required material 'minecraft:cobblestone'/i,
    );
  },
);

test(
  "planner rejects a per-material strategy for an unused material",
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
                "Unused strategy",

              collectionStrategies: {
                "minecraft:oak_log":
                  strategy(
                    32,
                    16,
                  ),

                "minecraft:cobblestone":
                  strategy(
                    16,
                    16,
                  ),

                "minecraft:dirt":
                  strategy(
                    8,
                    8,
                  ),
              },

              build:
                multiMaterialBuild,
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
      /strategy for unused material 'minecraft:dirt'/i,
    );
  },
);

test(
  "planner validates maxCandidates against each material quantity independently",
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
                "Undersized cobblestone strategy",

              collectionStrategies: {
                "minecraft:oak_log":
                  strategy(
                    32,
                    2,
                  ),

                "minecraft:cobblestone":
                  strategy(
                    16,
                    2,
                  ),
              },

              build:
                multiMaterialBuild,
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
      /collectionStrategies\.minecraft:cobblestone\.search\.maxCandidates must be at least the collection quantity/i,
    );
  },
);

test(
  "planner rejects combining collectionStrategies with another collection mode",
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
                "Ambiguous strategies",

              collectionStrategy:
                strategy(
                  32,
                  16,
                ),

              collectionStrategies: {
                "minecraft:oak_log":
                  strategy(
                    32,
                    16,
                  ),

                "minecraft:cobblestone":
                  strategy(
                    16,
                    16,
                  ),
              },

              build:
                multiMaterialBuild,
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
      /exactly one of 'collection', 'collections', 'collectionStrategy' or 'collectionStrategies'/i,
    );
  },
);
