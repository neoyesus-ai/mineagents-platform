import type {
  BlueprintBlock,
  BlueprintCoordinate,
  BlueprintLimits,
  BlueprintSize,
  BlueprintV1,
} from "./types.js";
import { BlueprintError } from "./errors.js";

export const defaultBlueprintLimits: BlueprintLimits = {
  maxBlocks: 256,
  maxPaletteEntries: 64,
  maxSizeAxis: 64,
};

const blueprintIdPattern = /^[a-z0-9][a-z0-9._/-]{0,63}$/;
const materialKeyPattern = /^[a-z][a-z0-9_-]{0,31}$/;
const blockNamePattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const emptyBlockNames = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
]);

type UnknownRecord = Record<string, unknown>;

const asStrictRecord = (
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
): UnknownRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BlueprintError("INVALID_FORMAT", `${path} must be an object.`, path);
  }

  const record = value as UnknownRecord;
  const unknownKey = Object.keys(record).find((key) => !allowedKeys.includes(key));
  if (unknownKey) {
    throw new BlueprintError(
      "INVALID_FORMAT",
      `${path} contains unsupported field ${unknownKey}.`,
      `${path}.${unknownKey}`,
    );
  }
  return record;
};

const positiveSafeInteger = (value: unknown, path: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new BlueprintError("INVALID_FORMAT", `${path} must be a positive safe integer.`, path);
  }
  return value as number;
};

const assertLimits = (limits: BlueprintLimits): void => {
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new BlueprintError(
        "INVALID_LIMITS",
        `Blueprint limit ${key} must be a positive safe integer.`,
      );
    }
  }
};

const parseSize = (value: unknown, limits: BlueprintLimits): BlueprintSize => {
  const size = asStrictRecord(value, "size", ["width", "height", "depth"]);
  const parsed = {
    width: positiveSafeInteger(size.width, "size.width"),
    height: positiveSafeInteger(size.height, "size.height"),
    depth: positiveSafeInteger(size.depth, "size.depth"),
  };

  if (Object.values(parsed).some((axis) => axis > limits.maxSizeAxis)) {
    throw new BlueprintError(
      "LIMIT_EXCEEDED",
      `Blueprint axes cannot exceed ${limits.maxSizeAxis} blocks.`,
      "size",
    );
  }
  return parsed;
};

const parsePalette = (
  value: unknown,
  limits: BlueprintLimits,
): Readonly<Record<string, string>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BlueprintError("INVALID_FORMAT", "palette must be an object.", "palette");
  }
  const palette = value as UnknownRecord;
  const entries = Object.entries(palette);
  if (entries.length === 0 || entries.length > limits.maxPaletteEntries) {
    throw new BlueprintError(
      "LIMIT_EXCEEDED",
      `Blueprint palette must contain between 1 and ${limits.maxPaletteEntries} entries.`,
      "palette",
    );
  }

  const normalized: Record<string, string> = {};
  for (const [material, blockName] of entries) {
    if (!materialKeyPattern.test(material)) {
      throw new BlueprintError(
        "INVALID_FORMAT",
        "Blueprint material keys must be lowercase identifiers.",
        `palette.${material}`,
      );
    }
    if (
      typeof blockName !== "string" ||
      !blockNamePattern.test(blockName) ||
      emptyBlockNames.has(blockName)
    ) {
      throw new BlueprintError(
        "INVALID_FORMAT",
        "Blueprint palette values must be non-air namespaced block identifiers.",
        `palette.${material}`,
      );
    }
    normalized[material] = blockName;
  }
  return normalized;
};

const parseCoordinate = (
  value: unknown,
  size: BlueprintSize,
  path: string,
): BlueprintCoordinate => {
  const coordinate = asStrictRecord(value, path, ["x", "y", "z"]);
  const axes = ["x", "y", "z"] as const;
  const maximums = {
    x: size.width,
    y: size.height,
    z: size.depth,
  };
  const parsed = {} as BlueprintCoordinate;

  for (const axis of axes) {
    const axisPath = `${path}.${axis}`;
    const axisValue = coordinate[axis];
    if (!Number.isSafeInteger(axisValue) || (axisValue as number) < 0) {
      throw new BlueprintError(
        "INVALID_FORMAT",
        `${axisPath} must be a non-negative safe integer.`,
        axisPath,
      );
    }
    if ((axisValue as number) >= maximums[axis]) {
      throw new BlueprintError(
        "INVALID_FORMAT",
        `${axisPath} must be inside the declared blueprint size.`,
        axisPath,
      );
    }
    parsed[axis] = axisValue as number;
  }
  return parsed;
};

const parseBlocks = (
  value: unknown,
  palette: Readonly<Record<string, string>>,
  size: BlueprintSize,
  limits: BlueprintLimits,
): readonly BlueprintBlock[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > limits.maxBlocks) {
    throw new BlueprintError(
      "LIMIT_EXCEEDED",
      `Blueprint blocks must contain between 1 and ${limits.maxBlocks} entries.`,
      "blocks",
    );
  }

  const seen = new Set<string>();
  return value.map((rawBlock, index) => {
    const path = `blocks[${index}]`;
    const block = asStrictRecord(rawBlock, path, ["position", "material"]);
    const position = parseCoordinate(block.position, size, `${path}.position`);
    if (typeof block.material !== "string" || !Object.hasOwn(palette, block.material)) {
      throw new BlueprintError(
        "INVALID_REFERENCE",
        `${path}.material must reference an existing palette entry.`,
        `${path}.material`,
      );
    }

    const positionKey = `${position.x}:${position.y}:${position.z}`;
    if (seen.has(positionKey)) {
      throw new BlueprintError(
        "DUPLICATE_POSITION",
        `${path}.position duplicates another blueprint block.`,
        `${path}.position`,
      );
    }
    seen.add(positionKey);
    return { position, material: block.material };
  });
};

export const parseBlueprint = (
  input: unknown,
  overrides: Partial<BlueprintLimits> = {},
): BlueprintV1 => {
  const limits = { ...defaultBlueprintLimits, ...overrides };
  assertLimits(limits);
  const root = asStrictRecord(input, "blueprint", [
    "schemaVersion",
    "id",
    "size",
    "palette",
    "blocks",
  ]);

  if (root.schemaVersion !== 1) {
    throw new BlueprintError(
      "UNSUPPORTED_VERSION",
      "Only blueprint schemaVersion 1 is supported.",
      "blueprint.schemaVersion",
    );
  }
  if (typeof root.id !== "string" || !blueprintIdPattern.test(root.id)) {
    throw new BlueprintError(
      "INVALID_FORMAT",
      "Blueprint id must be a lowercase identifier of at most 64 characters.",
      "blueprint.id",
    );
  }

  const size = parseSize(root.size, limits);
  const palette = parsePalette(root.palette, limits);
  const blocks = parseBlocks(root.blocks, palette, size, limits);

  return {
    schemaVersion: 1,
    id: root.id,
    size,
    palette,
    blocks,
  };
};
