import type {
  PlannedTask,
  ProjectPlan,
  ProjectPlanCollection,
  ProjectPlanInput,
} from "./contracts.js";

import {
  parseProjectPlanInput,
} from "./validation.js";

const createCollectionPayload = (
  collection:
    ProjectPlanCollection,
): Record<string, unknown> => {
  const payload:
    Record<string, unknown> = {
      blockName:
        collection.blockName,

      quantity:
        collection.quantity,

      allowPartial:
        collection.allowPartial ??
        false,
    };

  if (
    collection.candidates
  ) {
    payload.candidates =
      collection.candidates;
  }

  if (
    collection.search
  ) {
    payload.search =
      collection.search;
  }

  return payload;
};

const collectionKey = (
  collectionCount: number,
  index: number,
): string => {
  /*
   * Conservamos la key histórica para
   * proyectos legacy de un solo material.
   */
  if (
    collectionCount ===
    1
  ) {
    return "collect-resources";
  }

  return `collect-resources-${index + 1}`;
};

const createCollectionTask = (
  input:
    ProjectPlanInput,

  collection:
    ProjectPlanCollection,

  index:
    number,
): PlannedTask => {
  const multiMaterial =
    input.collections.length >
    1;

  return {
    key:
      collectionKey(
        input.collections.length,
        index,
      ),

    dependsOnKeys:
      [],

    task: {
      title:
        multiMaterial
          ? `Collect ${collection.blockName} for ${input.name}`
          : `Collect resources for ${input.name}`,

      description:
        multiMaterial
          ? `Collect ${collection.quantity} ${collection.blockName} required by the project.`
          : "Collect the resources required by the project.",

      kind:
        "collect-blocks",

      requiredRole:
        "collector",

      payload:
        createCollectionPayload(
          collection,
        ),

      dependsOnTaskIds:
        [],
    },
  };
};

export const createProjectPlan = (
  value: unknown,
): ProjectPlan => {
  const input:
    ProjectPlanInput =
      parseProjectPlanInput(
        value,
      );

  const collectionTasks =
    input.collections.map(
      (
        collection,
        index,
      ) =>
        createCollectionTask(
          input,
          collection,
          index,
        ),
    );

  const buildTask:
    PlannedTask = {
      key:
        "build-structure",

      /*
       * Fan-in:
       *
       * build depende de TODAS las
       * collections.
       */
      dependsOnKeys:
        collectionTasks.map(
          (
            task,
          ) =>
            task.key,
        ),

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
    };

  return {
    project: {
      name:
        input.name,

      description:
        input.description,
    },

    tasks: [
      ...collectionTasks,
      buildTask,
    ],
  };
};
