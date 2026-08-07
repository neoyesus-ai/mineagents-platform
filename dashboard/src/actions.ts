import type { IncomingMessage } from "node:http";
import type { ProjectInput, TaskCreateInput } from "@mineagents/sdk";
import type { DashboardDataSource } from "./coordinator-client.js";
import { DashboardActionsUnavailableError, DashboardInputError } from "./errors.js";

const maxFormBytes = 16_384;

export type DashboardAction =
  | { kind: "create-project" }
  | { kind: "create-task" }
  | { kind: "cancel-task"; taskId: string };

export type DashboardActionNotice = "project-created" | "task-created" | "task-cancelled";

export const matchDashboardAction = (pathname: string): DashboardAction | undefined => {
  if (pathname === "/actions/projects") {
    return { kind: "create-project" };
  }
  if (pathname === "/actions/tasks") {
    return { kind: "create-task" };
  }

  const match = pathname.match(/^\/actions\/tasks\/([^/]+)\/cancel$/);
  if (!match?.[1]) {
    return undefined;
  }

  try {
    const taskId = decodeURIComponent(match[1]);
    return taskId.length > 0 ? { kind: "cancel-task", taskId } : undefined;
  } catch {
    throw new DashboardInputError("Task id is not valid URL encoding.");
  }
};

export const assertDashboardActionOrigin = (request: IncomingMessage): void => {
  const origin = request.headers.origin;
  const host = request.headers.host;
  const fetchSite = request.headers["sec-fetch-site"];

  if (fetchSite?.toLowerCase() === "cross-site" || typeof origin !== "string" || !host) {
    throw new DashboardInputError("Dashboard actions require a same-origin browser request.");
  }

  try {
    const parsedOrigin = new URL(origin);
    if (
      (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") ||
      parsedOrigin.username !== "" ||
      parsedOrigin.password !== "" ||
      parsedOrigin.host.toLowerCase() !== host.toLowerCase()
    ) {
      throw new DashboardInputError("Dashboard action origin does not match its host.");
    }
  } catch (error) {
    if (error instanceof DashboardInputError) {
      throw error;
    }
    throw new DashboardInputError("Dashboard action origin is invalid.");
  }
};

const readForm = async (request: IncomingMessage): Promise<URLSearchParams> => {
  const contentType = request.headers["content-type"];
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    typeof contentType !== "string" ||
    mediaType !== "application/x-www-form-urlencoded"
  ) {
    throw new DashboardInputError("Dashboard actions require URL-encoded form data.");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxFormBytes) {
      throw new DashboardInputError("Dashboard action form is too large.");
    }
    chunks.push(buffer);
  }

  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
};

const assertKnownFields = (form: URLSearchParams, allowed: readonly string[]): void => {
  for (const key of form.keys()) {
    if (!allowed.includes(key) || form.getAll(key).length !== 1) {
      throw new DashboardInputError(`Unexpected or repeated form field '${key}'.`);
    }
  }
};

const requiredField = (form: URLSearchParams, key: string, maxLength: number): string => {
  const value = form.get(key)?.trim();
  if (!value) {
    throw new DashboardInputError(`Form field '${key}' is required.`);
  }
  if (value.length > maxLength) {
    throw new DashboardInputError(`Form field '${key}' is too long.`);
  }
  return value;
};

const optionalField = (
  form: URLSearchParams,
  key: string,
  maxLength: number,
): string | undefined => {
  const value = form.get(key)?.trim();
  if (!value) {
    return undefined;
  }
  if (value.length > maxLength) {
    throw new DashboardInputError(`Form field '${key}' is too long.`);
  }
  return value;
};

const parseProjectForm = (form: URLSearchParams): ProjectInput => {
  assertKnownFields(form, ["name", "description"]);
  return {
    name: requiredField(form, "name", 120),
    description: optionalField(form, "description", 2_000),
  };
};

const parseTaskForm = (form: URLSearchParams): TaskCreateInput => {
  assertKnownFields(form, ["title", "description", "projectId"]);
  return {
    title: requiredField(form, "title", 200),
    description: optionalField(form, "description", 4_000),
    projectId: optionalField(form, "projectId", 200),
  };
};

export const executeDashboardAction = async (
  action: DashboardAction,
  request: IncomingMessage,
  dataSource: DashboardDataSource,
): Promise<DashboardActionNotice> => {
  assertDashboardActionOrigin(request);
  const form = await readForm(request);

  if (action.kind === "create-project") {
    if (!dataSource.createProject) {
      throw new DashboardActionsUnavailableError();
    }
    await dataSource.createProject(parseProjectForm(form));
    return "project-created";
  }

  if (action.kind === "create-task") {
    if (!dataSource.createTask) {
      throw new DashboardActionsUnavailableError();
    }
    await dataSource.createTask(parseTaskForm(form));
    return "task-created";
  }

  assertKnownFields(form, []);
  if (!dataSource.cancelTask) {
    throw new DashboardActionsUnavailableError();
  }
  await dataSource.cancelTask(action.taskId);
  return "task-cancelled";
};
