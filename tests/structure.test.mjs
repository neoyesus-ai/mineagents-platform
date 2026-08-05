import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const paths = ["apps/coordinator", "apps/dashboard", "agents/builder", "agents/gatherer", "packages/sdk", "packages/planner", "packages/memory", "packages/blueprints", "docs/architecture.md", "docs/vision.md", "docs/roadmap.md", "scripts"];
test("required modules exist", async () => Promise.all(paths.map((path) => access(path))));
test("manifest declares module families", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  assert.deepEqual(manifest.workspaces, ["apps/*", "agents/*", "packages/*"]);
});
