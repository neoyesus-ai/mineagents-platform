export interface PlanStep { readonly id: string; readonly taskKind: string; readonly dependencies: readonly string[]; }
export interface Plan { readonly id: string; readonly steps: readonly PlanStep[]; }
// Contracts only: no LLM provider is connected.
