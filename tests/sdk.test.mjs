import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractValidationError,
  canTransitionTaskStatus,
  isAgentStatus,
  isTaskKind,
  isTaskStatus,
  isTerminalTaskStatus,
  parseHeartbeatInput,
  parseTaskCreateInput,
  parseTaskPatchInput,
} from "../sdk/dist/index.js";

test(
  "SDK status guards expose the supported public values",
  () => {
    assert.equal(
      isAgentStatus("online"),
      true,
    );

    assert.equal(
      isAgentStatus("busy"),
      false,
    );

    assert.equal(
      isTaskStatus("running"),
      true,
    );

    assert.equal(
      isTaskStatus("queued"),
      false,
    );

    assert.equal(
      isTaskKind(
        "collect-blocks",
      ),
      true,
    );

    assert.equal(
      isTaskKind(
        "build-blueprint",
      ),
      true,
    );

    assert.equal(
      isTaskKind(
        "unknown-task",
      ),
      false,
    );

    assert.equal(
      isTerminalTaskStatus(
        "completed",
      ),
      true,
    );

    assert.equal(
      isTerminalTaskStatus(
        "running",
      ),
      false,
    );
  },
);

test(
  "SDK parsers normalize valid agent and task inputs",
  () => {
    assert.deepEqual(
      parseHeartbeatInput({
        name:
          " collector-01 ",

        role:
          " collector ",
      }),

      {
        id:
          undefined,

        name:
          "collector-01",

        role:
          "collector",
      },
    );

    assert.deepEqual(
      parseTaskCreateInput({
        title:
          " Gather wood ",

        projectId:
          null,
      }),

      {
        title:
          "Gather wood",

        description:
          undefined,

        projectId:
          null,

        kind:
          "manual",

        requiredRole:
          null,

        payload:
          {},

        dependsOnTaskIds:
          [],
      },
    );

    assert.deepEqual(
      parseTaskCreateInput({
        title:
          " Gather oak ",

        kind:
          "collect-blocks",

        requiredRole:
          " collector ",

        payload: {
          blockName:
            "minecraft:oak_log",

          quantity:
            4,
        },
      }),

      {
        title:
          "Gather oak",

        description:
          undefined,

        projectId:
          undefined,

        kind:
          "collect-blocks",

        requiredRole:
          "collector",

        payload: {
          blockName:
            "minecraft:oak_log",

          quantity:
            4,
        },

        dependsOnTaskIds:
          [],
      },
    );

    assert.deepEqual(
      parseTaskCreateInput({
        title:
          " Build shelter ",

        kind:
          "build-blueprint",

        requiredRole:
          " builder ",

        payload: {
          blueprintId:
            "starter-shelter",
        },

        dependsOnTaskIds: [
          " task-collect-wood ",
          "task-collect-stone",
        ],
      }),

      {
        title:
          "Build shelter",

        description:
          undefined,

        projectId:
          undefined,

        kind:
          "build-blueprint",

        requiredRole:
          "builder",

        payload: {
          blueprintId:
            "starter-shelter",
        },

        dependsOnTaskIds: [
          "task-collect-wood",
          "task-collect-stone",
        ],
      },
    );

    assert.deepEqual(
      parseTaskPatchInput({
        status:
          "running",

        description:
          null,
      }),

      {
        title:
          undefined,

        description:
          null,

        projectId:
          undefined,

        assignedAgentId:
          undefined,

        failureReason:
          undefined,

        status:
          "running",
      },
    );
  },
);

test(
  "SDK parsers reject malformed or ambiguous task updates",
  () => {
    assert.throws(
      () =>
        parseTaskPatchInput({
          title:
            42,
        }),

      (error) =>
        error instanceof
          ContractValidationError &&
        error.message ===
          "Field 'title' must be a non-empty string.",
    );

    assert.throws(
      () =>
        parseTaskPatchInput(
          {},
        ),

      (error) =>
        error instanceof
          ContractValidationError,
    );

    assert.throws(
      () =>
        parseTaskCreateInput({
          title:
            "Valid",

          unexpected:
            true,
        }),

      (error) =>
        error instanceof
          ContractValidationError,
    );

    assert.throws(
      () =>
        parseTaskCreateInput({
          title:
            "Collect wood",

          kind:
            "collect-blocks",
        }),

      (error) =>
        error instanceof
          ContractValidationError,
    );

    assert.throws(
      () =>
        parseTaskCreateInput({
          title:
            "Invalid kind",

          kind:
            "dance",
        }),

      (error) =>
        error instanceof
          ContractValidationError,
    );

    assert.throws(
      () =>
        parseTaskCreateInput({
          title:
            "Invalid dependencies",

          dependsOnTaskIds:
            "task-1",
        }),

      (error) =>
        error instanceof
          ContractValidationError,
    );

    assert.throws(
      () =>
        parseTaskCreateInput({
          title:
            "Empty dependency",

          dependsOnTaskIds: [
            "",
          ],
        }),

      (error) =>
        error instanceof
          ContractValidationError,
    );

    assert.throws(
      () =>
        parseTaskCreateInput({
          title:
            "Duplicate dependencies",

          dependsOnTaskIds: [
            "task-1",
            "task-1",
          ],
        }),

      (error) =>
        error instanceof
          ContractValidationError,
    );
  },
);

test(
  "SDK task transitions protect the persistent lifecycle",
  () => {
    assert.equal(
      canTransitionTaskStatus(
        "pending",
        "assigned",
      ),
      true,
    );

    assert.equal(
      canTransitionTaskStatus(
        "assigned",
        "running",
      ),
      true,
    );

    assert.equal(
      canTransitionTaskStatus(
        "running",
        "completed",
      ),
      true,
    );

    assert.equal(
      canTransitionTaskStatus(
        "completed",
        "running",
      ),
      false,
    );

    assert.equal(
      canTransitionTaskStatus(
        "failed",
        "pending",
      ),
      false,
    );

    assert.equal(
      canTransitionTaskStatus(
        "cancelled",
        "cancelled",
      ),
      true,
    );
  },
);