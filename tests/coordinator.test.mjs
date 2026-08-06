import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { test } from "node:test";
import { createCoordinatorServer } from "../coordinator/dist/index.js";

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
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

test("coordinator persists and serves the main task lifecycle", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "mineagents-coordinator-"));
  const server = createCoordinatorServer({ dbPath: join(tempDir, "coordinator.sqlite") });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await close(server);
    await rm(tempDir, { recursive: true, force: true });
  });

  const healthResponse = await globalThis.fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.status, "ok");

  const projectResponse = await globalThis.fetch(`${baseUrl}/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Starter base", description: "Initial staging project" }),
  });
  assert.equal(projectResponse.status, 201);
  const { project } = await projectResponse.json();

  const agentResponse = await globalThis.fetch(`${baseUrl}/agents/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "collector-01", role: "collector" }),
  });
  assert.equal(agentResponse.status, 200);
  const { agent } = await agentResponse.json();

  const taskResponse = await globalThis.fetch(`${baseUrl}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Gather starter resources",
      description: "Prepare the first build area",
      projectId: project.id,
    }),
  });
  assert.equal(taskResponse.status, 201);
  const createdTaskBody = await taskResponse.json();
  assert.equal(createdTaskBody.task.status, "pending");

  const claimResponse = await globalThis.fetch(`${baseUrl}/tasks/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: agent.id }),
  });
  assert.equal(claimResponse.status, 200);
  const claimedBody = await claimResponse.json();
  assert.equal(claimedBody.task.status, "assigned");
  assert.equal(claimedBody.task.assignedAgentId, agent.id);

  const patchResponse = await globalThis.fetch(`${baseUrl}/tasks/${claimedBody.task.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "completed" }),
  });
  assert.equal(patchResponse.status, 200);
  const patchedBody = await patchResponse.json();
  assert.equal(patchedBody.task.status, "completed");

  const tasksResponse = await globalThis.fetch(`${baseUrl}/tasks`);
  assert.equal(tasksResponse.status, 200);
  const tasks = await tasksResponse.json();
  assert.equal(tasks.tasks.length, 1);
  assert.equal(tasks.tasks[0].status, "completed");
});

test("coordinator rejects invalid task payloads", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "mineagents-coordinator-"));
  const server = createCoordinatorServer({ dbPath: join(tempDir, "coordinator.sqlite") });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await close(server);
    await rm(tempDir, { recursive: true, force: true });
  });

  const response = await globalThis.fetch(`${baseUrl}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description: "missing title" }),
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "VALIDATION_ERROR");
});
