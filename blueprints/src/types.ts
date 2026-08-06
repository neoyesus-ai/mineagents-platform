import type { BuildPlacement } from "@mineagents/agent-builder";
import type { WorldRegion } from "@mineagents/minecraft-adapter";

export interface BlueprintCoordinate {
  x: number;
  y: number;
  z: number;
}

export interface BlueprintSize {
  width: number;
  height: number;
  depth: number;
}

export interface BlueprintBlock {
  position: BlueprintCoordinate;
  material: string;
}

export interface BlueprintV1 {
  schemaVersion: 1;
  id: string;
  size: BlueprintSize;
  palette: Readonly<Record<string, string>>;
  blocks: readonly BlueprintBlock[];
}

export interface BlueprintLimits {
  maxBlocks: number;
  maxPaletteEntries: number;
  maxSizeAxis: number;
}

export interface CompiledBlueprint {
  blueprintId: string;
  placements: readonly BuildPlacement[];
  requiredRegion: WorldRegion;
}
