import type { CollectorRunResult } from "./contracts.js";

export type CollectorErrorCode =
  | "INVALID_REQUEST"
  | "TASK_AUTHORIZATION_MISMATCH"
  | "AUTHORIZATION_SCOPE_MISMATCH"
  | "ADAPTER_OPERATION_FAILED";

export class CollectorError extends Error {
  readonly code: CollectorErrorCode;

  constructor(code: CollectorErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CollectorError";
    this.code = code;
  }
}

export class CollectorExecutionError extends CollectorError {
  readonly result: CollectorRunResult;

  constructor(message: string, result: CollectorRunResult, cause: unknown) {
    super("ADAPTER_OPERATION_FAILED", message, { cause });
    this.name = "CollectorExecutionError";
    this.result = result;
  }
}
