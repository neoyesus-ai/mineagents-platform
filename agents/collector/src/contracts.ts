import type {
  MinecraftAuthorization,
  WorldPosition,
} from "@mineagents/minecraft-adapter";

export interface CollectBlocksRequest {
  taskId: string;
  blockName: string;
  quantity: number;
  candidates: readonly WorldPosition[];
  authorization: MinecraftAuthorization;
  allowPartial?: boolean;
}

export interface CollectorRunOptions {
  signal?: AbortSignal;
}

export type CollectorRunStatus =
  | "completed"
  | "partial"
  | "insufficient-resources"
  | "cancelled"
  | "failed";

export interface CollectorRunResult {
  taskId: string;
  blockName: string;
  status: CollectorRunStatus;
  requestedBlocks: number;
  inspectedPositions: number;
  matchingBlocks: number;
  brokenBlocks: number;
  brokenPositions: readonly WorldPosition[];
}

export interface CollectorLimits {
  maxBlocksPerTask: number;
  maxCandidatesPerTask: number;
}
