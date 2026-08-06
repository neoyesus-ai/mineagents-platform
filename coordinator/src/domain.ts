export const taskStatuses = [
  "pending",
  "assigned",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export const agentStatuses = ["online", "offline"] as const;

export type AgentStatus = (typeof agentStatuses)[number];

export const isTaskStatus = (value: unknown): value is TaskStatus =>
  typeof value === "string" && taskStatuses.includes(value as TaskStatus);

export interface AgentRecord {
  id: string;
  name: string;
  role: string | null;
  status: AgentStatus;
  lastHeartbeatAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

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

export interface HeartbeatInput {
  id?: string;
  name: string;
  role?: string | null;
}

export interface ProjectInput {
  name: string;
  description?: string | null;
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
