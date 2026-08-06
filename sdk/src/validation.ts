import { ContractValidationError } from "./errors.js";

export const asObject = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractValidationError("Value must be a JSON object.");
  }

  return value as Record<string, unknown>;
};

export const assertKnownKeys = (
  input: Record<string, unknown>,
  allowedKeys: readonly string[],
): void => {
  for (const key of Object.keys(input)) {
    if (!allowedKeys.includes(key)) {
      throw new ContractValidationError(`Unknown field '${key}'.`);
    }
  }
};

export const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ContractValidationError(`Field '${field}' must be a non-empty string.`);
  }

  return value.trim();
};

export const optionalText = (
  value: unknown,
  field: string,
): string | null | undefined => {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== "string") {
    throw new ContractValidationError(`Field '${field}' must be a string or null.`);
  }

  return value.trim();
};

export const optionalId = (
  value: unknown,
  field: string,
): string | null | undefined => {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ContractValidationError(
      `Field '${field}' must be a non-empty string or null.`,
    );
  }

  return value.trim();
};
