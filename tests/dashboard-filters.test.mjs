import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterDashboardTasks,
  hasDashboardTaskFilters,
  parseDashboardTaskFilters,
} from "../dashboard/dist/index.js";

const tasks = [
  {
    id: "task-a",
    title: "Recolectar piedra",
    description: "Cantera Norte",
    status: "pending",
    projectId: "project-a",
  },
  {
    id: "task-b",
    title: "Construir refugio",
    description: null,
    status: "completed",
    projectId: "project-b",
  },
];

test("dashboard task filters parse bounded single query parameters", () => {
  assert.deepEqual(
    parseDashboardTaskFilters(
      new globalThis.URLSearchParams({
        q: "  PIEDRA ",
        status: "pending",
        projectId: "project-a",
      }),
    ),
    {
      query: "PIEDRA",
      status: "pending",
      projectId: "project-a",
    },
  );

  const ambiguous = new globalThis.URLSearchParams({
    status: "unknown",
    projectId: "x".repeat(201),
  });
  ambiguous.append("q", "first");
  ambiguous.append("q", "second");
  assert.deepEqual(parseDashboardTaskFilters(ambiguous), {
    query: undefined,
    status: undefined,
    projectId: undefined,
  });
});

test("dashboard task filters combine text, status and project without mutating tasks", () => {
  assert.deepEqual(
    filterDashboardTasks(tasks, { query: "piedra" }).map((task) => task.id),
    ["task-a"],
  );
  assert.deepEqual(
    filterDashboardTasks(tasks, { status: "completed", projectId: "project-b" }).map(
      (task) => task.id,
    ),
    ["task-b"],
  );
  assert.deepEqual(
    filterDashboardTasks(tasks, { query: "refugio", status: "pending" }),
    [],
  );
  assert.equal(hasDashboardTaskFilters({}), false);
  assert.equal(hasDashboardTaskFilters({ projectId: "project-a" }), true);
  assert.equal(tasks.length, 2);
});
