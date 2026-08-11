import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { test } from "node:test";

import {
  createCoordinatorServer,
} from "../coordinator/dist/index.js";

const listen = async (
  server,
) => {
  server.listen(
    0,
    "127.0.0.1",
  );

  await once(
    server,
    "listening",
  );

  const address =
    server.address();

  if (
    !address ||
    typeof address ===
      "string"
  ) {
    throw new Error(
      "Expected an IPv4 server address.",
    );
  }

  return address.port;
};

const close = async (
  server,
) => {
  await new Promise(
    (
      resolve,
      reject,
    ) => {
      server.close(
        (error) => {
          if (error) {
            reject(
              error,
            );

            return;
          }

          resolve();
        },
      );
    },
  );
};

const postJson = async (
  baseUrl,
  path,
  payload,
) =>
  globalThis.fetch(
    `${baseUrl}${path}`,
    {
      method:
        "POST",

      headers: {
        "content-type":
          "application/json",
      },

      body:
        JSON.stringify(
          payload,
        ),
    },
  );

const patchJson = async (
  baseUrl,
  path,
  payload,
) =>
  globalThis.fetch(
    `${baseUrl}${path}`,
    {
      method:
        "PATCH",

      headers: {
        "content-type":
          "application/json",
      },

      body:
        JSON.stringify(
          payload,
        ),
    },
  );

test(
  "coordinator persists and serves the main task lifecycle",
  async (t) => {
    const tempDir =
      await mkdtemp(
        join(
          tmpdir(),
          "mineagents-coordinator-",
        ),
      );

    const logs = [];

    const server =
      createCoordinatorServer({
        dbPath:
          join(
            tempDir,
            "coordinator.sqlite",
          ),

        logger: {
          info:
            (
              event,
              fields,
            ) =>
              logs.push({
                level:
                  "info",

                event,

                ...fields,
              }),

          error:
            (
              event,
              fields,
            ) =>
              logs.push({
                level:
                  "error",

                event,

                ...fields,
              }),
        },
      });

    const port =
      await listen(
        server,
      );

    const baseUrl =
      `http://127.0.0.1:${port}`;

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

    const healthResponse =
      await globalThis.fetch(
        `${baseUrl}/health`,
      );

    assert.equal(
      healthResponse.status,
      200,
    );

    assert.match(
      healthResponse.headers.get(
        "x-request-id",
      ),
      /^[0-9a-f-]{36}$/,
    );

    const health =
      await healthResponse.json();

    assert.equal(
      health.status,
      "ok",
    );

    const projectResponse =
      await postJson(
        baseUrl,
        "/projects",
        {
          name:
            "Starter base",

          description:
            "Initial staging project",
        },
      );

    assert.equal(
      projectResponse.status,
      201,
    );

    const {
      project,
    } =
      await projectResponse.json();

    const agentResponse =
      await postJson(
        baseUrl,
        "/agents/heartbeat",
        {
          name:
            "collector-01",

          role:
            "collector",
        },
      );

    assert.equal(
      agentResponse.status,
      200,
    );

    const {
      agent,
    } =
      await agentResponse.json();

    const taskResponse =
      await postJson(
        baseUrl,
        "/tasks",
        {
          title:
            "Gather starter resources",

          description:
            "Prepare the first build area",

          projectId:
            project.id,

          kind:
            "collect-blocks",

          requiredRole:
            "collector",

          payload: {
            blockName:
              "minecraft:oak_log",

            quantity:
              2,
          },
        },
      );

    assert.equal(
      taskResponse.status,
      201,
    );

    const createdTaskBody =
      await taskResponse.json();

    assert.equal(
      createdTaskBody
        .task
        .status,
      "pending",
    );

    assert.equal(
      createdTaskBody
        .task
        .kind,
      "collect-blocks",
    );

    assert.equal(
      createdTaskBody
        .task
        .requiredRole,
      "collector",
    );

    assert.deepEqual(
      createdTaskBody
        .task
        .payload,
      {
        blockName:
          "minecraft:oak_log",

        quantity:
          2,
      },
    );

    assert.deepEqual(
      createdTaskBody
        .task
        .dependsOnTaskIds,
      [],
    );

    const claimResponse =
      await postJson(
        baseUrl,
        "/tasks/claim",
        {
          agentId:
            agent.id,
        },
      );

    assert.equal(
      claimResponse.status,
      200,
    );

    const claimedBody =
      await claimResponse.json();

    assert.equal(
      claimedBody
        .task
        .status,
      "assigned",
    );

    assert.equal(
      claimedBody
        .task
        .assignedAgentId,
      agent.id,
    );

    assert.equal(
      claimedBody
        .task
        .requiredRole,
      "collector",
    );

    assert.deepEqual(
      claimedBody
        .task
        .dependsOnTaskIds,
      [],
    );

    const startResponse =
      await patchJson(
        baseUrl,
        `/tasks/${claimedBody.task.id}`,
        {
          status:
            "running",
        },
      );

    assert.equal(
      startResponse.status,
      200,
    );

    const startedBody =
      await startResponse.json();

    assert.equal(
      startedBody
        .task
        .status,
      "running",
    );

    assert.equal(
      typeof startedBody
        .task
        .startedAt,
      "string",
    );

    const patchResponse =
      await patchJson(
        baseUrl,
        `/tasks/${claimedBody.task.id}`,
        {
          status:
            "completed",
        },
      );

    assert.equal(
      patchResponse.status,
      200,
    );

    const patchedBody =
      await patchResponse.json();

    assert.equal(
      patchedBody
        .task
        .status,
      "completed",
    );

    const invalidTransitionResponse =
      await patchJson(
        baseUrl,
        `/tasks/${claimedBody.task.id}`,
        {
          status:
            "running",
        },
      );

    assert.equal(
      invalidTransitionResponse.status,
      409,
    );

    const tasksResponse =
      await globalThis.fetch(
        `${baseUrl}/tasks`,
      );

    assert.equal(
      tasksResponse.status,
      200,
    );

    const tasks =
      await tasksResponse.json();

    assert.equal(
      tasks.tasks.length,
      1,
    );

    assert.equal(
      tasks.tasks[0]
        .status,
      "completed",
    );

    assert.equal(
      tasks.tasks[0]
        .kind,
      "collect-blocks",
    );

    assert.equal(
      tasks.tasks[0]
        .requiredRole,
      "collector",
    );

    assert.deepEqual(
      tasks.tasks[0]
        .dependsOnTaskIds,
      [],
    );

    const metricsResponse =
      await globalThis.fetch(
        `${baseUrl}/metrics`,
      );

    assert.equal(
      metricsResponse.status,
      200,
    );

    assert.match(
      metricsResponse.headers.get(
        "content-type",
      ),
      /text\/plain/,
    );

    const metrics =
      await metricsResponse.text();

    assert.match(
      metrics,
      /mineagents_coordinator_tasks{service="coordinator"} 1/,
    );

    assert.match(
      metrics,
      /route="\/tasks\/:id"/,
    );

    assert.doesNotMatch(
      metrics,
      new RegExp(
        claimedBody
          .task
          .id,
      ),
    );

    assert.equal(
      logs.some(
        (entry) =>
          entry.event ===
            "http.request" &&
          entry.route ===
            "/tasks/:id",
      ),
      true,
    );
  },
);

test(
  "coordinator rejects invalid task payloads",
  async (t) => {
    const tempDir =
      await mkdtemp(
        join(
          tmpdir(),
          "mineagents-coordinator-",
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

    const port =
      await listen(
        server,
      );

    const baseUrl =
      `http://127.0.0.1:${port}`;

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

    const response =
      await postJson(
        baseUrl,
        "/tasks",
        {
          description:
            "missing title",
        },
      );

    assert.equal(
      response.status,
      400,
    );

    const body =
      await response.json();

    assert.equal(
      body.error.code,
      "VALIDATION_ERROR",
    );

    const invalidPatchResponse =
      await patchJson(
        baseUrl,
        "/tasks/missing",
        {
          title:
            42,
        },
      );

    assert.equal(
      invalidPatchResponse.status,
      400,
    );

    const invalidPatchBody =
      await invalidPatchResponse.json();

    assert.equal(
      invalidPatchBody
        .error
        .code,
      "VALIDATION_ERROR",
    );

    const invalidDependenciesResponse =
      await postJson(
        baseUrl,
        "/tasks",
        {
          title:
            "Invalid dependencies",

          dependsOnTaskIds:
            "task-1",
        },
      );

    assert.equal(
      invalidDependenciesResponse.status,
      400,
    );

    const invalidDependenciesBody =
      await invalidDependenciesResponse.json();

    assert.equal(
      invalidDependenciesBody
        .error
        .code,
      "VALIDATION_ERROR",
    );

    const missingDependencyResponse =
      await postJson(
        baseUrl,
        "/tasks",
        {
          title:
            "Depends on missing task",

          kind:
            "build-blueprint",

          requiredRole:
            "builder",

          dependsOnTaskIds: [
            "missing-task",
          ],
        },
      );

    assert.equal(
      missingDependencyResponse.status,
      404,
    );
  },
);

test(
  "coordinator only claims tasks after every dependency is completed",
  async (t) => {
    const tempDir =
      await mkdtemp(
        join(
          tmpdir(),
          "mineagents-coordinator-dependencies-",
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

    const port =
      await listen(
        server,
      );

    const baseUrl =
      `http://127.0.0.1:${port}`;

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

    const collectorResponse =
      await postJson(
        baseUrl,
        "/agents/heartbeat",
        {
          id:
            "collector-1",

          name:
            "Recolector1",

          role:
            "collector",
        },
      );

    assert.equal(
      collectorResponse.status,
      200,
    );

    const builderResponse =
      await postJson(
        baseUrl,
        "/agents/heartbeat",
        {
          id:
            "builder-1",

          name:
            "Constructor1",

          role:
            "builder",
        },
      );

    assert.equal(
      builderResponse.status,
      200,
    );

    const collectorTaskResponse =
      await postJson(
        baseUrl,
        "/tasks",
        {
          title:
            "Collect one oak log",

          kind:
            "collect-blocks",

          requiredRole:
            "collector",

          payload: {
            blockName:
              "minecraft:oak_log",

            quantity:
              1,
          },
        },
      );

    assert.equal(
      collectorTaskResponse.status,
      201,
    );

    const {
      task:
        collectorTask,
    } =
      await collectorTaskResponse.json();

    assert.deepEqual(
      collectorTask
        .dependsOnTaskIds,
      [],
    );

    const builderTaskResponse =
      await postJson(
        baseUrl,
        "/tasks",
        {
          title:
            "Build with collected oak",

          kind:
            "build-blueprint",

          requiredRole:
            "builder",

          payload: {
            blueprintId:
              "demo/dependency-test",
          },

          dependsOnTaskIds: [
            collectorTask.id,
          ],
        },
      );

    assert.equal(
      builderTaskResponse.status,
      201,
    );

    const {
      task:
        builderTask,
    } =
      await builderTaskResponse.json();

    assert.equal(
      builderTask.status,
      "pending",
    );

    assert.deepEqual(
      builderTask
        .dependsOnTaskIds,
      [
        collectorTask.id,
      ],
    );

    const blockedBuilderClaim =
      await postJson(
        baseUrl,
        "/tasks/claim",
        {
          agentId:
            "builder-1",
        },
      );

    assert.equal(
      blockedBuilderClaim.status,
      404,
    );

    const blockedBody =
      await blockedBuilderClaim.json();

    assert.equal(
      blockedBody
        .error
        .code,
      "NO_PENDING_TASKS",
    );

    const collectorClaimResponse =
      await postJson(
        baseUrl,
        "/tasks/claim",
        {
          agentId:
            "collector-1",
        },
      );

    assert.equal(
      collectorClaimResponse.status,
      200,
    );

    const {
      task:
        claimedCollectorTask,
    } =
      await collectorClaimResponse.json();

    assert.equal(
      claimedCollectorTask.id,
      collectorTask.id,
    );

    assert.equal(
      claimedCollectorTask.status,
      "assigned",
    );

    const builderClaimWhileAssigned =
      await postJson(
        baseUrl,
        "/tasks/claim",
        {
          agentId:
            "builder-1",
        },
      );

    assert.equal(
      builderClaimWhileAssigned.status,
      404,
    );

    const startCollectorResponse =
      await patchJson(
        baseUrl,
        `/tasks/${collectorTask.id}`,
        {
          status:
            "running",
        },
      );

    assert.equal(
      startCollectorResponse.status,
      200,
    );

    const builderClaimWhileRunning =
      await postJson(
        baseUrl,
        "/tasks/claim",
        {
          agentId:
            "builder-1",
        },
      );

    assert.equal(
      builderClaimWhileRunning.status,
      404,
    );

    const completeCollectorResponse =
      await patchJson(
        baseUrl,
        `/tasks/${collectorTask.id}`,
        {
          status:
            "completed",
        },
      );

    assert.equal(
      completeCollectorResponse.status,
      200,
    );

    const {
      task:
        completedCollectorTask,
    } =
      await completeCollectorResponse.json();

    assert.equal(
      completedCollectorTask.status,
      "completed",
    );

    const unlockedBuilderClaim =
      await postJson(
        baseUrl,
        "/tasks/claim",
        {
          agentId:
            "builder-1",
        },
      );

    assert.equal(
      unlockedBuilderClaim.status,
      200,
    );

    const {
      task:
        claimedBuilderTask,
    } =
      await unlockedBuilderClaim.json();

    assert.equal(
      claimedBuilderTask.id,
      builderTask.id,
    );

    assert.equal(
      claimedBuilderTask.status,
      "assigned",
    );

    assert.equal(
      claimedBuilderTask
        .assignedAgentId,
      "builder-1",
    );

    assert.deepEqual(
      claimedBuilderTask
        .dependsOnTaskIds,
      [
        collectorTask.id,
      ],
    );

    const tasksResponse =
      await globalThis.fetch(
        `${baseUrl}/tasks`,
      );

    assert.equal(
      tasksResponse.status,
      200,
    );

    const {
      tasks,
    } =
      await tasksResponse.json();

    const persistedBuilderTask =
      tasks.find(
        (task) =>
          task.id ===
          builderTask.id,
      );

    assert.ok(
      persistedBuilderTask,
    );

    assert.deepEqual(
      persistedBuilderTask
        .dependsOnTaskIds,
      [
        collectorTask.id,
      ],
    );
  },
);

test(
  "coordinator plans a project into ordered executable tasks",
  async (t) => {
    const tempDir =
      await mkdtemp(
        join(
          tmpdir(),
          "mineagents-coordinator-planner-",
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

    const port =
      await listen(
        server,
      );

    const baseUrl =
      `http://127.0.0.1:${port}`;

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

    const planResponse =
      await postJson(
        baseUrl,
        "/projects/plan",
        {
          name:
            "Oak starter shelter",

          description:
            "Collect oak and build the first autonomous shelter.",

          collection: {
            blockName:
              "minecraft:oak_log",

            quantity:
              1,

            candidates: [
              {
                dimension:
                  "minecraft:overworld",

                x:
                  10,

                y:
                  83,

                z:
                  -7,
              },
            ],
          },

          build: {
            placements: [
              {
                position: {
                  dimension:
                    "minecraft:overworld",

                  x:
                    11,

                  y:
                    83,

                  z:
                    -7,
                },

                blockName:
                  "minecraft:oak_log",
              },
            ],
          },
        },
      );

    assert.equal(
      planResponse.status,
      201,
    );

    const planBody =
      await planResponse.json();

    assert.ok(
      planBody.project,
    );

    assert.equal(
      planBody.project.name,
      "Oak starter shelter",
    );

    assert.equal(
      planBody.project.description,
      "Collect oak and build the first autonomous shelter.",
    );

    assert.ok(
      Array.isArray(
        planBody.tasks,
      ),
    );

    assert.equal(
      planBody.tasks.length,
      2,
    );

    const collectorTask =
      planBody.tasks[0];

    const builderTask =
      planBody.tasks[1];

    assert.equal(
      collectorTask.projectId,
      planBody.project.id,
    );

    assert.equal(
      collectorTask.kind,
      "collect-blocks",
    );

    assert.equal(
      collectorTask.requiredRole,
      "collector",
    );

    assert.equal(
      collectorTask.status,
      "pending",
    );

    assert.deepEqual(
      collectorTask.dependsOnTaskIds,
      [],
    );

    assert.equal(
      collectorTask.payload.blockName,
      "minecraft:oak_log",
    );

    assert.equal(
      collectorTask.payload.quantity,
      1,
    );

    assert.deepEqual(
      collectorTask.payload.candidates,
      [
        {
          dimension:
            "minecraft:overworld",

          x:
            10,

          y:
            83,

          z:
            -7,
        },
      ],
    );

    assert.equal(
      collectorTask.payload.allowPartial,
      false,
    );

    assert.equal(
      builderTask.projectId,
      planBody.project.id,
    );

    assert.equal(
      builderTask.kind,
      "build-blueprint",
    );

    assert.equal(
      builderTask.requiredRole,
      "builder",
    );

    assert.equal(
      builderTask.status,
      "pending",
    );

    assert.equal(
      builderTask.payload.blueprintId,
      "planned:Oak starter shelter",
    );

    assert.deepEqual(
      builderTask.payload.placements,
      [
        {
          position: {
            dimension:
              "minecraft:overworld",

            x:
              11,

            y:
              83,

            z:
              -7,
          },

          blockName:
            "minecraft:oak_log",
        },
      ],
    );

    assert.equal(
      builderTask.payload.allowPartial,
      false,
    );

    assert.deepEqual(
      builderTask.dependsOnTaskIds,
      [
        collectorTask.id,
      ],
    );

    const projectsResponse =
      await globalThis.fetch(
        `${baseUrl}/projects`,
      );

    assert.equal(
      projectsResponse.status,
      200,
    );

    const {
      projects,
    } =
      await projectsResponse.json();

    const persistedProject =
      projects.find(
        (project) =>
          project.id ===
          planBody.project.id,
      );

    assert.ok(
      persistedProject,
    );

    assert.equal(
      persistedProject.name,
      "Oak starter shelter",
    );

    const tasksResponse =
      await globalThis.fetch(
        `${baseUrl}/tasks`,
      );

    assert.equal(
      tasksResponse.status,
      200,
    );

    const {
      tasks,
    } =
      await tasksResponse.json();

    const persistedCollectorTask =
      tasks.find(
        (task) =>
          task.id ===
          collectorTask.id,
      );

    const persistedBuilderTask =
      tasks.find(
        (task) =>
          task.id ===
          builderTask.id,
      );

    assert.ok(
      persistedCollectorTask,
    );

    assert.ok(
      persistedBuilderTask,
    );

    assert.equal(
      persistedCollectorTask.projectId,
      planBody.project.id,
    );

    assert.equal(
      persistedBuilderTask.projectId,
      planBody.project.id,
    );

    assert.deepEqual(
      persistedCollectorTask.dependsOnTaskIds,
      [],
    );

    assert.deepEqual(
      persistedBuilderTask.dependsOnTaskIds,
      [
        persistedCollectorTask.id,
      ],
    );

    const invalidPlanResponse =
      await postJson(
        baseUrl,
        "/projects/plan",
        {
          name:
            "Invalid project",

          quantity:
            0,
        },
      );

    assert.equal(
      invalidPlanResponse.status,
      400,
    );

    const invalidPlanBody =
      await invalidPlanResponse.json();

    assert.equal(
      invalidPlanBody
        .error
        .code,
      "VALIDATION_ERROR",
    );

    const projectsAfterInvalidResponse =
      await globalThis.fetch(
        `${baseUrl}/projects`,
      );

    assert.equal(
      projectsAfterInvalidResponse.status,
      200,
    );

    const projectsAfterInvalid =
      await projectsAfterInvalidResponse.json();

    assert.equal(
      projectsAfterInvalid
        .projects
        .length,
      1,
    );
  },
);