import { asObject, assertKnownKeys, optionalText, requiredString } from "./validation.js";

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  description?: string | null;
}

export const parseProjectInput = (value: unknown): ProjectInput => {
  const input = asObject(value);
  assertKnownKeys(input, ["name", "description"]);

  return {
    name: requiredString(input.name, "name"),
    description: optionalText(input.description, "description"),
  };
};
