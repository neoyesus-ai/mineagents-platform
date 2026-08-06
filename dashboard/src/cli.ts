import { createJsonLogger } from "@mineagents/observability";
import { parseDashboardConfig } from "./config.js";
import { createDashboardServer } from "./server.js";

const config = parseDashboardConfig();
const logger = createJsonLogger({ service: "dashboard" });
const server = createDashboardServer({
  coordinatorBaseUrl: config.coordinatorBaseUrl,
  refreshSeconds: config.refreshSeconds,
  logger,
});

server.listen(config.port, "0.0.0.0", () => {
  logger.info("service.started", {
    port: config.port,
    coordinatorBaseUrl: config.coordinatorBaseUrl,
  });
});

const shutdown = (signal: string): void => {
  server.close(() => {
    logger.info("service.stopped", { signal });
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
