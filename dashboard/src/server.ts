import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  HttpMetrics,
  noopLogger,
  type StructuredLogger,
} from "@mineagents/observability";
import { CoordinatorClient, type DashboardDataSource } from "./coordinator-client.js";
import { renderDashboard, renderUnavailable } from "./view.js";

export interface DashboardServerOptions {
  coordinatorBaseUrl?: string;
  dataSource?: DashboardDataSource;
  refreshSeconds?: number;
  logger?: StructuredLogger;
  metrics?: HttpMetrics;
}

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

const sendJson = (
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  payload: unknown,
): void => {
  response.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
};

const sendHtml = (
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  html: string,
): void => {
  response.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(html);
};

const sendText = (
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  contentType: string,
  body: string,
): void => {
  response.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Type": contentType,
  });
  response.end(body);
};

const normalizeDashboardRoute = (path: string): string =>
  ["/", "/health", "/metrics", "/api/snapshot"].includes(path) ? path : "unmatched";

export const createDashboardRequestHandler = (options: DashboardServerOptions) => {
  const refreshSeconds = options.refreshSeconds ?? 10;
  if (
    !Number.isSafeInteger(refreshSeconds) ||
    refreshSeconds < 5 ||
    refreshSeconds > 3_600
  ) {
    throw new TypeError("Dashboard refresh interval must be between 5 and 3600 seconds.");
  }
  const dataSource =
    options.dataSource ??
    (options.coordinatorBaseUrl
      ? new CoordinatorClient({ baseUrl: options.coordinatorBaseUrl })
      : undefined);
  if (!dataSource) {
    throw new TypeError("Dashboard requires a data source or coordinator base URL.");
  }
  const logger = options.logger ?? noopLogger;
  const metrics = options.metrics ?? new HttpMetrics({ service: "dashboard" });

  return async (request: IncomingMessage, response: ServerResponse<IncomingMessage>) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://localhost");
    const route = normalizeDashboardRoute(url.pathname);
    const requestId = randomUUID();
    const startedAt = performance.now();
    response.setHeader("X-Request-Id", requestId);
    response.once("finish", () => {
      const durationMs = performance.now() - startedAt;
      metrics.observe({ method, route, statusCode: response.statusCode, durationMs });
      logger.info("http.request", {
        requestId,
        method,
        route,
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(3)),
      });
    });

    if (method !== "GET") {
      response.setHeader("Allow", "GET");
      sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported." } });
      return;
    }

    if (url.pathname === "/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "dashboard",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname === "/metrics") {
      sendText(
        response,
        200,
        "text/plain; version=0.0.4; charset=utf-8",
        metrics.render(),
      );
      return;
    }

    if (url.pathname === "/api/snapshot") {
      try {
        sendJson(response, 200, await dataSource.getSnapshot());
      } catch (error) {
        logger.error("coordinator.snapshot_failed", {
          requestId,
          route,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        sendJson(response, 502, {
          error: { code: "COORDINATOR_UNAVAILABLE", message: "Coordinator is unavailable." },
        });
      }
      return;
    }

    if (url.pathname === "/") {
      try {
        sendHtml(response, 200, renderDashboard(await dataSource.getSnapshot(), refreshSeconds));
      } catch (error) {
        logger.error("coordinator.snapshot_failed", {
          requestId,
          route,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        sendHtml(response, 502, renderUnavailable(refreshSeconds));
      }
      return;
    }

    sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found." } });
  };
};

export const createDashboardServer = (options: DashboardServerOptions): Server => {
  const handler = createDashboardRequestHandler(options);
  return createServer((request, response) => {
    void handler(request, response);
  });
};
