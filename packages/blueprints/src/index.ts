export interface BlockPosition { readonly x: number; readonly y: number; readonly z: number; }
export interface BlueprintBlock { readonly blockType: string; readonly position: BlockPosition; }
export interface Blueprint { readonly id: string; readonly name: string; readonly blocks: readonly BlueprintBlock[]; }
