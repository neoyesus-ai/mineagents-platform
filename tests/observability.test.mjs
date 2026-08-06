import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createJsonLogger,
  HttpMetrics,
} from "../observability/dist/index.js";

test("JSON logger preserves reserved fields and serializes safe structured records", () => {
  const lines = [];
  const logger = createJsonLogger({
    service: "coordinator",
    write: (line) => lines.push(line),
    now: () => new Date("2026-08-06T20:00:00.000Z"),
  });

  logger.info("service.started", {
    service: "attempted-override",
    event: "attempted-override",
    actions: 2n,
  });

  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    service: "coordinator",
    event: "service.started",
    actions: "2",
    timestamp: "2026-08-06T20:00:00.000Z",
    level: "info",
  });
});

test("HTTP metrics expose bounded labels, durations, uptime and validated gauges", () => {
  let now = 1_000;
  const metrics = new HttpMetrics({ service: "coordinator", now: () => now });
  now = 1_250;
  metrics.observe({
    method: "PATCH",
    route: "/tasks/:id",
    statusCode: 200,
    durationMs: 125,
  });
  metrics.observe({
    method: "CUSTOM-VERB",
    route: "unmatched",
    statusCode: 404,
    durationMs: 25,
  });

  const output = metrics.render([
    {
      name: "mineagents_coordinator_tasks",
      help: "Tasks stored.",
      value: 3,
    },
  ]);
  assert.match(output, /method="PATCH",route="\/tasks\/:id",status_code="200"} 1/);
  assert.match(output, /method="OTHER",route="unmatched",status_code="404"} 1/);
  assert.match(output, /mineagents_http_request_duration_seconds_sum.* 0\.125/);
  assert.match(output, /mineagents_process_uptime_seconds\{service="coordinator"} 0\.25/);
  assert.match(output, /mineagents_coordinator_tasks\{service="coordinator"} 3/);
  assert.throws(
    () => metrics.render([{ name: "invalid metric", help: "no", value: 1 }]),
    /valid name/,
  );
});
