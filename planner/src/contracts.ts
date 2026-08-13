import type {
  TaskCreateInput,
} from "@mineagents/sdk";

export interface ProjectPlanCandidate {
  dimension: string;
  x: number;
  y: number;
  z: number;
}

export interface ProjectPlanPlacement {
  position: ProjectPlanCandidate;
  blockName: string;
}

export interface ProjectPlanSearch {
  dimension: string;
  maxDistance: number;
  maxCandidates: number;
}

export interface ProjectPlanCollection {
  blockName: string;
  quantity: number;

  candidates?:
    readonly ProjectPlanCandidate[];

  search?:
    ProjectPlanSearch;

  allowPartial?: boolean;
}

export interface ProjectPlanBuild {
  placements:
    readonly ProjectPlanPlacement[];

  allowPartial?: boolean;
}

/*
 * El parser acepta dos formatos:
 *
 * Legacy:
 *
 *   collection: {...}
 *
 * Multi-material:
 *
 *   collections: [{...}, {...}]
 *
 * Ambos se normalizan internamente a
 * collections[].
 */
export interface ProjectPlanInput {
  name: string;

  description?:
    string | null;

  collections:
    readonly ProjectPlanCollection[];

  build:
    ProjectPlanBuild;
}

export interface PlannedTask {
  key: string;

  task:
    TaskCreateInput;

  dependsOnKeys:
    readonly string[];
}

export interface ProjectPlan {
  project: {
    name: string;

    description?:
      string | null;
  };

  tasks:
    readonly PlannedTask[];
}
