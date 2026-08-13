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
        "mineagents-material-requirements-",
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

const oakPlacement = (
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

  blockName:
    "minecraft:oak_log",
});

test(
  "project accepts material collections that exactly cover the build",
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
              "Exact material coverage",

            collection: {
              blockName:
                "minecraft:oak_log",

              quantity:
                2,

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
                oakPlacement(
                  8,
                ),

                oakPlacement(
                  9,
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

    assert.ok(
      collectTask,
    );

    assert.equal(
      collectTask.payload.quantity,
      2,
    );
  },
);

test(
  "project accepts material collections with surplus resources",
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
              "Surplus material coverage",

            collection: {
              blockName:
                "minecraft:oak_log",

              quantity:
                3,

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
                oakPlacement(
                  8,
                ),

                oakPlacement(
                  9,
                ),
              ],
            },
          },
        },
      );

    const collectTask =
      tasks.find(
        (
          task,
        ) =>
          task.kind ===
          "collect-blocks",
      );

    assert.ok(
      collectTask,
    );

    assert.equal(
      collectTask.payload.quantity,
      3,
    );
  },
);

test(
  "project rejects a build material that no collection provides",
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
                "Missing material",

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
                        0,
                    },

                    blockName:
                      "minecraft:cobblestone",
                  },
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
      /no collection provides that material/i,
    );
  },
);

test(
  "project rejects collections that do not provide enough material",
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
                "Insufficient material",

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
                  oakPlacement(
                    8,
                  ),

                  oakPlacement(
                    9,
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
      /collections provide only 1/i,
    );
  },
);

test(
  "project validates every material in a multi-material build",
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
                "Partially covered multi-material build",

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
                  oakPlacement(
                    8,
                  ),

                  oakPlacement(
                    9,
                  ),

                  {
                    position: {
                      dimension:
                        "minecraft:overworld",

                      x:
                        10,

                      y:
                        64,

                      z:
                        0,
                    },

                    blockName:
                      "minecraft:cobblestone",
                  },

                  {
                    position: {
                      dimension:
                        "minecraft:overworld",

                      x:
                        11,

                      y:
                        64,

                      z:
                        0,
                    },

                    blockName:
                      "minecraft:cobblestone",
                  },
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
      /requires 2 minecraft:cobblestone/i,
    );

    assert.match(
      JSON.stringify(
        body,
      ),
      /provide only 1/i,
    );
  },
);
