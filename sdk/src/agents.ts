import { asObject, assertKnownKeys, optionalId, optionalText, requiredString } from "./validation.js";

export const agentStatuses = ["online", "offline"] as const;

export type AgentStatus = (typeof agentStatuses)[number];

export const isAgentStatus = (value: unknown): value is AgentStatus =>
  typeof value === "string" && agentStatuses.includes(value as AgentStatus);

export interface AgentRecord {
  id: string;
  name: string;
  role: string | null;
  status: AgentStatus;
  lastHeartbeatAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface HeartbeatInput {
  id?: string;
  name: string;
  role?: string | null;
}

export const parseHeartbeatInput = (value: unknown): HeartbeatInput => {
  const input = asObject(value);
  assertKnownKeys(input, ["id", "name", "role"]);

  const id = optionalId(input.id, "id");
  const role = optionalText(input.role, "role");

  return {
    id: id ?? undefined,
    name: requiredString(input.name, "name"),
    role,
  };
};
