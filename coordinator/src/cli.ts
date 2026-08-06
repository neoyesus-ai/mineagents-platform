import { createCoordinatorServer } from "./server.js";

const port = Number(process.env.COORDINATOR_PORT ?? process.env.PORT ?? "3000");
const dbPath = process.env.COORDINATOR_DB_PATH ?? "./data/coordinator.sqlite";

const server = createCoordinatorServer({ dbPath });

server.listen(port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      service: "coordinator",
      port,
      dbPath,
    }),
  );
});

const shutdown = (signal: string) => {
  server.close(() => {
    console.log(JSON.stringify({ service: "coordinator", stoppedBy: signal }));
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
