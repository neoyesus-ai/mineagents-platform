import { ContractValidationError } from "./errors.js";
import { asObject, assertKnownKeys, optionalId, optionalText, requiredString } from "./validation.js";

export const taskStatuses = [
  "pending",
  "assigned",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export const isTaskStatus = (value: unknown): value is TaskStatus =>
  typeof value === "string" && taskStatuses.includes(value as TaskStatus);

const taskTransitions = {
  pending: ["assigned", "cancelled"],
  assigned: ["pending", "running", "failed", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
} as const satisfies Record<TaskStatus, readonly TaskStatus[]>;

export const canTransitionTaskStatus = (
  current: TaskStatus,
  next: TaskStatus,
): boolean => current === next || taskTransitions[current].some((status) => status === next);

export const isTerminalTaskStatus = (status: TaskStatus): boolean =>
  status === "completed" || status === "failed" || status === "cancelled";

export interface TaskRecord {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignedAgentId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
}

export interface TaskCreateInput {
  title: string;
  description?: string | null;
  projectId?: string | null;
}

export interface TaskPatchInput {
  title?: string;
  description?: string | null;
  projectId?: string | null;
  assignedAgentId?: string | null;
  failureReason?: string | null;
  status?: TaskStatus;
}

export interface ClaimTaskInput {
  agentId: string;
}

export const parseTaskCreateInput = (value: unknown): TaskCreateInput => {
  const input = asObject(value);
  assertKnownKeys(input, ["title", "description", "projectId"]);

  return {
    title: requiredString(input.title, "title"),
    description: optionalText(input.description, "description"),
    projectId: optionalId(input.projectId, "projectId"),
  };
};

export const parseTaskPatchInput = (value: unknown): TaskPatchInput => {
  const input = asObject(value);
  const allowedKeys = [
    "title",
    "description",
    "projectId",
    "assignedAgentId",
    "failureReason",
    "status",
  ] as const;
  assertKnownKeys(input, allowedKeys);

  if (Object.keys(input).length === 0) {
    throw new ContractValidationError("At least one task field must be provided.");
  }

  if (input.status !== undefined && !isTaskStatus(input.status)) {
    throw new ContractValidationError("Field 'status' must be a valid task status.");
  }

  return {
    title: input.title === undefined ? undefined : requiredString(input.title, "title"),
    description: optionalText(input.description, "description"),
    projectId: optionalId(input.projectId, "projectId"),
    assignedAgentId: optionalId(input.assignedAgentId, "assignedAgentId"),
    failureReason: optionalText(input.failureReason, "failureReason"),
    status: isTaskStatus(input.status) ? input.status : undefined,
  };
};

export const parseClaimTaskInput = (value: unknown): ClaimTaskInput => {
  const input = asObject(value);
  assertKnownKeys(input, ["agentId"]);

  return {
    agentId: requiredString(input.agentId, "agentId"),
  };
};
