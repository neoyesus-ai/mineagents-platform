import { cloneRegion } from "./geometry.js";
import type { MinecraftSafetyPolicy, WorldRegion } from "./types.js";

export interface ReadOnlyMinecraftPolicyOptions {
  allowMovement?: boolean;
}

export const createReadOnlyMinecraftPolicy = (
  allowedRegions: readonly WorldRegion[],
  options: ReadOnlyMinecraftPolicyOptions = {},
): MinecraftSafetyPolicy => ({
  allowedRegions: allowedRegions.map(cloneRegion),
  allowMovement: options.allowMovement ?? false,
  allowedPlaceBlocks: [],
  allowedBreakBlocks: [],
  maxActionsPerAuthorization: 1,
});
