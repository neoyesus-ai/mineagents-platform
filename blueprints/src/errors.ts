export type BlueprintErrorCode =
  | "INVALID_LIMITS"
  | "INVALID_FORMAT"
  | "UNSUPPORTED_VERSION"
  | "LIMIT_EXCEEDED"
  | "INVALID_REFERENCE"
  | "DUPLICATE_POSITION"
  | "INVALID_ORIGIN"
  | "COORDINATE_OVERFLOW";

export class BlueprintError extends Error {
  readonly code: BlueprintErrorCode;
  readonly path?: string;

  constructor(code: BlueprintErrorCode, message: string, path?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BlueprintError";
    this.code = code;
    this.path = path;
  }
}
