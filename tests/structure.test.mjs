import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const requiredPaths = [
  "coordinator",
  "sdk",
  "observability",
  "minecraft-adapter",
  "minecraft-driver-mineflayer",
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
  "docs/deployment.md",
  "docs/mvp-flow.md",
  "docs/observability.md",
  "docs/decisions/0010-bounded-mineflayer-movement.md",
  "docs/decisions/0011-preconditioned-mineflayer-writes.md",
  "docs/minecraft-server.md",
  "docs/decisions/0008-disposable-minecraft-server.md",
  "docs/decisions/0009-read-only-mineflayer-driver.md",
  "docs/vision.md",
  "docs/roadmap.md",
  "scripts",
  "coordinator/Dockerfile",
  "dashboard/Dockerfile",
  "minecraft-driver-mineflayer/Dockerfile",
];

const expectedWorkspaces = [
  "sdk",
  "observability",
  "minecraft-adapter",
  "minecraft-driver-mineflayer",
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

test("root manifest pins the audited uuid compatibility override", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(manifest.overrides?.uuid, "11.1.1");
});

test("Mineflayer driver exposes the reproducible movement smoke command", async () => {
  const manifest = JSON.parse(
    await readFile("minecraft-driver-mineflayer/package.json", "utf8"),
  );

  assert.equal(manifest.scripts?.["smoke:movement"], "node dist/movement-smoke-cli.js");
});

test("compose pins an isolated Minecraft development server", async () => {
  const compose = await readFile("docker-compose.yml", "utf8");

  assert.match(compose, /image: itzg\/minecraft-server:2026\.5\.3-java21/);
  assert.match(compose, /VERSION: "\$\{MINECRAFT_VERSION:-1\.21\.11\}"/);
  assert.match(
    compose,
    /"127\.0\.0\.1:\$\{MINECRAFT_PORT:-25565\}:25565"/,
  );
  assert.match(
    compose,
    /"127\.0\.0\.1:\$\{COORDINATOR_PORT:-3000\}:3000"/,
  );
  assert.match(
    compose,
    /"127\.0\.0\.1:\$\{DASHBOARD_PORT:-3001\}:3001"/,
  );
  assert.match(compose, /minecraft-demo-data:\/data/);
  assert.match(compose, /COORDINATOR_DATA_VOLUME:-mineagents-platform_coordinator-data/);
  assert.match(compose, /MINECRAFT_DATA_VOLUME:-mineagents-platform_minecraft-demo-data/);
  assert.match(compose, /ONLINE_MODE: "FALSE"/);
  assert.match(compose, /mineflayer-observer:/);
  assert.match(compose, /MINECRAFT_HOST: minecraft/);
});
