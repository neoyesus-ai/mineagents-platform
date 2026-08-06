import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ContractValidationError,
  canTransitionTaskStatus,
  isAgentStatus,
  isTaskStatus,
  isTerminalTaskStatus,
  parseHeartbeatInput,
  parseTaskCreateInput,
  parseTaskPatchInput,
} from "../sdk/dist/index.js";

test("SDK status guards expose the supported public values", () => {
  assert.equal(isAgentStatus("online"), true);
  assert.equal(isAgentStatus("busy"), false);
  assert.equal(isTaskStatus("running"), true);
  assert.equal(isTaskStatus("queued"), false);
  assert.equal(isTerminalTaskStatus("completed"), true);
  assert.equal(isTerminalTaskStatus("running"), false);
});

test("SDK parsers normalize valid agent and task inputs", () => {
  assert.deepEqual(parseHeartbeatInput({ name: " collector-01 ", role: " collector " }), {
    id: undefined,
    name: "collector-01",
    role: "collector",
  });

  assert.deepEqual(parseTaskCreateInput({ title: " Gather wood ", projectId: null }), {
    title: "Gather wood",
    description: undefined,
    projectId: null,
  });

  assert.deepEqual(parseTaskPatchInput({ status: "running", description: null }), {
    title: undefined,
    description: null,
    projectId: undefined,
    assignedAgentId: undefined,
    failureReason: undefined,
    status: "running",
  });
});

test("SDK parsers reject malformed or ambiguous task updates", () => {
  assert.throws(
    () => parseTaskPatchInput({ title: 42 }),
    (error) =>
      error instanceof ContractValidationError &&
      error.message === "Field 'title' must be a non-empty string.",
  );
  assert.throws(
    () => parseTaskPatchInput({}),
    (error) => error instanceof ContractValidationError,
  );
  assert.throws(
    () => parseTaskCreateInput({ title: "Valid", unexpected: true }),
    (error) => error instanceof ContractValidationError,
  );
});

test("SDK task transitions protect the persistent lifecycle", () => {
  assert.equal(canTransitionTaskStatus("pending", "assigned"), true);
  assert.equal(canTransitionTaskStatus("assigned", "running"), true);
  assert.equal(canTransitionTaskStatus("running", "completed"), true);
  assert.equal(canTransitionTaskStatus("completed", "running"), false);
  assert.equal(canTransitionTaskStatus("failed", "pending"), false);
  assert.equal(canTransitionTaskStatus("cancelled", "cancelled"), true);
});
