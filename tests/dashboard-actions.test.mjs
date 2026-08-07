import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createCoordinatorServer } from "../coordinator/dist/index.js";
import { createDashboardServer } from "../dashboard/dist/index.js";

const listen = async (server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an IPv4 server address.");
  }
  return address.port;
};

const close = async (server) => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};

const submitForm = (url, origin, fields = {}) =>
  globalThis.fetch(url, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
    },
    body: new globalThis.URLSearchParams(fields),
    redirect: "manual",
  });

test("dashboard actions create projects and tasks and cancel active tasks", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "mineagents-dashboard-actions-"));
  const coordinator = createCoordinatorServer({ dbPath: join(tempDir, "coordinator.sqlite") });
  const coordinatorPort = await listen(coordinator);
  const coordinatorUrl = `http://127.0.0.1:${coordinatorPort}`;
  const logs = [];
  const dashboard = createDashboardServer({
    coordinatorBaseUrl: coordinatorUrl,
    logger: {
      info: (event, fields) => logs.push({ level: "info", event, ...fields }),
      error: (event, fields) => logs.push({ level: "error", event, ...fields }),
    },
  });
  const dashboardPort = await listen(dashboard);
  const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;

  t.after(async () => {
    await close(dashboard);
    await close(coordinator);
    await rm(tempDir, { recursive: true, force: true });
  });

  const rejected = await submitForm(`${dashboardUrl}/actions/projects`, "https://attacker.invalid", {
    name: "Proyecto no autorizado",
  });
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error.code, "INVALID_ACTION_INPUT");

  const projectResponse = await submitForm(`${dashboardUrl}/actions/projects`, dashboardUrl, {
    name: "Base segura",
    description: "Proyecto creado desde el panel",
  });
  assert.equal(projectResponse.status, 303);
  assert.equal(projectResponse.headers.get("location"), "/?notice=project-created");

  const projectsResponse = await globalThis.fetch(`${coordinatorUrl}/projects`);
  const { projects } = await projectsResponse.json();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, "Base segura");

  const taskResponse = await submitForm(`${dashboardUrl}/actions/tasks`, dashboardUrl, {
    title: "Recolectar piedra",
    description: "Máximo 32 bloques",
    projectId: projects[0].id,
  });
  assert.equal(taskResponse.status, 303);
  assert.equal(taskResponse.headers.get("location"), "/?notice=task-created");

  const tasksResponse = await globalThis.fetch(`${coordinatorUrl}/tasks`);
  const { tasks } = await tasksResponse.json();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, "pending");
  assert.equal(tasks[0].projectId, projects[0].id);

  const cancelResponse = await submitForm(
    `${dashboardUrl}/actions/tasks/${tasks[0].id}/cancel`,
    dashboardUrl,
  );
  assert.equal(cancelResponse.status, 303);
  assert.equal(cancelResponse.headers.get("location"), "/?notice=task-cancelled");

  const cancelledTasksResponse = await globalThis.fetch(`${coordinatorUrl}/tasks`);
  const cancelledTasks = (await cancelledTasksResponse.json()).tasks;
  assert.equal(cancelledTasks[0].status, "cancelled");
  assert.equal(
    logs.filter((entry) => entry.event === "dashboard.action_succeeded").length,
    3,
  );
});
