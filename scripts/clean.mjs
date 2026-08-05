import { rm } from "node:fs/promises";
for (const path of ["apps/coordinator/dist", "apps/dashboard/dist", "agents/gatherer/dist", "agents/builder/dist", "packages/sdk/dist", "packages/planner/dist", "packages/memory/dist", "packages/blueprints/dist"]) {
  await rm(path, { force: true, recursive: true });
}
