export interface MemoryRecord<T = unknown> { readonly namespace: string; readonly key: string; readonly value: T; readonly recordedAt: Date; }
export interface MemoryStore { get<T>(namespace: string, key: string): Promise<MemoryRecord<T> | undefined>; set<T>(record: MemoryRecord<T>): Promise<void>; }
