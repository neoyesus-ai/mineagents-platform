export interface WorldPosition {
  dimension: string;
  x: number;
  y: number;
  z: number;
}

export interface WorldRegion {
  dimension: string;
  min: Omit<
    WorldPosition,
    "dimension"
  >;
  max: Omit<
    WorldPosition,
    "dimension"
  >;
}

export interface MinecraftBlockSnapshot {
  position: WorldPosition;
  name: string;
  solid: boolean;
}

export interface MinecraftAgentState {
  connected: boolean;
  position: WorldPosition;
}

export interface MinecraftBlockSearch {
  blockName: string;
  maxDistance: number;
  maxResults: number;
}

export type MinecraftWriteAction =
  | "place-block"
  | "break-block";

export interface MinecraftWriteRequest {
  action: MinecraftWriteAction;
  position: WorldPosition;
  blockName: string;
}

export interface MinecraftAuthorization {
  id: string;
  taskId: string;
  allowedActions:
    readonly MinecraftWriteAction[];
  allowedRegion: WorldRegion;
  expiresAt: string;
  maxActions: number;
}

export interface MinecraftAuthorizationVerifier {
  verify(
    authorization:
      MinecraftAuthorization,
    request:
      MinecraftWriteRequest,
  ): Promise<boolean>;
}

export interface MinecraftSafetyPolicy {
  allowedRegions:
    readonly WorldRegion[];
  allowMovement: boolean;
  allowedPlaceBlocks:
    readonly string[];
  allowedBreakBlocks:
    readonly string[];
  maxActionsPerAuthorization:
    number;
}

export interface MinecraftDriver {
  getState():
    Promise<MinecraftAgentState>;

  inspectBlock(
    position: WorldPosition,
  ): Promise<MinecraftBlockSnapshot>;

  findBlocks(
    search: MinecraftBlockSearch,
  ): Promise<
    readonly WorldPosition[]
  >;

  getInventoryCount(
    itemName: string,
  ): number;

  dropInventoryItem(
    itemName: string,
    quantity: number,
  ): Promise<void>;

  moveTo(
    target: WorldPosition,
    allowedRegions:
      readonly WorldRegion[],
  ): Promise<void>;

  placeBlock(
    position: WorldPosition,
    blockName: string,
    expectedCurrentBlockNames:
      readonly string[],
  ): Promise<void>;

  breakBlock(
    position: WorldPosition,
    expectedBlockName: string,
  ): Promise<void>;
}

export interface MinecraftAdapter {
  getState():
    Promise<MinecraftAgentState>;

  inspectBlock(
    position: WorldPosition,
  ): Promise<MinecraftBlockSnapshot>;

  moveTo(
    target: WorldPosition,
  ): Promise<void>;

  placeBlock(
    position: WorldPosition,
    blockName: string,
    authorization?:
      MinecraftAuthorization,
  ): Promise<void>;

  breakBlock(
    position: WorldPosition,
    expectedBlockName: string,
    authorization?:
      MinecraftAuthorization,
  ): Promise<void>;
}