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

/*
 * Estrategia para proyectos cuyos materiales
 * se derivan automáticamente de
 * build.placements.
 *
 * Como no conocemos posiciones explícitas
 * de recursos por material, la derivación
 * automática utiliza búsqueda autónoma.
 */
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
 * El parser acepta tres formatos externos:
 *
 * Legacy:
 *
 *   collection: {...}
 *
 * Multi-material explícito:
 *
 *   collections: [{...}, {...}]
 *
 * Derivación automática:
 *
 *   collectionStrategy: {
 *     search: {...}
 *   }
 *
 * Los tres formatos se normalizan
 * internamente a collections[].
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
