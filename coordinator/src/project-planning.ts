import {
  createProjectPlan,
  type ProjectPlan,
} from "@mineagents/planner";

import type {
  ProjectRecord,
  TaskRecord,
} from "@mineagents/sdk";

import {
  CoordinatorStore,
} from "./database.js";

export interface MaterializedProjectPlan {
  project: ProjectRecord;
  tasks: readonly TaskRecord[];
}

export const materializeProjectPlan = (
  store: CoordinatorStore,
  value: unknown,
): MaterializedProjectPlan => {
  const plan: ProjectPlan =
    createProjectPlan(
      value,
    );

  const project =
    store.createProject({
      name:
        plan.project.name,

      description:
        plan.project.description,
    });

  const createdByKey =
    new Map<
      string,
      TaskRecord
    >();

  const tasks:
    TaskRecord[] = [];

  for (
    const plannedTask
    of plan.tasks
  ) {
    const dependsOnTaskIds =
      plannedTask.dependsOnKeys.map(
        (dependencyKey) => {
          const dependency =
            createdByKey.get(
              dependencyKey,
            );

          if (!dependency) {
            throw new Error(
              `Planner produced an unresolved dependency '${dependencyKey}'.`,
            );
          }

          return dependency.id;
        },
      );

    const task =
      store.createTask({
        ...plannedTask.task,

        projectId:
          project.id,

        dependsOnTaskIds,
      });

    createdByKey.set(
      plannedTask.key,
      task,
    );

    tasks.push(
      task,
    );
  }

  return {
    project,
    tasks,
  };
};