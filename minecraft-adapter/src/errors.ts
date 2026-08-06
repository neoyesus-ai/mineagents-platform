export type MinecraftSafetyErrorCode =
  | "INVALID_POLICY"
  | "INVALID_REQUEST"
  | "OUTSIDE_ALLOWED_REGION"
  | "MOVEMENT_DISABLED"
  | "ACTION_NOT_ALLOWED"
  | "BLOCK_NOT_ALLOWED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_SCOPE_MISMATCH"
  | "APPROVAL_LIMIT_EXCEEDED"
  | "APPROVAL_REJECTED";

export class MinecraftSafetyError extends Error {
  readonly code: MinecraftSafetyErrorCode;

  constructor(code: MinecraftSafetyErrorCode, message: string) {
    super(message);
    this.name = "MinecraftSafetyError";
    this.code = code;
  }
}
