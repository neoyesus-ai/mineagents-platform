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

export interface ProjectPlanCollectionStrategy {
  search:
    ProjectPlanSearch;

  allowPartial?: boolean;
}

export interface ProjectPlanBuild {
  placements:
    readonly ProjectPlanPlacement[];

  allowPartial?: boolean;
}

/*
 * El parser acepta cuatro formatos externos:
 *
 * 1. Legacy:
 *
 *    collection: {...}
 *
 * 2. Multi-material explícito:
 *
 *    collections: [{...}, {...}]
 *
 * 3. Estrategia común derivada:
 *
 *    collectionStrategy: {
 *      search: {...}
 *    }
 *
 * 4. Estrategia derivada por material:
 *
 *    collectionStrategies: {
 *      "minecraft:oak_log": {
 *        search: {...}
 *      },
 *      "minecraft:cobblestone": {
 *        search: {...}
 *      }
 *    }
 *
 * Todos se normalizan internamente a
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
