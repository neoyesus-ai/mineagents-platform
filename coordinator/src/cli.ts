import { createJsonLogger } from "@mineagents/observability";
import { createCoordinatorServer } from "./server.js";

const port = Number(process.env.COORDINATOR_PORT ?? process.env.PORT ?? "3000");
const dbPath = process.env.COORDINATOR_DB_PATH ?? "./data/coordinator.sqlite";

const logger = createJsonLogger({ service: "coordinator" });
process.on("warning", (warning) => {
  logger.info("process.warning", {
    warningName: warning.name,
    warningCode: (warning as Error & { code?: string }).code ?? null,
  });
});
const server = createCoordinatorServer({ dbPath, logger });

server.listen(port, "0.0.0.0", () => {
  logger.info("service.started", { port, dbPath });
});

const shutdown = (signal: string) => {
  server.close(() => {
    logger.info("service.stopped", { signal });
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
