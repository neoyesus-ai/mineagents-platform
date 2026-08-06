import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  ContractValidationError,
  parseClaimTaskInput,
  parseHeartbeatInput,
  parseProjectInput,
  parseTaskCreateInput,
  parseTaskPatchInput,
} from "@mineagents/sdk";
import { AppError, ValidationError } from "./errors.js";
import { CoordinatorStore } from "./database.js";

export interface CoordinatorServerOptions {
  dbPath: string;
}

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

const MAX_BODY_BYTES = 1_048_576;

const sendJson = (
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  payload: JsonValue,
  headers: Record<string, string> = {},
): void => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(payload));
};

const isJsonRequest = (request: IncomingMessage): boolean => {
  const contentType = request.headers["content-type"];
  return typeof contentType === "string" && contentType.includes("application/json");
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  if (!isJsonRequest(request)) {
    throw new ValidationError("Content-Type must be application/json.");
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new ValidationError("Request body is too large.");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
};

const notFound = (response: ServerResponse<IncomingMessage>): void => {
  sendJson(response, 404, {
    error: {
      code: "NOT_FOUND",
      message: "Route not found.",
    },
  });
};

export const createCoordinatorRequestHandler = (options: CoordinatorServerOptions) => {
  const store = new CoordinatorStore(options.dbPath);

  const handler = async (request: IncomingMessage, response: ServerResponse<IncomingMessage>) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://localhost");

    try {
      if (method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          status: "ok",
          service: "coordinator",
          timestamp: new Date().toISOString(),
          agents: store.listAgents().length,
          tasks: store.listTasks().length,
          projects: store.listProjects().length,
        });
        return;
      }

      if (method === "GET" && url.pathname === "/agents") {
        sendJson(response, 200, { agents: store.listAgents() });
        return;
      }

      if (method === "POST" && url.pathname === "/agents/heartbeat") {
        const payload = parseHeartbeatInput(await readJsonBody(request));
        const agent = store.upsertAgentHeartbeat(payload);
        sendJson(response, 200, { agent });
        return;
      }

      if (method === "GET" && url.pathname === "/tasks") {
        sendJson(response, 200, { tasks: store.listTasks() });
        return;
      }

      if (method === "POST" && url.pathname === "/tasks") {
        const payload = parseTaskCreateInput(await readJsonBody(request));
        const task = store.createTask(payload);
        sendJson(response, 201, { task });
        return;
      }

      if (method === "POST" && url.pathname === "/tasks/claim") {
        const payload = parseClaimTaskInput(await readJsonBody(request));
        const task = store.claimNextTask(payload.agentId);
        if (!task) {
          sendJson(response, 404, {
            error: {
              code: "NO_PENDING_TASKS",
              message: "No pending tasks are available to claim.",
            },
          });
          return;
        }

        sendJson(response, 200, { task });
        return;
      }

      const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
      if (method === "PATCH" && taskMatch) {
        const payload = parseTaskPatchInput(await readJsonBody(request));
        const taskId = taskMatch[1];
        if (!taskId) {
          throw new ValidationError("Task id is required.");
        }

        const task = store.patchTask(decodeURIComponent(taskId), payload);
        sendJson(response, 200, { task });
        return;
      }

      if (method === "GET" && url.pathname === "/projects") {
        sendJson(response, 200, { projects: store.listProjects() });
        return;
      }

      if (method === "POST" && url.pathname === "/projects") {
        const payload = parseProjectInput(await readJsonBody(request));
        const project = store.createProject(payload);
        sendJson(response, 201, { project });
        return;
      }

      notFound(response);
    } catch (error) {
      if (error instanceof ContractValidationError) {
        const validationError = new ValidationError(error.message);
        sendJson(response, validationError.statusCode, {
          error: { code: validationError.code, message: validationError.message },
        });
        return;
      }

      if (error instanceof AppError) {
        sendJson(response, error.statusCode, {
          error: {
            code: error.code,
            message: error.message,
          },
        });
        return;
      }

      const message = error instanceof Error ? error.message : "Unknown error.";
      sendJson(response, 500, {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message,
        },
      });
    }
  };

  return { handler, store };
};

export const createCoordinatorServer = (options: CoordinatorServerOptions): Server => {
  const { handler, store } = createCoordinatorRequestHandler(options);
  const server = createServer((request, response) => {
    void handler(request, response);
  });

  server.once("close", () => {
    store.close();
  });

  return server;
};
