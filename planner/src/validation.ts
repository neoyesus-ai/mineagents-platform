import type {
  ProjectPlanBuild,
  ProjectPlanCandidate,
  ProjectPlanCollection,
  ProjectPlanInput,
  ProjectPlanPlacement,
  ProjectPlanSearch,
} from "./contracts.js";

export class PlannerValidationError extends Error {
  constructor(
    message: string,
  ) {
    super(
      message,
    );

    this.name =
      "PlannerValidationError";
  }
}

type JsonRecord =
  Record<string, unknown>;

const blockNamePattern =
  /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

const dimensionPattern =
  /^minecraft:[a-z0-9_./-]+$/;

const maxCollections =
  64;

const asRecord = (
  value: unknown,
  label: string,
): JsonRecord => {
  if (
    value === null ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new PlannerValidationError(
      `${label} must be an object.`,
    );
  }

  return value as JsonRecord;
};

const assertKnownKeys = (
  input: JsonRecord,
  allowed:
    readonly string[],
  label: string,
): void => {
  for (
    const key
    of Object.keys(
      input,
    )
  ) {
    if (
      !allowed.includes(
        key,
      )
    ) {
      throw new PlannerValidationError(
        `Unknown field '${label}.${key}'.`,
      );
    }
  }
};

const requiredString = (
  value: unknown,
  label: string,
): string => {
  if (
    typeof value !==
      "string" ||
    value.trim().length ===
      0
  ) {
    throw new PlannerValidationError(
      `${label} must be a non-empty string.`,
    );
  }

  return value.trim();
};

const optionalText = (
  value: unknown,
  label: string,
): string | null | undefined => {
  if (
    value === undefined ||
    value === null
  ) {
    return value;
  }

  if (
    typeof value !==
      "string"
  ) {
    throw new PlannerValidationError(
      `${label} must be a string or null.`,
    );
  }

  return value.trim();
};

const positiveInteger = (
  value: unknown,
  label: string,
  max: number,
): number => {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    (value as number) <
      1 ||
    (value as number) >
      max
  ) {
    throw new PlannerValidationError(
      `${label} must be an integer between 1 and ${max}.`,
    );
  }

  return value as number;
};

const booleanOrUndefined = (
  value: unknown,
  label: string,
): boolean | undefined => {
  if (
    value === undefined
  ) {
    return undefined;
  }

  if (
    typeof value !==
      "boolean"
  ) {
    throw new PlannerValidationError(
      `${label} must be a boolean.`,
    );
  }

  return value;
};

const parseDimension = (
  value: unknown,
  label: string,
): string => {
  if (
    typeof value !==
      "string" ||
    !dimensionPattern.test(
      value,
    )
  ) {
    throw new PlannerValidationError(
      `${label} must be a namespaced Minecraft dimension.`,
    );
  }

  return value;
};

const parsePosition = (
  value: unknown,
  label: string,
): ProjectPlanCandidate => {
  const input =
    asRecord(
      value,
      label,
    );

  assertKnownKeys(
    input,
    [
      "dimension",
      "x",
      "y",
      "z",
    ],
    label,
  );

  const dimension =
    parseDimension(
      input.dimension,
      `${label}.dimension`,
    );

  for (
    const coordinate
    of [
      "x",
      "y",
      "z",
    ] as const
  ) {
    if (
      !Number.isSafeInteger(
        input[
          coordinate
        ],
      )
    ) {
      throw new PlannerValidationError(
        `${label}.${coordinate} must be a safe integer.`,
      );
    }
  }

  return {
    dimension,

    x:
      input.x as number,

    y:
      input.y as number,

    z:
      input.z as number,
  };
};

const parseSearch = (
  value: unknown,
  quantity: number,
  label: string,
): ProjectPlanSearch => {
  const input =
    asRecord(
      value,
      label,
    );

  assertKnownKeys(
    input,
    [
      "dimension",
      "maxDistance",
      "maxCandidates",
    ],
    label,
  );

  const dimension =
    parseDimension(
      input.dimension,
      `${label}.dimension`,
    );

  const maxDistance =
    positiveInteger(
      input.maxDistance,
      `${label}.maxDistance`,
      128,
    );

  const maxCandidates =
    positiveInteger(
      input.maxCandidates,
      `${label}.maxCandidates`,
      256,
    );

  if (
    maxCandidates <
    quantity
  ) {
    throw new PlannerValidationError(
      `${label}.maxCandidates must be at least the collection quantity.`,
    );
  }

  return {
    dimension,
    maxDistance,
    maxCandidates,
  };
};

const parseCollection = (
  value: unknown,
  label: string,
): ProjectPlanCollection => {
  const input =
    asRecord(
      value,
      label,
    );

  assertKnownKeys(
    input,
    [
      "blockName",
      "quantity",
      "candidates",
      "search",
      "allowPartial",
    ],
    label,
  );

  const blockName =
    requiredString(
      input.blockName,
      `${label}.blockName`,
    );

  if (
    !blockNamePattern.test(
      blockName,
    )
  ) {
    throw new PlannerValidationError(
      `${label}.blockName must be a namespaced Minecraft identifier.`,
    );
  }

  const quantity =
    positiveInteger(
      input.quantity,
      `${label}.quantity`,
      256,
    );

  const hasCandidates =
    input.candidates !==
    undefined;

  const hasSearch =
    input.search !==
    undefined;

  if (
    hasCandidates ===
    hasSearch
  ) {
    throw new PlannerValidationError(
      `${label} must provide exactly one of 'candidates' or 'search'.`,
    );
  }

  if (
    hasCandidates
  ) {
    if (
      !Array.isArray(
        input.candidates,
      ) ||
      input.candidates
        .length ===
        0
    ) {
      throw new PlannerValidationError(
        `${label}.candidates must contain at least one position.`,
      );
    }

    if (
      input.candidates
        .length >
      256
    ) {
      throw new PlannerValidationError(
        `${label}.candidates exceeds the maximum of 256 positions.`,
      );
    }

    return {
      blockName,
      quantity,

      candidates:
        input.candidates.map(
          (
            candidate,
            index,
          ) =>
            parsePosition(
              candidate,
              `${label}.candidates[${index}]`,
            ),
        ),

      allowPartial:
        booleanOrUndefined(
          input.allowPartial,
          `${label}.allowPartial`,
        ),
    };
  }

  return {
    blockName,
    quantity,

    search:
      parseSearch(
        input.search,
        quantity,
        `${label}.search`,
      ),

    allowPartial:
      booleanOrUndefined(
        input.allowPartial,
        `${label}.allowPartial`,
      ),
  };
};

const parseCollections = (
  input: JsonRecord,
): readonly ProjectPlanCollection[] => {
  const hasLegacyCollection =
    input.collection !==
    undefined;

  const hasCollections =
    input.collections !==
    undefined;

  if (
    hasLegacyCollection ===
    hasCollections
  ) {
    throw new PlannerValidationError(
      "Project must provide exactly one of 'collection' or 'collections'.",
    );
  }

  if (
    hasLegacyCollection
  ) {
    return [
      parseCollection(
        input.collection,
        "collection",
      ),
    ];
  }

  if (
    !Array.isArray(
      input.collections,
    ) ||
    input.collections
      .length ===
      0
  ) {
    throw new PlannerValidationError(
      "collections must contain at least one collection.",
    );
  }

  if (
    input.collections
      .length >
    maxCollections
  ) {
    throw new PlannerValidationError(
      `collections exceeds the maximum of ${maxCollections} collections.`,
    );
  }

  const collections =
    input.collections.map(
      (
        collection,
        index,
      ) =>
        parseCollection(
          collection,
          `collections[${index}]`,
        ),
    );

  const seenBlocks =
    new Set<string>();

  for (
    const collection
    of collections
  ) {
    if (
      seenBlocks.has(
        collection.blockName,
      )
    ) {
      throw new PlannerValidationError(
        `collections must not contain duplicate blockName '${collection.blockName}'.`,
      );
    }

    seenBlocks.add(
      collection.blockName,
    );
  }

  return collections;
};

const parsePlacement = (
  value: unknown,
  index: number,
): ProjectPlanPlacement => {
  const label =
    `build.placements[${index}]`;

  const input =
    asRecord(
      value,
      label,
    );

  assertKnownKeys(
    input,
    [
      "position",
      "blockName",
    ],
    label,
  );

  const blockName =
    requiredString(
      input.blockName,
      `${label}.blockName`,
    );

  if (
    !blockNamePattern.test(
      blockName,
    )
  ) {
    throw new PlannerValidationError(
      `${label}.blockName must be a namespaced Minecraft identifier.`,
    );
  }

  return {
    position:
      parsePosition(
        input.position,
        `${label}.position`,
      ),

    blockName,
  };
};

const parseBuild = (
  value: unknown,
): ProjectPlanBuild => {
  const input =
    asRecord(
      value,
      "build",
    );

  assertKnownKeys(
    input,
    [
      "placements",
      "allowPartial",
    ],
    "build",
  );

  if (
    !Array.isArray(
      input.placements,
    ) ||
    input.placements
      .length ===
      0
  ) {
    throw new PlannerValidationError(
      "build.placements must contain at least one placement.",
    );
  }

  if (
    input.placements
      .length >
    1024
  ) {
    throw new PlannerValidationError(
      "build.placements exceeds the maximum of 1024 placements.",
    );
  }

  return {
    placements:
      input.placements.map(
        parsePlacement,
      ),

    allowPartial:
      booleanOrUndefined(
        input.allowPartial,
        "build.allowPartial",
      ),
  };
};

const validateMaterialRequirements = (
  collections:
    readonly ProjectPlanCollection[],

  build:
    ProjectPlanBuild,
): void => {
  const availableByBlock =
    new Map<
      string,
      number
    >();

  for (
    const collection
    of collections
  ) {
    availableByBlock.set(
      collection.blockName,
      collection.quantity,
    );
  }

  const requiredByBlock =
    new Map<
      string,
      number
    >();

  for (
    const placement
    of build.placements
  ) {
    requiredByBlock.set(
      placement.blockName,
      (
        requiredByBlock.get(
          placement.blockName,
        ) ??
        0
      ) +
        1,
    );
  }

  for (
    const [
      blockName,
      requiredQuantity,
    ]
    of requiredByBlock
  ) {
    const availableQuantity =
      availableByBlock.get(
        blockName,
      ) ??
      0;

    if (
      availableQuantity ===
      0
    ) {
      throw new PlannerValidationError(
        `Project build requires ${requiredQuantity} ${blockName}, but no collection provides that material.`,
      );
    }

    if (
      availableQuantity <
      requiredQuantity
    ) {
      throw new PlannerValidationError(
        `Project build requires ${requiredQuantity} ${blockName}, but collections provide only ${availableQuantity}.`,
      );
    }
  }
};

export const parseProjectPlanInput = (
  value: unknown,
): ProjectPlanInput => {
  const input =
    asRecord(
      value,
      "project plan",
    );

  assertKnownKeys(
    input,
    [
      "name",
      "description",
      "collection",
      "collections",
      "build",
    ],
    "project",
  );

  const collections =
    parseCollections(
      input,
    );

  const build =
    parseBuild(
      input.build,
    );

  validateMaterialRequirements(
    collections,
    build,
  );

  return {
    name:
      requiredString(
        input.name,
        "name",
      ),

    description:
      optionalText(
        input.description,
        "description",
      ),

    collections,

    build,
  };
};
