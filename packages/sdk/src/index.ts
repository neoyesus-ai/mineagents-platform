export type AgentRole = "builder" | "gatherer";
export type TaskStatus = "pending" | "claimed" | "running" | "completed" | "failed";
export interface AgentTask<T = unknown> { readonly id: string; readonly kind: string; readonly payload: T; readonly status: TaskStatus; }
export interface Agent { readonly id: string; readonly role: AgentRole; execute(task: AgentTask): Promise<void>; }
