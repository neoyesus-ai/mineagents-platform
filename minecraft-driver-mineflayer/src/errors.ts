export type MineflayerDriverErrorCode =
  | "INVALID_CONFIG"
  | "CONNECTION_FAILED"
  | "NOT_CONNECTED"
  | "DIMENSION_MISMATCH"
  | "CHUNK_NOT_LOADED"
  | "UNSUPPORTED_OPERATION";

export class MineflayerDriverError extends Error {
  readonly code: MineflayerDriverErrorCode;

  constructor(code: MineflayerDriverErrorCode, message: string) {
    super(message);
    this.name = "MineflayerDriverError";
    this.code = code;
  }
}
