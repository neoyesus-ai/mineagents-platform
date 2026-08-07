export type MineflayerDriverErrorCode =
  | "INVALID_CONFIG"
  | "CONNECTION_FAILED"
  | "NOT_CONNECTED"
  | "DIMENSION_MISMATCH"
  | "CHUNK_NOT_LOADED"
  | "INVALID_MOVEMENT_SCOPE"
  | "OUTSIDE_ALLOWED_REGION"
  | "MOVEMENT_IN_PROGRESS"
  | "MOVEMENT_FAILED"
  | "OPERATION_IN_PROGRESS"
  | "INVALID_WRITE_REQUEST"
  | "BLOCK_PRECONDITION_FAILED"
  | "ITEM_NOT_AVAILABLE"
  | "BLOCK_NOT_REACHABLE"
  | "WRITE_FAILED"
  | "WRITE_VERIFICATION_FAILED"
  | "UNSUPPORTED_OPERATION";

export class MineflayerDriverError extends Error {
  readonly code: MineflayerDriverErrorCode;

  constructor(code: MineflayerDriverErrorCode, message: string) {
    super(message);
    this.name = "MineflayerDriverError";
    this.code = code;
  }
}
