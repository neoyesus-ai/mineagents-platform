import type {
  ProjectPlan,
  ProjectPlanInput,
} from "./contracts.js";

import {
  parseProjectPlanInput,
} from "./validation.js";

export const createProjectPlan = (
  value: unknown,
): ProjectPlan => {
  const input:
    ProjectPlanInput =
      parseProjectPlanInput(
        value,
      );

  const collectKey =
    "collect-resources";

  const buildKey =
    "build-structure";

  return {
    project: {
      name:
        input.name,

      description:
        input.description,
    },

    tasks: [
      {
        key:
          collectKey,

        dependsOnKeys:
          [],

        task: {
          title:
            `Collect resources for ${input.name}`,

          description:
            "Collect the resources required by the project.",

          kind:
            "collect-blocks",

          requiredRole:
            "collector",

          payload: {
            blockName:
              input.collection.blockName,

            quantity:
              input.collection.quantity,

            candidates:
              input.collection.candidates,

            allowPartial:
              input.collection.allowPartial ??
              false,
          },

          dependsOnTaskIds:
            [],
        },
      },

      {
        key:
          buildKey,

        dependsOnKeys: [
          collectKey,
        ],

        task: {
          title:
            `Build ${input.name}`,

          description:
            "Build the planned structure after resources are collected.",

          kind:
            "build-blueprint",

          requiredRole:
            "builder",

          payload: {
            blueprintId:
              `planned:${input.name}`,

            placements:
              input.build.placements,

            allowPartial:
              input.build.allowPartial ??
              false,
          },

          dependsOnTaskIds:
            [],
        },
      },
    ],
  };
};