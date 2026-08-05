import { createServer } from "node:http";

const host = process.env.COORDINATOR_HOST ?? "0.0.0.0";
const port = Number(process.env.COORDINATOR_PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Invalid COORDINATOR_PORT");

const server = createServer((request, response) => {
  const healthy = request.method === "GET" && request.url === "/health";
  response.writeHead(healthy ? 200 : 404, { "content-type": "application/json" });
  response.end(JSON.stringify(healthy ? { service: "coordinator", status: "ok" } : { error: "not_found" }));
});
server.listen(port, host, () => console.log("Coordinator listening"));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close());
