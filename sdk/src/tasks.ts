import { ContractValidationError } from "./errors.js";
import {
  asObject,
  assertKnownKeys,
  optionalId,
  optionalText,
  requiredString,
} from "./validation.js";

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
  typeof value === "string" &&
  taskStatuses.includes(value as TaskStatus);

export const taskKinds = [
  "manual",
  "collect-blocks",
  "build-blueprint",
  "move",
] as const;

export type TaskKind = (typeof taskKinds)[number];

export const isTaskKind = (value: unknown): value is TaskKind =>
  typeof value === "string" &&
  taskKinds.includes(value as TaskKind);

export type TaskPayload = Record<string, unknown>;

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
): boolean =>
  current === next ||
  taskTransitions[current].some((status) => status === next);

export const isTerminalTaskStatus = (
  status: TaskStatus,
): boolean =>
  status === "completed" ||
  status === "failed" ||
  status === "cancelled";

export interface TaskRecord {
  id: string;
  projectId: string | null;

  title: string;
  description: string | null;

  kind: TaskKind;
  requiredRole: string | null;
  payload: TaskPayload;

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

  kind?: TaskKind;
  requiredRole?: string | null;
  payload?: TaskPayload;
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

const parsePayload = (
  value: unknown,
): TaskPayload => {
  if (value === undefined) {
    return {};
  }

  return asObject(value);
};

const parseRequiredRole = (
  value: unknown,
): string | null | undefined =>
  optionalText(value, "requiredRole");

const validateExecutableTask = (
  kind: TaskKind,
  requiredRole: string | null | undefined,
): void => {
  if (kind === "manual") {
    return;
  }

  if (
    requiredRole === undefined ||
    requiredRole === null ||
    requiredRole.trim().length === 0
  ) {
    throw new ContractValidationError(
      `Task kind '${kind}' requires a non-empty 'requiredRole'.`,
    );
  }
};

export const parseTaskCreateInput = (
  value: unknown,
): TaskCreateInput => {
  const input = asObject(value);

  assertKnownKeys(input, [
    "title",
    "description",
    "projectId",
    "kind",
    "requiredRole",
    "payload",
  ]);

  if (
    input.kind !== undefined &&
    !isTaskKind(input.kind)
  ) {
    throw new ContractValidationError(
      "Field 'kind' must be a valid task kind.",
    );
  }

  const kind: TaskKind = isTaskKind(input.kind)
    ? input.kind
    : "manual";

  const requiredRole = parseRequiredRole(
    input.requiredRole,
  );

  validateExecutableTask(kind, requiredRole);

  return {
    title: requiredString(input.title, "title"),
    description: optionalText(
      input.description,
      "description",
    ),
    projectId: optionalId(
      input.projectId,
      "projectId",
    ),
    kind,
    requiredRole:
      requiredRole === undefined
        ? null
        : requiredRole,
    payload: parsePayload(input.payload),
  };
};

export const parseTaskPatchInput = (
  value: unknown,
): TaskPatchInput => {
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
    throw new ContractValidationError(
      "At least one task field must be provided.",
    );
  }

  if (
    input.status !== undefined &&
    !isTaskStatus(input.status)
  ) {
    throw new ContractValidationError(
      "Field 'status' must be a valid task status.",
    );
  }

  return {
    title:
      input.title === undefined
        ? undefined
        : requiredString(input.title, "title"),

    description: optionalText(
      input.description,
      "description",
    ),

    projectId: optionalId(
      input.projectId,
      "projectId",
    ),

    assignedAgentId: optionalId(
      input.assignedAgentId,
      "assignedAgentId",
    ),

    failureReason: optionalText(
      input.failureReason,
      "failureReason",
    ),

    status: isTaskStatus(input.status)
      ? input.status
      : undefined,
  };
};

export const parseClaimTaskInput = (
  value: unknown,
): ClaimTaskInput => {
  const input = asObject(value);

  assertKnownKeys(input, ["agentId"]);

  return {
    agentId: requiredString(
      input.agentId,
      "agentId",
    ),
  };
};