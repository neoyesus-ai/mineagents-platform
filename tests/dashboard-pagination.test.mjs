import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDashboardPageHref,
  paginateDashboardTasks,
  parseDashboardPage,
  renderDashboard,
} from "../dashboard/dist/index.js";

const timestamp = "2026-08-07T00:00:00.000Z";

const makeTask = (index) => ({
  id: "task-" + index,
  projectId: "project-a",
  title: "Elemento " + String(index).padStart(3, "0"),
  description: null,
  status: "pending",
  assignedAgentId: null,
  failureReason: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  startedAt: null,
  completedAt: null,
  failedAt: null,
  cancelledAt: null,
});

const tasks = Array.from({ length: 51 }, (_, index) => makeTask(index + 1));

test("dashboard pagination parses bounded pages and clamps result ranges", () => {
  assert.equal(parseDashboardPage(new globalThis.URLSearchParams({ page: "2" })), 2);
  assert.equal(parseDashboardPage(new globalThis.URLSearchParams({ page: "0" })), 1);
  assert.equal(parseDashboardPage(new globalThis.URLSearchParams({ page: "10001" })), 1);

  const repeated = new globalThis.URLSearchParams({ page: "1" });
  repeated.append("page", "2");
  assert.equal(parseDashboardPage(repeated), 1);

  const secondPage = paginateDashboardTasks(tasks, 2);
  assert.equal(secondPage.currentPage, 2);
  assert.equal(secondPage.totalPages, 2);
  assert.equal(secondPage.firstItem, 51);
  assert.equal(secondPage.lastItem, 51);
  assert.equal(secondPage.items[0].id, "task-51");
  assert.equal(secondPage.hasPrevious, true);
  assert.equal(secondPage.hasNext, false);
  assert.equal(paginateDashboardTasks(tasks, 99).currentPage, 2);
  assert.throws(() => paginateDashboardTasks(tasks, 1, 0), /between 1 and 100/);
});

test("dashboard pagination links preserve bounded filters", () => {
  assert.equal(
    buildDashboardPageHref(
      {
        query: "piedra roja",
        status: "pending",
        projectId: "project/a",
      },
      2,
    ),
    "/?q=piedra+roja&status=pending&projectId=project%2Fa&page=2",
  );
  assert.equal(buildDashboardPageHref({ status: "pending" }, 1), "/?status=pending");
});

test("dashboard renders the requested task page with accessible navigation", () => {
  const html = renderDashboard(
    {
      generatedAt: timestamp,
      coordinator: {
        status: "ok",
        service: "coordinator",
        timestamp,
        agents: 0,
        tasks: 51,
        projects: 1,
      },
      agents: [],
      projects: [
        {
          id: "project-a",
          name: "Proyecto A",
          description: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      tasks,
      taskCounts: {
        pending: 51,
        assigned: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      },
    },
    10,
    {
      filters: { status: "pending", projectId: "project-a" },
      page: 2,
    },
  );

  assert.match(html, /Elemento 051/);
  assert.doesNotMatch(html, /Elemento 001/);
  assert.match(html, /Página 2 de 2/);
  assert.match(html, /Mostrando 51–51 de 51/);
  assert.match(html, /href="\/\?status=pending&amp;projectId=project-a" rel="prev"/);
  assert.match(html, /aria-disabled="true">Siguiente/);
});
