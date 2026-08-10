import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  canTransitionTaskStatus,
  isTaskStatus,
  type AgentRecord,
  type HeartbeatInput,
  type ProjectInput,
  type ProjectRecord,
  type TaskCreateInput,
  type TaskPatchInput,
  type TaskRecord,
} from "./domain.js";

import {
  ConflictError,
  NotFoundError,
} from "./errors.js";

type Row = Record<string, unknown>;

const now = (): string =>
  new Date().toISOString();

const nullableText = (
  value: unknown,
): string | null => {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw new TypeError(
      "Expected a string or null.",
    );
  }

  return value.trim();
};

const parsePayloadJson = (
  value: unknown,
): Record<string, unknown> => {
  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed: unknown =
      JSON.parse(value);

    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<
        string,
        unknown
      >;
    }
  } catch {
    // Legacy or malformed payloads
    // are treated as empty objects.
  }

  return {};
};

const taskKind = (
  value: unknown,
): TaskRecord["kind"] => {
  switch (value) {
    case "manual":
    case "collect-blocks":
    case "build-blueprint":
    case "move":
      return value;

    default:
      return "manual";
  }
};

const toAgent = (
  row: Row,
): AgentRecord => ({
  id: String(row.id),

  name: String(row.name),

  role: nullableText(
    row.role,
  ),

  status:
    row.status === "offline"
      ? "offline"
      : "online",

  lastHeartbeatAt: String(
    row.last_heartbeat_at,
  ),

  createdAt: String(
    row.created_at,
  ),

  updatedAt: String(
    row.updated_at,
  ),
});

const toProject = (
  row: Row,
): ProjectRecord => ({
  id: String(row.id),

  name: String(row.name),

  description: nullableText(
    row.description,
  ),

  createdAt: String(
    row.created_at,
  ),

  updatedAt: String(
    row.updated_at,
  ),
});

const toTask = (
  row: Row,
): TaskRecord => ({
  id: String(row.id),

  projectId: nullableText(
    row.project_id,
  ),

  title: String(
    row.title,
  ),

  description: nullableText(
    row.description,
  ),

  kind: taskKind(
    row.kind,
  ),

  requiredRole: nullableText(
    row.required_role,
  ),

  payload: parsePayloadJson(
    row.payload_json,
  ),

  status:
    isTaskStatus(row.status)
      ? row.status
      : "pending",

  assignedAgentId: nullableText(
    row.assigned_agent_id,
  ),

  failureReason: nullableText(
    row.failure_reason,
  ),

  createdAt: String(
    row.created_at,
  ),

  updatedAt: String(
    row.updated_at,
  ),

  startedAt: nullableText(
    row.started_at,
  ),

  completedAt: nullableText(
    row.completed_at,
  ),

  failedAt: nullableText(
    row.failed_at,
  ),

  cancelledAt: nullableText(
    row.cancelled_at,
  ),
});

export class CoordinatorStore {
  private readonly database: DatabaseSync;

  constructor(
    dbPath: string,
  ) {
    mkdirSync(
      dirname(dbPath),
      {
        recursive: true,
      },
    );

    this.database =
      new DatabaseSync(dbPath);

    this.database.exec(
      "PRAGMA foreign_keys = ON;",
    );

    this.database.exec(
      "PRAGMA journal_mode = WAL;",
    );

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT,
        status TEXT NOT NULL
          CHECK (
            status IN (
              'online',
              'offline'
            )
          ),
        last_heartbeat_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,

        project_id TEXT,

        title TEXT NOT NULL,
        description TEXT,

        kind TEXT NOT NULL
          DEFAULT 'manual',

        required_role TEXT,

        payload_json TEXT NOT NULL
          DEFAULT '{}',

        status TEXT NOT NULL
          CHECK (
            status IN (
              'pending',
              'assigned',
              'running',
              'completed',
              'failed',
              'cancelled'
            )
          ),

        assigned_agent_id TEXT,
        failure_reason TEXT,

        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        started_at TEXT,
        completed_at TEXT,
        failed_at TEXT,
        cancelled_at TEXT,

        FOREIGN KEY (
          project_id
        )
        REFERENCES projects(id)
        ON DELETE SET NULL,

        FOREIGN KEY (
          assigned_agent_id
        )
        REFERENCES agents(id)
        ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS
      idx_tasks_status_created_at
      ON tasks(
        status,
        created_at
      );

      CREATE INDEX IF NOT EXISTS
      idx_tasks_project_id
      ON tasks(
        project_id
      );

      CREATE INDEX IF NOT EXISTS
      idx_tasks_assigned_agent_id
      ON tasks(
        assigned_agent_id
      );
    `);

    this.migrateTaskSchema();
  }

  private migrateTaskSchema(): void {
    const columns =
      this.database
        .prepare(
          "PRAGMA table_info(tasks)",
        )
        .all() as Row[];

    const names = new Set(
      columns.map(
        (column) =>
          String(column.name),
      ),
    );

    if (!names.has("kind")) {
      this.database.exec(`
        ALTER TABLE tasks
        ADD COLUMN kind TEXT
        NOT NULL DEFAULT 'manual';
      `);
    }

    if (!names.has("required_role")) {
      this.database.exec(`
        ALTER TABLE tasks
        ADD COLUMN required_role TEXT;
      `);
    }

    if (!names.has("payload_json")) {
      this.database.exec(`
        ALTER TABLE tasks
        ADD COLUMN payload_json TEXT
        NOT NULL DEFAULT '{}';
      `);
    }

    this.database.exec(`
      CREATE INDEX IF NOT EXISTS
      idx_tasks_status_role_created_at
      ON tasks(
        status,
        required_role,
        created_at
      );
    `);
  }

  close(): void {
    this.database.close();
  }

  listAgents(): AgentRecord[] {
    const rows =
      this.database
        .prepare(`
          SELECT *
          FROM agents
          ORDER BY
            updated_at DESC,
            created_at DESC
        `)
        .all() as Row[];

    return rows.map(toAgent);
  }

  upsertAgentHeartbeat(
    input: HeartbeatInput,
  ): AgentRecord {
    const timestamp = now();

    const id =
      input.id?.trim() ||
      randomUUID();

    const existing =
      this.database
        .prepare(`
          SELECT id
          FROM agents
          WHERE id = :id
        `)
        .get({
          id,
        }) as Row | undefined;

    if (existing) {
      this.database
        .prepare(`
          UPDATE agents

          SET
            name = :name,
            role = :role,
            status = 'online',
            last_heartbeat_at =
              :lastHeartbeatAt,
            updated_at =
              :updatedAt

          WHERE id = :id
        `)
        .run({
          id,

          name:
            input.name,

          role:
            input.role ?? null,

          lastHeartbeatAt:
            timestamp,

          updatedAt:
            timestamp,
        });
    } else {
      this.database
        .prepare(`
          INSERT INTO agents (
            id,
            name,
            role,
            status,
            last_heartbeat_at,
            created_at,
            updated_at
          )

          VALUES (
            :id,
            :name,
            :role,
            'online',
            :lastHeartbeatAt,
            :createdAt,
            :updatedAt
          )
        `)
        .run({
          id,

          name:
            input.name,

          role:
            input.role ?? null,

          lastHeartbeatAt:
            timestamp,

          createdAt:
            timestamp,

          updatedAt:
            timestamp,
        });
    }

    return this.getAgentById(
      id,
    );
  }

  getAgentById(
    id: string,
  ): AgentRecord {
    const row =
      this.database
        .prepare(`
          SELECT *
          FROM agents
          WHERE id = :id
        `)
        .get({
          id,
        }) as Row | undefined;

    if (!row) {
      throw new NotFoundError(
        `Agent '${id}' not found.`,
      );
    }

    return toAgent(row);
  }

  listProjects(): ProjectRecord[] {
    const rows =
      this.database
        .prepare(`
          SELECT *
          FROM projects
          ORDER BY
            updated_at DESC,
            created_at DESC
        `)
        .all() as Row[];

    return rows.map(
      toProject,
    );
  }

  createProject(
    input: ProjectInput,
  ): ProjectRecord {
    const timestamp = now();
    const id = randomUUID();

    this.database
      .prepare(`
        INSERT INTO projects (
          id,
          name,
          description,
          created_at,
          updated_at
        )

        VALUES (
          :id,
          :name,
          :description,
          :createdAt,
          :updatedAt
        )
      `)
      .run({
        id,

        name:
          input.name,

        description:
          input.description ??
          null,

        createdAt:
          timestamp,

        updatedAt:
          timestamp,
      });

    return this.getProjectById(
      id,
    );
  }

  getProjectById(
    id: string,
  ): ProjectRecord {
    const row =
      this.database
        .prepare(`
          SELECT *
          FROM projects
          WHERE id = :id
        `)
        .get({
          id,
        }) as Row | undefined;

    if (!row) {
      throw new NotFoundError(
        `Project '${id}' not found.`,
      );
    }

    return toProject(row);
  }

  listTasks(): TaskRecord[] {
    const rows =
      this.database
        .prepare(`
          SELECT *
          FROM tasks
          ORDER BY
            created_at DESC,
            updated_at DESC
        `)
        .all() as Row[];

    return rows.map(
      toTask,
    );
  }

  createTask(
    input: TaskCreateInput,
  ): TaskRecord {
    const timestamp = now();
    const id = randomUUID();

    if (input.projectId) {
      this.getProjectById(
        input.projectId,
      );
    }

    this.database
      .prepare(`
        INSERT INTO tasks (
          id,
          project_id,

          title,
          description,

          kind,
          required_role,
          payload_json,

          status,
          assigned_agent_id,
          failure_reason,

          created_at,
          updated_at,

          started_at,
          completed_at,
          failed_at,
          cancelled_at
        )

        VALUES (
          :id,
          :projectId,

          :title,
          :description,

          :kind,
          :requiredRole,
          :payloadJson,

          'pending',
          NULL,
          NULL,

          :createdAt,
          :updatedAt,

          NULL,
          NULL,
          NULL,
          NULL
        )
      `)
      .run({
        id,

        projectId:
          input.projectId ??
          null,

        title:
          input.title,

        description:
          input.description ??
          null,

        kind:
          input.kind ??
          "manual",

        requiredRole:
          input.requiredRole ??
          null,

        payloadJson:
          JSON.stringify(
            input.payload ??
              {},
          ),

        createdAt:
          timestamp,

        updatedAt:
          timestamp,
      });

    return this.getTaskById(
      id,
    );
  }

  getTaskById(
    id: string,
  ): TaskRecord {
    const row =
      this.database
        .prepare(`
          SELECT *
          FROM tasks
          WHERE id = :id
        `)
        .get({
          id,
        }) as Row | undefined;

    if (!row) {
      throw new NotFoundError(
        `Task '${id}' not found.`,
      );
    }

    return toTask(row);
  }

  claimNextTask(
    agentId: string,
  ): TaskRecord | null {
    const agent =
      this.getAgentById(
        agentId,
      );

    if (
      agent.role === null ||
      agent.role.trim().length === 0
    ) {
      return null;
    }

    const timestamp = now();

    this.database.exec(
      "BEGIN IMMEDIATE TRANSACTION;",
    );

    try {
      const row =
        this.database
          .prepare(`
            SELECT *
            FROM tasks

            WHERE
              status = 'pending'
              AND required_role =
                :requiredRole

            ORDER BY
              created_at ASC,
              id ASC

            LIMIT 1
          `)
          .get({
            requiredRole:
              agent.role,
          }) as Row | undefined;

      if (!row) {
        this.database.exec(
          "ROLLBACK;",
        );

        return null;
      }

      const id =
        String(row.id);

      const update =
        this.database
          .prepare(`
            UPDATE tasks

            SET
              status = 'assigned',
              assigned_agent_id =
                :agentId,
              updated_at =
                :updatedAt

            WHERE
              id = :id
              AND status = 'pending'
          `)
          .run({
            id,

            agentId,

            updatedAt:
              timestamp,
          });

      if (update.changes !== 1) {
        this.database.exec(
          "ROLLBACK;",
        );

        return null;
      }

      this.database.exec(
        "COMMIT;",
      );

      return this.getTaskById(
        id,
      );
    } catch (error) {
      this.database.exec(
        "ROLLBACK;",
      );

      throw error;
    }
  }

  patchTask(
    id: string,
    input: TaskPatchInput,
  ): TaskRecord {
    const current =
      this.getTaskById(
        id,
      );

    const timestamp = now();

    if (
      input.projectId !== undefined &&
      input.projectId !== null
    ) {
      this.getProjectById(
        input.projectId,
      );
    }

    if (
      input.assignedAgentId !==
        undefined &&
      input.assignedAgentId !==
        null
    ) {
      this.getAgentById(
        input.assignedAgentId,
      );
    }

    const nextStatus =
      input.status ??
      current.status;

    if (
      !canTransitionTaskStatus(
        current.status,
        nextStatus,
      )
    ) {
      throw new ConflictError(
        `Cannot transition task '${id}' from '${current.status}' to '${nextStatus}'.`,
      );
    }

    const startedAt =
      current.startedAt ??
      (
        nextStatus ===
          "running" ||
        nextStatus ===
          "completed" ||
        nextStatus ===
          "failed" ||
        nextStatus ===
          "cancelled"
          ? timestamp
          : null
      );

    const completedAt =
      nextStatus ===
      "completed"
        ? timestamp
        : current.completedAt;

    const failedAt =
      nextStatus ===
      "failed"
        ? timestamp
        : current.failedAt;

    const cancelledAt =
      nextStatus ===
      "cancelled"
        ? timestamp
        : current.cancelledAt;

    this.database
      .prepare(`
        UPDATE tasks

        SET
          title = :title,
          description = :description,
          project_id = :projectId,
          status = :status,
          assigned_agent_id =
            :assignedAgentId,
          failure_reason =
            :failureReason,
          updated_at =
            :updatedAt,
          started_at =
            :startedAt,
          completed_at =
            :completedAt,
          failed_at =
            :failedAt,
          cancelled_at =
            :cancelledAt

        WHERE id = :id
      `)
      .run({
        id,

        title:
          input.title ??
          current.title,

        description:
          input.description ===
          undefined
            ? current.description
            : input.description,

        projectId:
          input.projectId ===
          undefined
            ? current.projectId
            : input.projectId,

        status:
          nextStatus,

        assignedAgentId:
          input.assignedAgentId ===
          undefined
            ? current.assignedAgentId
            : input.assignedAgentId,

        failureReason:
          input.failureReason ===
          undefined
            ? current.failureReason
            : input.failureReason,

        updatedAt:
          timestamp,

        startedAt,

        completedAt,

        failedAt,

        cancelledAt,
      });

    return this.getTaskById(
      id,
    );
  }
}