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

  const collectionPayload:
    Record<string, unknown> = {
      blockName:
        input.collection.blockName,

      quantity:
        input.collection.quantity,

      allowPartial:
        input.collection.allowPartial ??
        false,
    };

  if (
    input.collection.candidates
  ) {
    collectionPayload.candidates =
      input.collection.candidates;
  }

  if (
    input.collection.search
  ) {
    collectionPayload.search =
      input.collection.search;
  }

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

          payload:
            collectionPayload,

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