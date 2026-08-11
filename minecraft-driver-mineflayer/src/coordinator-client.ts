import type {
  AgentRecord,
  TaskRecord,
  TaskStatus,
} from "@mineagents/sdk";

import {
  isAgentStatus,
  isTaskKind,
  isTaskStatus,
} from "@mineagents/sdk";

import {
  MineflayerDriverError,
} from "./errors.js";

type JsonRecord =
  Record<string, unknown>;

export interface CoordinatorWorkerClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

const asRecord = (
  value: unknown,
  label: string,
): JsonRecord => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new MineflayerDriverError(
      "CONNECTION_FAILED",
      `Coordinator returned an invalid ${label}.`,
    );
  }

  return value as JsonRecord;
};

const requiredString = (
  record: JsonRecord,
  key: string,
  label: string,
): string => {
  const value =
    record[key];

  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new MineflayerDriverError(
      "CONNECTION_FAILED",
      `Coordinator returned an invalid ${label}.${key}.`,
    );
  }

  return value;
};

const nullableString = (
  record: JsonRecord,
  key: string,
  label: string,
): string | null => {
  const value =
    record[key];

  if (
    value === null
  ) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    throw new MineflayerDriverError(
      "CONNECTION_FAILED",
      `Coordinator returned an invalid ${label}.${key}.`,
    );
  }

  return value;
};

const stringArray = (
  record: JsonRecord,
  key: string,
  label: string,
): readonly string[] => {
  const value =
    record[key];

  if (
    !Array.isArray(value)
  ) {
    throw new MineflayerDriverError(
      "CONNECTION_FAILED",
      `Coordinator returned an invalid ${label}.${key}.`,
    );
  }

  return value.map(
    (
      item,
      index,
    ) => {
      if (
        typeof item !== "string" ||
        item.trim().length === 0
      ) {
        throw new MineflayerDriverError(
          "CONNECTION_FAILED",
          `Coordinator returned an invalid ${label}.${key}[${index}].`,
        );
      }

      return item;
    },
  );
};

const parseAgent = (
  value: unknown,
): AgentRecord => {
  const record =
    asRecord(
      value,
      "agent",
    );

  if (
    !isAgentStatus(
      record.status,
    )
  ) {
    throw new MineflayerDriverError(
      "CONNECTION_FAILED",
      "Coordinator returned an invalid agent.status.",
    );
  }

  return {
    id:
      requiredString(
        record,
        "id",
        "agent",
      ),

    name:
      requiredString(
        record,
        "name",
        "agent",
      ),

    role:
      nullableString(
        record,
        "role",
        "agent",
      ),

    status:
      record.status,

    lastHeartbeatAt:
      requiredString(
        record,
        "lastHeartbeatAt",
        "agent",
      ),

    createdAt:
      requiredString(
        record,
        "createdAt",
        "agent",
      ),

    updatedAt:
      requiredString(
        record,
        "updatedAt",
        "agent",
      ),
  };
};

const parseTask = (
  value: unknown,
): TaskRecord => {
  const task =
    asRecord(
      value,
      "task",
    );

  if (
    !isTaskStatus(
      task.status,
    )
  ) {
    throw new MineflayerDriverError(
      "CONNECTION_FAILED",
      "Coordinator returned an invalid task.status.",
    );
  }

  if (
    !isTaskKind(
      task.kind,
    )
  ) {
    throw new MineflayerDriverError(
      "CONNECTION_FAILED",
      "Coordinator returned an invalid task.kind.",
    );
  }

  if (
    task.payload === null ||
    typeof task.payload !==
      "object" ||
    Array.isArray(
      task.payload,
    )
  ) {
    throw new MineflayerDriverError(
      "CONNECTION_FAILED",
      "Coordinator returned an invalid task.payload.",
    );
  }

  return {
    id:
      requiredString(
        task,
        "id",
        "task",
      ),

    projectId:
      nullableString(
        task,
        "projectId",
        "task",
      ),

    title:
      requiredString(
        task,
        "title",
        "task",
      ),

    description:
      nullableString(
        task,
        "description",
        "task",
      ),

    kind:
      task.kind,

    requiredRole:
      nullableString(
        task,
        "requiredRole",
        "task",
      ),

    payload:
      task.payload as Record<
        string,
        unknown
      >,

    dependsOnTaskIds:
      stringArray(
        task,
        "dependsOnTaskIds",
        "task",
      ),

    status:
      task.status,

    assignedAgentId:
      nullableString(
        task,
        "assignedAgentId",
        "task",
      ),

    failureReason:
      nullableString(
        task,
        "failureReason",
        "task",
      ),

    createdAt:
      requiredString(
        task,
        "createdAt",
        "task",
      ),

    updatedAt:
      requiredString(
        task,
        "updatedAt",
        "task",
      ),

    startedAt:
      nullableString(
        task,
        "startedAt",
        "task",
      ),

    completedAt:
      nullableString(
        task,
        "completedAt",
        "task",
      ),

    failedAt:
      nullableString(
        task,
        "failedAt",
        "task",
      ),

    cancelledAt:
      nullableString(
        task,
        "cancelledAt",
        "task",
      ),
  };
};

export class CoordinatorWorkerClient {
  private readonly baseUrl:
    string;

  private readonly timeoutMs:
    number;

  private readonly fetchImplementation:
    typeof globalThis.fetch;

  constructor(
    options:
      CoordinatorWorkerClientOptions,
  ) {
    this.baseUrl =
      options.baseUrl.replace(
        /\/+$/,
        "",
      );

    this.timeoutMs =
      options.timeoutMs ??
      5_000;

    this.fetchImplementation =
      options.fetch ??
      globalThis.fetch;
  }

  async heartbeat(
    input: {
      id: string;
      name: string;
      role: string;
    },
  ): Promise<AgentRecord> {
    const response =
      asRecord(
        await this.request(
          "/agents/heartbeat",
          {
            method:
              "POST",

            body:
              JSON.stringify(
                input,
              ),
          },
        ),

        "heartbeat response",
      );

    return parseAgent(
      response.agent,
    );
  }

  async claimTask(
    agentId: string,
  ): Promise<
    TaskRecord | null
  > {
    let response:
      Response;

    try {
      response =
        await this.fetchImplementation(
          `${this.baseUrl}/tasks/claim`,
          {
            method:
              "POST",

            headers: {
              accept:
                "application/json",

              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                agentId,
              }),

            signal:
              AbortSignal.timeout(
                this.timeoutMs,
              ),
          },
        );
    } catch (error) {
      throw new MineflayerDriverError(
        "CONNECTION_FAILED",
        `Coordinator task claim failed: ${
          error instanceof Error
            ? error.message
            : "unknown error"
        }.`,
      );
    }

    if (
      response.status ===
      404
    ) {
      return null;
    }

    if (
      !response.ok
    ) {
      throw new MineflayerDriverError(
        "CONNECTION_FAILED",
        `Coordinator task claim failed with HTTP ${response.status}.`,
      );
    }

    const body =
      asRecord(
        await response.json(),
        "task claim response",
      );

    return parseTask(
      body.task,
    );
  }

  async patchTask(
    taskId: string,
    input: {
      status?: TaskStatus;
      failureReason?:
        string | null;
    },
  ): Promise<TaskRecord> {
    const response =
      asRecord(
        await this.request(
          `/tasks/${encodeURIComponent(
            taskId,
          )}`,
          {
            method:
              "PATCH",

            body:
              JSON.stringify(
                input,
              ),
          },
        ),

        "task patch response",
      );

    return parseTask(
      response.task,
    );
  }

  private async request(
    path: string,
    init: RequestInit,
  ): Promise<unknown> {
    let response:
      Response;

    try {
      response =
        await this.fetchImplementation(
          `${this.baseUrl}${path}`,
          {
            ...init,

            headers: {
              accept:
                "application/json",

              "content-type":
                "application/json",
            },

            signal:
              AbortSignal.timeout(
                this.timeoutMs,
              ),
          },
        );
    } catch (error) {
      throw new MineflayerDriverError(
        "CONNECTION_FAILED",
        `Coordinator request '${path}' failed: ${
          error instanceof Error
            ? error.message
            : "unknown error"
        }.`,
      );
    }

    if (
      !response.ok
    ) {
      throw new MineflayerDriverError(
        "CONNECTION_FAILED",
        `Coordinator request '${path}' failed with HTTP ${response.status}.`,
      );
    }

    return await response.json();
  }
}