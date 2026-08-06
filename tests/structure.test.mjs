import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const requiredPaths = [
  "coordinator",
  "sdk",
  "observability",
  "minecraft-adapter",
  "agents/collector",
  "agents/builder",
  "agents/explorer",
  "agents/common",
  "planner",
  "memory",
  "dashboard",
  "blueprints",
  "observability/package.json",
  "docs/architecture.md",
  "docs/dashboard.md",
  "docs/observability.md",
  "docs/vision.md",
  "docs/roadmap.md",
  "scripts",
  "coordinator/Dockerfile",
  "dashboard/Dockerfile",
];

const expectedWorkspaces = [
  "sdk",
  "observability",
  "minecraft-adapter",
  "coordinator",
  "agents/*",
  "planner",
  "memory",
  "dashboard",
  "blueprints",
];

test("required modules and documentation exist", async () => {
  await Promise.all(requiredPaths.map((path) => access(path)));
});

test("root manifest declares the expected workspaces", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  assert.deepEqual(manifest.workspaces, expectedWorkspaces);
});

test("root manifest exposes every validation command", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));

  for (const command of ["build", "test", "lint", "typecheck"]) {
    assert.equal(typeof manifest.scripts?.[command], "string");
  }
});
