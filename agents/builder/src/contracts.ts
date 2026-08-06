import type { MinecraftAuthorization, WorldPosition } from "@mineagents/minecraft-adapter";

export interface BuildPlacement {
  position: WorldPosition;
  blockName: string;
}

export interface BuildRequest {
  taskId: string;
  placements: readonly BuildPlacement[];
  authorization: MinecraftAuthorization;
  allowPartial?: boolean;
}

export interface BuilderRunOptions {
  signal?: AbortSignal;
}

export type BuilderRunStatus = "completed" | "partial" | "blocked" | "cancelled" | "failed";

export interface BlockedPlacement extends BuildPlacement {
  existingBlockName: string;
}

export interface BuilderRunResult {
  taskId: string;
  status: BuilderRunStatus;
  requestedPlacements: number;
  inspectedPositions: number;
  alreadySatisfied: number;
  blockedPlacements: readonly BlockedPlacement[];
  placedBlocks: number;
  placedPositions: readonly WorldPosition[];
}

export interface BuilderLimits {
  maxPlacementsPerTask: number;
}
