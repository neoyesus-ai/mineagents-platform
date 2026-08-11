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

export interface ProjectPlanCollection {
  blockName: string;
  quantity: number;
  candidates: readonly ProjectPlanCandidate[];
  allowPartial?: boolean;
}

export interface ProjectPlanBuild {
  placements: readonly ProjectPlanPlacement[];
  allowPartial?: boolean;
}

export interface ProjectPlanInput {
  name: string;
  description?: string | null;
  collection: ProjectPlanCollection;
  build: ProjectPlanBuild;
}

export interface PlannedTask {
  key: string;
  task: TaskCreateInput;
  dependsOnKeys: readonly string[];
}

export interface ProjectPlan {
  project: {
    name: string;
    description?: string | null;
  };

  tasks: readonly PlannedTask[];
}