import { parseDashboardConfig } from "./config.js";
import { createDashboardServer } from "./server.js";

const config = parseDashboardConfig();
const server = createDashboardServer({
  coordinatorBaseUrl: config.coordinatorBaseUrl,
  refreshSeconds: config.refreshSeconds,
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      service: "dashboard",
      event: "started",
      port: config.port,
      coordinatorBaseUrl: config.coordinatorBaseUrl,
    }),
  );
});

const shutdown = (signal: string): void => {
  server.close(() => {
    console.log(JSON.stringify({ service: "dashboard", event: "stopped", signal }));
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
