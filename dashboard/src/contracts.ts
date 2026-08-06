import {
  taskStatuses,
  type AgentRecord,
  type ProjectRecord,
  type TaskRecord,
  type TaskStatus,
} from "@mineagents/sdk";

export interface CoordinatorHealth {
  status: "ok";
  service: string;
  timestamp: string;
  agents: number;
  tasks: number;
  projects: number;
}

export interface DashboardSnapshot {
  generatedAt: string;
  coordinator: CoordinatorHealth;
  agents: readonly AgentRecord[];
  tasks: readonly TaskRecord[];
  projects: readonly ProjectRecord[];
  taskCounts: Readonly<Record<TaskStatus, number>>;
}

export const countTasksByStatus = (
  tasks: readonly TaskRecord[],
): Readonly<Record<TaskStatus, number>> => {
  const counts = Object.fromEntries(taskStatuses.map((status) => [status, 0])) as Record<
    TaskStatus,
    number
  >;
  for (const task of tasks) {
    counts[task.status] += 1;
  }
  return counts;
};
