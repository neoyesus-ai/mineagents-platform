import {
  isAgentStatus,
  isTaskStatus,
  type AgentRecord,
  type ProjectRecord,
  type TaskRecord,
} from "@mineagents/sdk";
import { normalizeCoordinatorBaseUrl } from "./config.js";
import { countTasksByStatus, type CoordinatorHealth, type DashboardSnapshot } from "./contracts.js";
import { DashboardUpstreamError } from "./errors.js";

type JsonRecord = Record<string, unknown>;

export interface CoordinatorClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
}

export interface DashboardDataSource {
  getSnapshot(): Promise<DashboardSnapshot>;
}

const asRecord = (value: unknown, label: string): JsonRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DashboardUpstreamError(`Coordinator returned an invalid ${label}.`);
  }
  return value as JsonRecord;
};

const requiredString = (record: JsonRecord, key: string, label: string): string => {
  const value = record[key];
  if (typeof value !== "string") {
    throw new DashboardUpstreamError(`Coordinator returned an invalid ${label}.${key}.`);
  }
  return value;
};

const nullableString = (record: JsonRecord, key: string, label: string): string | null => {
  const value = record[key];
  if (value !== null && typeof value !== "string") {
    throw new DashboardUpstreamError(`Coordinator returned an invalid ${label}.${key}.`);
  }
  return value;
};

const requiredCount = (record: JsonRecord, key: string): number => {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new DashboardUpstreamError(`Coordinator returned an invalid health.${key}.`);
  }
  return value as number;
};

const parseHealth = (value: unknown): CoordinatorHealth => {
  const health = asRecord(value, "health response");
  if (health.status !== "ok") {
    throw new DashboardUpstreamError("Coordinator health status is not ok.");
  }
  return {
    status: "ok",
    service: requiredString(health, "service", "health"),
    timestamp: requiredString(health, "timestamp", "health"),
    agents: requiredCount(health, "agents"),
    tasks: requiredCount(health, "tasks"),
    projects: requiredCount(health, "projects"),
  };
};

const parseAgent = (value: unknown, index: number): AgentRecord => {
  const label = `agents[${index}]`;
  const agent = asRecord(value, label);
  if (!isAgentStatus(agent.status)) {
    throw new DashboardUpstreamError(`Coordinator returned an invalid ${label}.status.`);
  }
  return {
    id: requiredString(agent, "id", label),
    name: requiredString(agent, "name", label),
    role: nullableString(agent, "role", label),
    status: agent.status,
    lastHeartbeatAt: requiredString(agent, "lastHeartbeatAt", label),
    createdAt: requiredString(agent, "createdAt", label),
    updatedAt: requiredString(agent, "updatedAt", label),
  };
};

const parseProject = (value: unknown, index: number): ProjectRecord => {
  const label = `projects[${index}]`;
  const project = asRecord(value, label);
  return {
    id: requiredString(project, "id", label),
    name: requiredString(project, "name", label),
    description: nullableString(project, "description", label),
    createdAt: requiredString(project, "createdAt", label),
    updatedAt: requiredString(project, "updatedAt", label),
  };
};

const parseTask = (value: unknown, index: number): TaskRecord => {
  const label = `tasks[${index}]`;
  const task = asRecord(value, label);
  if (!isTaskStatus(task.status)) {
    throw new DashboardUpstreamError(`Coordinator returned an invalid ${label}.status.`);
  }
  return {
    id: requiredString(task, "id", label),
    projectId: nullableString(task, "projectId", label),
    title: requiredString(task, "title", label),
    description: nullableString(task, "description", label),
    status: task.status,
    assignedAgentId: nullableString(task, "assignedAgentId", label),
    failureReason: nullableString(task, "failureReason", label),
    createdAt: requiredString(task, "createdAt", label),
    updatedAt: requiredString(task, "updatedAt", label),
    startedAt: nullableString(task, "startedAt", label),
    completedAt: nullableString(task, "completedAt", label),
    failedAt: nullableString(task, "failedAt", label),
    cancelledAt: nullableString(task, "cancelledAt", label),
  };
};

const parseList = <T>(
  value: unknown,
  key: string,
  parser: (item: unknown, index: number) => T,
): readonly T[] => {
  const response = asRecord(value, `${key} response`);
  const items = response[key];
  if (!Array.isArray(items)) {
    throw new DashboardUpstreamError(`Coordinator returned an invalid ${key} list.`);
  }
  return items.map(parser);
};

export class CoordinatorClient implements DashboardDataSource {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof globalThis.fetch;
  private readonly now: () => Date;

  constructor(options: CoordinatorClientOptions) {
    this.baseUrl = normalizeCoordinatorBaseUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60_000) {
      throw new TypeError("Dashboard coordinator timeout must be between 1 and 60000 milliseconds.");
    }
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getSnapshot(): Promise<DashboardSnapshot> {
    const [healthValue, agentsValue, tasksValue, projectsValue] = await Promise.all([
      this.fetchJson("/health"),
      this.fetchJson("/agents"),
      this.fetchJson("/tasks"),
      this.fetchJson("/projects"),
    ]);
    const agents = parseList(agentsValue, "agents", parseAgent);
    const tasks = parseList(tasksValue, "tasks", parseTask);
    const projects = parseList(projectsValue, "projects", parseProject);

    return {
      generatedAt: this.now().toISOString(),
      coordinator: parseHealth(healthValue),
      agents,
      tasks,
      projects,
      taskCounts: countTasksByStatus(tasks),
    };
  }

  private async fetchJson(path: string): Promise<unknown> {
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        throw new DashboardUpstreamError(
          `Coordinator request ${path} failed with status ${response.status}.`,
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof DashboardUpstreamError) {
        throw error;
      }
      throw new DashboardUpstreamError(`Coordinator request ${path} failed.`, { cause: error });
    }
  }
}
