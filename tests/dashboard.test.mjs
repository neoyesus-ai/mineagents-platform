import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createCoordinatorServer } from "../coordinator/dist/index.js";
import {
  CoordinatorClient,
  createDashboardServer,
  parseDashboardConfig,
} from "../dashboard/dist/index.js";

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

const postJson = async (url, payload) => {
  const response = await globalThis.fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(response.ok, true);
  return response.json();
};

test("dashboard renders a read-only coordinator snapshot with escaped content", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "mineagents-dashboard-"));
  const coordinator = createCoordinatorServer({ dbPath: join(tempDir, "coordinator.sqlite") });
  const coordinatorPort = await listen(coordinator);
  const coordinatorUrl = `http://127.0.0.1:${coordinatorPort}`;

  const { project } = await postJson(`${coordinatorUrl}/projects`, {
    name: "<strong>Base central</strong>",
  });
  await postJson(`${coordinatorUrl}/agents/heartbeat`, {
    name: '<script>alert("mine")</script>',
    role: "builder",
  });
  await postJson(`${coordinatorUrl}/tasks`, {
    title: '<script>alert("mine")</script>',
    description: "Preparar & validar",
    projectId: project.id,
  });

  const dashboard = createDashboardServer({
    coordinatorBaseUrl: coordinatorUrl,
    refreshSeconds: 15,
  });
  const dashboardPort = await listen(dashboard);
  const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;

  t.after(async () => {
    await close(dashboard);
    await close(coordinator);
    await rm(tempDir, { recursive: true, force: true });
  });

  const healthResponse = await globalThis.fetch(`${dashboardUrl}/health`);
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json()).service, "dashboard");

  const snapshotResponse = await globalThis.fetch(`${dashboardUrl}/api/snapshot`);
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  assert.equal(snapshot.projects.length, 1);
  assert.equal(snapshot.agents.length, 1);
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.taskCounts.pending, 1);

  const pageResponse = await globalThis.fetch(dashboardUrl);
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(pageResponse.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(page, /&lt;script&gt;alert\(&quot;mine&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(page, /<script>alert/);
  assert.match(page, /Preparar &amp; validar/);
  assert.match(page, /content="15"/);
});

test("dashboard fails closed when its data source is unavailable", async (t) => {
  const dashboard = createDashboardServer({
    dataSource: {
      async getSnapshot() {
        throw new Error("simulated upstream failure");
      },
    },
  });
  const port = await listen(dashboard);
  t.after(() => close(dashboard));

  const apiResponse = await globalThis.fetch(`http://127.0.0.1:${port}/api/snapshot`);
  assert.equal(apiResponse.status, 502);
  assert.equal((await apiResponse.json()).error.code, "COORDINATOR_UNAVAILABLE");

  const pageResponse = await globalThis.fetch(`http://127.0.0.1:${port}/`);
  assert.equal(pageResponse.status, 502);
  assert.match(await pageResponse.text(), /Coordinator no disponible/);
});

test("dashboard configuration rejects unsafe or invalid values", () => {
  assert.deepEqual(parseDashboardConfig({}), {
    port: 3001,
    coordinatorBaseUrl: "http://127.0.0.1:3000",
    refreshSeconds: 10,
  });
  assert.throws(
    () => parseDashboardConfig({ COORDINATOR_URL: "file:///tmp/coordinator" }),
    /http or https/,
  );
  assert.throws(() => parseDashboardConfig({ DASHBOARD_PORT: "0" }), /between 1 and 65535/);
  assert.throws(
    () => new CoordinatorClient({ baseUrl: "file:///tmp/coordinator" }),
    /http or https/,
  );
  assert.throws(
    () => createDashboardServer({ dataSource: { async getSnapshot() {} }, refreshSeconds: 0 }),
    /between 5 and 3600/,
  );
});

test("dashboard rejects non-GET requests without calling its data source", async (t) => {
  let calls = 0;
  const dashboard = createDashboardServer({
    dataSource: {
      async getSnapshot() {
        calls += 1;
        throw new Error("must not be called");
      },
    },
  });
  const port = await listen(dashboard);
  t.after(() => close(dashboard));

  const response = await globalThis.fetch(`http://127.0.0.1:${port}/`, { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.equal(calls, 0);
});
