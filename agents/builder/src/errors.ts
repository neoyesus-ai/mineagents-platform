import type { BuilderRunResult } from "./contracts.js";

export type BuilderErrorCode =
  | "INVALID_REQUEST"
  | "TASK_AUTHORIZATION_MISMATCH"
  | "AUTHORIZATION_SCOPE_MISMATCH"
  | "ADAPTER_OPERATION_FAILED";

export class BuilderError extends Error {
  readonly code: BuilderErrorCode;

  constructor(code: BuilderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BuilderError";
    this.code = code;
  }
}

export class BuilderExecutionError extends BuilderError {
  readonly result: BuilderRunResult;

  constructor(message: string, result: BuilderRunResult, cause: unknown) {
    super("ADAPTER_OPERATION_FAILED", message, { cause });
    this.name = "BuilderExecutionError";
    this.result = result;
  }
}
