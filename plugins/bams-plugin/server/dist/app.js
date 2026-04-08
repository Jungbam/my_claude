// @bun
var __require = import.meta.require;

// src/app.ts
import { readFileSync, existsSync as existsSync2, readdirSync, appendFileSync } from "fs";
import { join as join3 } from "path";

// ../tools/bams-db/index.ts
import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

// ../tools/bams-db/schema.ts
var TASKS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id                  TEXT PRIMARY KEY,           -- UUID (crypto.randomUUID())
    pipeline_id         TEXT NOT NULL REFERENCES pipelines(id),  -- \uD30C\uC774\uD504\uB77C\uC778 FK
    phase               INTEGER,                    -- Phase \uBC88\uD638 (1, 2, 3, 4, 5)
    step                TEXT,                       -- Step \uC2DD\uBCC4\uC790 (e.g. "design", "implement")
    title               TEXT NOT NULL,              -- \uD0DC\uC2A4\uD06C \uC81C\uBAA9
    description         TEXT,                       -- \uC0C1\uC138 \uC124\uBA85 (Markdown)
    status              TEXT NOT NULL DEFAULT 'backlog',  -- backlog|in_progress|in_review|done|blocked|cancelled
    priority            TEXT NOT NULL DEFAULT 'medium',   -- high|medium|low
    size                TEXT,                       -- XS|S|M|L|XL
    assignee_agent      TEXT,                       -- \uB2F4\uB2F9 \uC5D0\uC774\uC804\uD2B8 \uC2AC\uB7EC\uADF8
    checkout_run_id     TEXT,                       -- \uCCB4\uD06C\uC544\uC6C3\uD55C \uC2E4\uD589 ID (atomic lock \uC18C\uC720\uC790)
    checkout_locked_at  TEXT,                       -- ISO-8601 \uD0C0\uC784\uC2A4\uD0EC\uD504 (\uC7A0\uAE08 \uC2DC\uAC01)
    deps                TEXT,                       -- JSON \uBC30\uC5F4: ["REF-A1", "REF-A2"]
    tags                TEXT,                       -- JSON \uBC30\uC5F4: ["backend", "infra"]
    model               TEXT,                       -- \uC0AC\uC6A9 \uBAA8\uB378 (e.g. "claude-sonnet-4")
    label               TEXT,                       -- \uD0DC\uC2A4\uD06C \uB77C\uBCA8
    duration_ms         INTEGER,                    -- \uC18C\uC694 \uC2DC\uAC04 (ms)
    summary             TEXT,                       -- \uD0DC\uC2A4\uD06C \uC694\uC57D
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    started_at          TEXT,
    completed_at        TEXT
  );
`;
var TASKS_INDEXES_DDL = `
  CREATE INDEX IF NOT EXISTS tasks_pipeline_id_status_idx
    ON tasks(pipeline_id, status);

  CREATE INDEX IF NOT EXISTS tasks_assignee_status_idx
    ON tasks(assignee_agent, status);

  CREATE INDEX IF NOT EXISTS tasks_phase_idx
    ON tasks(pipeline_id, phase);
`;
var TASK_EVENTS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS task_events (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    event_type  TEXT NOT NULL,    -- status_change|checkout|assign|comment
    from_status TEXT,             -- \uC774\uC804 \uC0C1\uD0DC
    to_status   TEXT,             -- \uB2E4\uC74C \uC0C1\uD0DC
    agent_slug  TEXT,             -- \uBCC0\uACBD\uC744 \uC218\uD589\uD55C \uC5D0\uC774\uC804\uD2B8
    run_id      TEXT,             -- \uD30C\uC774\uD504\uB77C\uC778 \uC2E4\uD589 ID
    payload     TEXT,             -- JSON: \uCD94\uAC00 \uB370\uC774\uD130
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS task_events_task_idx
    ON task_events(task_id);

  CREATE INDEX IF NOT EXISTS task_events_created_idx
    ON task_events(created_at);
`;
var RUN_LOGS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS run_logs (
    id              TEXT PRIMARY KEY,
    pipeline_id     TEXT NOT NULL REFERENCES pipelines(id),
    run_id          TEXT,
    agent_slug      TEXT NOT NULL,
    event_type      TEXT NOT NULL,   -- agent_start | tool_call | tool_result | text_chunk | agent_end | error
    payload         TEXT,            -- JSON \uC9C1\uB82C\uD654\uB41C \uC774\uBCA4\uD2B8 \uB370\uC774\uD130
    created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS run_logs_pipeline_id_idx
    ON run_logs(pipeline_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS run_logs_agent_idx
    ON run_logs(agent_slug, created_at DESC);

  -- \uC790\uB3D9 \uC815\uB9AC \uD2B8\uB9AC\uAC70: 30\uC77C \uCD08\uACFC \uB610\uB294 \uD30C\uC774\uD504\uB77C\uC778\uB2F9 1,000\uAC74 \uCD08\uACFC \uC2DC \uC0AD\uC81C
  CREATE TRIGGER IF NOT EXISTS run_logs_cleanup
    AFTER INSERT ON run_logs
    BEGIN
      DELETE FROM run_logs
      WHERE created_at < datetime('now', '-30 days');
    END;
`;
var HR_REPORTS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS hr_reports (
    id              TEXT PRIMARY KEY,
    retro_slug      TEXT NOT NULL UNIQUE,
    report_date     TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'retro',
    period_start    TEXT,
    period_end      TEXT,
    data            TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS hr_reports_date_idx ON hr_reports(report_date DESC);
`;
var PIPELINES_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS pipelines (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    work_unit_id    TEXT REFERENCES work_units(id),
    type            TEXT NOT NULL,
    command         TEXT,
    status          TEXT NOT NULL DEFAULT 'running',
    arguments       TEXT,
    started_at      TEXT,
    ended_at        TEXT,
    duration_ms     INTEGER,
    total_steps     INTEGER DEFAULT 0,
    completed_steps INTEGER DEFAULT 0,
    failed_steps    INTEGER DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS pipelines_work_unit_idx ON pipelines(work_unit_id);
  CREATE INDEX IF NOT EXISTS pipelines_status_idx ON pipelines(status);
`;
var WORK_UNITS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS work_units (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    started_at      TEXT NOT NULL,
    ended_at        TEXT,
    deleted_at      TEXT,                                         -- \uC18C\uD504\uD2B8 \uC0AD\uC81C \uD0C0\uC784\uC2A4\uD0EC\uD504 (NULL=\uD65C\uC131)
    created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
  );
`;

// ../tools/bams-db/index.ts
var DEFAULT_DB_PATH = join(homedir(), ".claude", "plugins", "marketplaces", "my-claude", "bams.db");

class TaskDB {
  db;
  constructor(dbPath = DEFAULT_DB_PATH) {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir) {
      const fs = __require("fs");
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.initSchema();
  }
  initSchema() {
    this.db.exec(WORK_UNITS_TABLE_DDL);
    this.db.exec(PIPELINES_TABLE_DDL);
    this.db.exec(TASKS_TABLE_DDL);
    this.db.exec(TASK_EVENTS_TABLE_DDL);
    this.db.exec(TASKS_INDEXES_DDL);
    this.db.exec(RUN_LOGS_TABLE_DDL);
    this.db.exec(HR_REPORTS_TABLE_DDL);
  }
  upsertPipeline(input) {
    const existing = this.getPipelineBySlug(input.slug);
    if (existing) {
      this.db.prepare(`
        UPDATE pipelines
        SET work_unit_id = COALESCE(?, work_unit_id),
            type = ?,
            command = COALESCE(?, command),
            status = COALESCE(?, status),
            arguments = COALESCE(?, arguments),
            started_at = COALESCE(?, started_at),
            updated_at = datetime('now')
        WHERE slug = ?
      `).run(input.work_unit_id ?? null, input.type, input.command ?? null, input.status ?? null, input.arguments ?? null, input.started_at ?? null, input.slug);
      return existing.id;
    }
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO pipelines (id, slug, work_unit_id, type, command, status, arguments, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.slug, input.work_unit_id ?? null, input.type, input.command ?? null, input.status ?? "running", input.arguments ?? null, input.started_at ?? null);
    return id;
  }
  updatePipelineStatus(slug, status, endedAt, durationMs) {
    this.db.prepare(`
      UPDATE pipelines
      SET status = ?,
          ended_at = COALESCE(?, ended_at),
          duration_ms = COALESCE(?, duration_ms),
          updated_at = datetime('now')
      WHERE slug = ?
    `).run(status, endedAt ?? null, durationMs ?? null, slug);
  }
  getPipelines() {
    return this.db.prepare("SELECT * FROM pipelines ORDER BY created_at DESC").all();
  }
  getPipelineBySlug(slug) {
    return this.db.prepare("SELECT * FROM pipelines WHERE slug = ?").get(slug) ?? null;
  }
  getPipelinesByWorkUnit(workUnitId) {
    return this.db.prepare("SELECT * FROM pipelines WHERE work_unit_id = ? ORDER BY created_at ASC").all(workUnitId);
  }
  checkoutTask(taskId, runId, agentSlug) {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status             = 'in_progress',
          checkout_run_id    = ?,
          checkout_locked_at = datetime('now'),
          assignee_agent     = ?,
          started_at         = COALESCE(started_at, datetime('now')),
          updated_at         = datetime('now')
      WHERE id = ? AND status = 'backlog' AND checkout_run_id IS NULL
    `);
    const result = stmt.run(runId, agentSlug, taskId);
    if (result.changes === 1) {
      this.insertEvent({
        task_id: taskId,
        event_type: "checkout",
        from_status: "backlog",
        to_status: "in_progress",
        agent_slug: agentSlug,
        run_id: runId,
        payload: null
      });
      return true;
    }
    return false;
  }
  updateTaskStatus(taskId, toStatus, agentSlug, runId, payload) {
    const current = this.db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId);
    if (!current)
      throw new Error(`Task not found: ${taskId}`);
    const fromStatus = current.status;
    const updateTask = this.db.prepare(`
      UPDATE tasks
      SET status       = ?,
          updated_at   = datetime('now'),
          completed_at = CASE
            WHEN ? IN ('done', 'cancelled') THEN COALESCE(completed_at, datetime('now'))
            ELSE completed_at
          END
      WHERE id = ?
    `);
    const transaction = this.db.transaction(() => {
      updateTask.run(toStatus, toStatus, taskId);
      this.insertEvent({
        task_id: taskId,
        event_type: "status_change",
        from_status: fromStatus,
        to_status: toStatus,
        agent_slug: agentSlug,
        run_id: runId ?? null,
        payload: payload ? JSON.stringify(payload) : null
      });
    });
    transaction();
  }
  createTask(input) {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, pipeline_id, phase, step, title, description,
        priority, size, assignee_agent, deps, tags,
        model, label, duration_ms, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, input.pipeline_id, input.phase ?? null, input.step ?? null, input.title, input.description ?? null, input.priority ?? "medium", input.size ?? null, input.assignee_agent ?? null, input.deps ? JSON.stringify(input.deps) : null, input.tags ? JSON.stringify(input.tags) : null, input.model ?? null, input.label ?? null, input.duration_ms ?? null, input.summary ?? null);
    return id;
  }
  getTasksByStatus(pipelineId, status) {
    return this.db.prepare(`
        SELECT * FROM tasks
        WHERE pipeline_id = ? AND status = ?
        ORDER BY
          CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
          created_at ASC
      `).all(pipelineId, status);
  }
  getTasksByPipelineId(pipelineId) {
    return this.db.prepare(`
        SELECT * FROM tasks
        WHERE pipeline_id = ?
        ORDER BY phase ASC, created_at ASC
      `).all(pipelineId);
  }
  getTask(taskId) {
    return this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) ?? null;
  }
  getTaskEvents(taskId) {
    return this.db.prepare(`
        SELECT * FROM task_events
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all(taskId);
  }
  getPipelineSummary(pipelineId) {
    const row = this.db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'backlog'     THEN 1 ELSE 0 END) AS backlog,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
          SUM(CASE WHEN status = 'in_review'   THEN 1 ELSE 0 END) AS in_review,
          SUM(CASE WHEN status = 'done'        THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN status = 'blocked'     THEN 1 ELSE 0 END) AS blocked,
          SUM(CASE WHEN status = 'cancelled'   THEN 1 ELSE 0 END) AS cancelled
        FROM tasks
        WHERE pipeline_id = ?
      `).get(pipelineId);
    return row ?? {
      total: 0,
      backlog: 0,
      in_progress: 0,
      in_review: 0,
      done: 0,
      blocked: 0,
      cancelled: 0
    };
  }
  insertEvent(event) {
    const stmt = this.db.prepare(`
      INSERT INTO task_events (id, task_id, event_type, from_status, to_status, agent_slug, run_id, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(randomUUID(), event.task_id, event.event_type, event.from_status ?? null, event.to_status ?? null, event.agent_slug ?? null, event.run_id ?? null, event.payload ?? null);
  }
  upsertWorkUnit(slug, name) {
    this.db.prepare(`
      INSERT OR IGNORE INTO work_units (id, slug, name, status, started_at)
      VALUES (?, ?, ?, 'active', datetime('now'))
    `).run(randomUUID(), slug, name ?? slug);
  }
  linkPipelineToWorkUnit(pipelineSlug, workUnitSlug) {
    const wu = this.db.prepare("SELECT id FROM work_units WHERE slug = ?").get(workUnitSlug);
    if (!wu)
      return;
    this.db.prepare(`
      UPDATE pipelines SET work_unit_id = ?, updated_at = datetime('now')
      WHERE slug = ?
    `).run(wu.id, pipelineSlug);
  }
  getWorkUnitPipelines(workUnitSlug) {
    return this.db.prepare(`
        SELECT p.* FROM pipelines p
        INNER JOIN work_units wu ON p.work_unit_id = wu.id
        WHERE wu.slug = ?
        ORDER BY p.created_at ASC
      `).all(workUnitSlug);
  }
  unlinkPipelinesFromWorkUnit(workUnitSlug) {
    this.db.prepare("UPDATE pipelines SET work_unit_id = NULL WHERE work_unit_id = (SELECT id FROM work_units WHERE slug = ?)").run(workUnitSlug);
  }
  close() {
    this.db.close();
  }
}
var _defaultDb = null;
function getDefaultDB() {
  if (!_defaultDb) {
    _defaultDb = new TaskDB;
  }
  return _defaultDb;
}

class HrReportDB {
  db;
  constructor(dbPath = DEFAULT_DB_PATH) {
    const fs = __require("fs");
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir)
      fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.initSchema();
  }
  initSchema() {
    this.db.exec(HR_REPORTS_TABLE_DDL);
  }
  upsertHrReport(retroSlug, reportDate, data) {
    const id = randomUUID();
    const periodStart = data.period?.start ?? null;
    const periodEnd = data.period?.end ?? null;
    const source = typeof data.source === "string" ? data.source : "retro";
    this.db.prepare(`INSERT OR REPLACE INTO hr_reports
          (id, retro_slug, report_date, source, period_start, period_end, data, updated_at)
         VALUES (
           COALESCE((SELECT id FROM hr_reports WHERE retro_slug = ?), ?),
           ?, ?, ?, ?, ?, ?, datetime('now')
         )`).run(retroSlug, id, retroSlug, reportDate, source, periodStart, periodEnd, JSON.stringify(data));
    const row = this.db.prepare("SELECT id FROM hr_reports WHERE retro_slug = ?").get(retroSlug);
    return row?.id ?? id;
  }
  getHrReports() {
    return this.db.prepare("SELECT * FROM hr_reports ORDER BY report_date DESC, created_at DESC").all();
  }
  getHrReportLatest() {
    return this.db.prepare("SELECT * FROM hr_reports ORDER BY report_date DESC, created_at DESC LIMIT 1").get() ?? null;
  }
  getHrReportBySlug(retroSlug) {
    return this.db.prepare("SELECT * FROM hr_reports WHERE retro_slug = ?").get(retroSlug) ?? null;
  }
  getRetroJournal() {
    return this.db.prepare(`SELECT * FROM hr_reports
         WHERE source = 'retro'
         ORDER BY report_date DESC, created_at DESC`).all();
  }
  close() {
    this.db.close();
  }
}
var _defaultHrReportDb = null;
function getDefaultHrReportDB() {
  if (!_defaultHrReportDb) {
    _defaultHrReportDb = new HrReportDB;
  }
  return _defaultHrReportDb;
}

class WorkUnitDB {
  db;
  constructor(dbPath = DEFAULT_DB_PATH) {
    const fs = __require("fs");
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir)
      fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.initSchema();
  }
  initSchema() {
    this.db.exec(WORK_UNITS_TABLE_DDL);
    this.db.exec(PIPELINES_TABLE_DDL);
    try {
      this.db.exec("ALTER TABLE work_units ADD COLUMN deleted_at TEXT");
    } catch {}
  }
  createWorkUnit(slug, name, startedAt) {
    this.db.prepare("INSERT OR IGNORE INTO work_units (id, slug, name, status, started_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), slug, name, "active", startedAt);
  }
  endWorkUnit(slug, status, endedAt) {
    this.db.prepare("UPDATE work_units SET status = ?, ended_at = ? WHERE slug = ?").run(status, endedAt, slug);
  }
  getWorkUnits() {
    return this.db.prepare("SELECT * FROM work_units ORDER BY created_at DESC").all();
  }
  getWorkUnit(slug) {
    return this.db.prepare("SELECT * FROM work_units WHERE slug = ?").get(slug) ?? null;
  }
  getActiveWorkUnit() {
    return this.db.prepare("SELECT * FROM work_units WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get() ?? null;
  }
  deleteWorkUnit(slug) {
    this.db.prepare("UPDATE work_units SET deleted_at = datetime('now') WHERE slug = ? AND deleted_at IS NULL").run(slug);
  }
  close() {
    this.db.close();
  }
}
var _defaultWorkUnitDb = null;
function getDefaultWorkUnitDB() {
  if (!_defaultWorkUnitDb) {
    _defaultWorkUnitDb = new WorkUnitDB;
  }
  return _defaultWorkUnitDb;
}

// src/sse-broker.ts
import { Database as Database2 } from "bun:sqlite";
import { randomUUID as randomUUID2 } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { homedir as homedir2 } from "os";
import { join as join2 } from "path";

class SseBroker {
  clients = new Map;
  agentClients = new Map;
  db;
  pipelineIdCache = new Map;
  constructor(dbPath = join2(homedir2(), ".claude", "plugins", "marketplaces", "my-claude", "bams.db")) {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database2(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.initSchema();
  }
  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS run_logs (
        id              TEXT PRIMARY KEY,
        pipeline_id     TEXT NOT NULL,
        run_id          TEXT,
        agent_slug      TEXT NOT NULL,
        event_type      TEXT NOT NULL,
        payload         TEXT,
        created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS run_logs_pipeline_id_idx
        ON run_logs(pipeline_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS run_logs_agent_idx
        ON run_logs(agent_slug, created_at DESC);
    `);
  }
  resolvePipelineId(pipelineSlug) {
    if (this.pipelineIdCache.has(pipelineSlug)) {
      return this.pipelineIdCache.get(pipelineSlug);
    }
    try {
      const row = this.db.prepare("SELECT id FROM pipelines WHERE slug = ?").get(pipelineSlug);
      if (row) {
        this.pipelineIdCache.set(pipelineSlug, row.id);
        return row.id;
      }
    } catch {}
    return pipelineSlug;
  }
  pushEvent(event) {
    const id = randomUUID2();
    const pipelineId = this.resolvePipelineId(event.pipeline_slug);
    try {
      this.db.prepare(`INSERT INTO run_logs (id, pipeline_id, run_id, agent_slug, event_type, payload)
          VALUES (?, ?, ?, ?, ?, ?)`).run(id, pipelineId, event.run_id ?? null, event.agent_slug, event.type, event.payload ? JSON.stringify(event.payload) : null);
    } catch {}
    const ssePayload = `event: ${event.type}
data: ${JSON.stringify(event)}

`;
    this.broadcast(this.clients, event.pipeline_slug, ssePayload);
    this.broadcast(this.clients, "global", ssePayload);
    this.broadcast(this.agentClients, event.agent_slug, ssePayload);
  }
  broadcast(map, key, payload) {
    const clients = map.get(key);
    if (!clients)
      return;
    const dead = new Set;
    for (const ctrl of clients) {
      try {
        ctrl.enqueue(payload);
      } catch {
        dead.add(ctrl);
      }
    }
    for (const d of dead)
      clients.delete(d);
  }
  createStream(filter) {
    const pipelineKey = filter.pipeline ?? "global";
    const agentKey = filter.agent;
    return new ReadableStream({
      start: (controller) => {
        if (!this.clients.has(pipelineKey)) {
          this.clients.set(pipelineKey, new Set);
        }
        this.clients.get(pipelineKey).add(controller);
        if (agentKey) {
          if (!this.agentClients.has(agentKey)) {
            this.agentClients.set(agentKey, new Set);
          }
          this.agentClients.get(agentKey).add(controller);
        }
        controller.enqueue(`event: connected
data: ${JSON.stringify({
          pipeline: pipelineKey,
          agent: agentKey,
          ts: new Date().toISOString()
        })}

`);
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(`: heartbeat

`);
          } catch {
            clearInterval(heartbeat);
            this.cleanup(controller, pipelineKey, agentKey);
          }
        }, 30000);
        if (filter.pipeline) {
          const recentLogs = this.getRecentLogs(filter.pipeline, 50);
          for (const log of recentLogs) {
            try {
              const payload = log.payload ? JSON.parse(log.payload) : null;
              controller.enqueue(`event: ${log.event_type}
data: ${JSON.stringify({
                ...payload,
                _replayed: true,
                _log_id: log.id,
                _created_at: log.created_at
              })}

`);
            } catch {}
          }
          controller.enqueue(`event: replay_complete
data: ${JSON.stringify({ count: recentLogs.length })}

`);
        }
        return () => {
          clearInterval(heartbeat);
          this.cleanup(controller, pipelineKey, agentKey);
        };
      }
    });
  }
  cleanup(ctrl, pipelineKey, agentKey) {
    this.clients.get(pipelineKey)?.delete(ctrl);
    if (agentKey) {
      this.agentClients.get(agentKey)?.delete(ctrl);
    }
  }
  getRecentLogs(pipelineSlug, limit = 100) {
    const pipelineId = this.resolvePipelineId(pipelineSlug);
    return this.db.prepare(`SELECT * FROM run_logs
        WHERE pipeline_id = ?
        ORDER BY created_at ASC
        LIMIT ?`).all(pipelineId, limit);
  }
  getAgentLogs(agentSlug, limit = 50) {
    return this.db.prepare(`SELECT * FROM run_logs
        WHERE agent_slug = ?
        ORDER BY created_at DESC
        LIMIT ?`).all(agentSlug, limit);
  }
  close() {
    this.db.close();
  }
}
var _broker = null;
function getBroker() {
  if (!_broker) {
    _broker = new SseBroker;
  }
  return _broker;
}

// src/app.ts
var PORT = parseInt(process.env.BAMS_SERVER_PORT ?? "3099", 10);
var HOME_DIR = process.env.HOME ?? process.env.USERPROFILE ?? "";
var GLOBAL_ROOT = process.env.BAMS_ROOT ?? (HOME_DIR ? `${HOME_DIR}/.bams` : ".crew");
var PIPELINE_EVENTS_DIR = `${GLOBAL_ROOT}/artifacts/pipeline`;
var AGENTS_DIR = "plugins/bams-plugin/agents";
function pushSseEvent(pipelineSlug, eventType, data) {
  const broker = getBroker();
  broker.pushEvent({
    type: eventType,
    pipeline_slug: pipelineSlug,
    agent_slug: data.agent_slug ?? "system",
    run_id: data.run_id,
    ts: new Date().toISOString(),
    payload: data
  });
}
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}
function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}
function parsePipelineEvents(slug) {
  const filePath = join3(PIPELINE_EVENTS_DIR, `${slug}-events.jsonl`);
  if (!existsSync2(filePath))
    return [];
  try {
    return readFileSync(filePath, "utf-8").split(`
`).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
function getPipelineSlugs() {
  if (!existsSync2(PIPELINE_EVENTS_DIR))
    return [];
  try {
    return readdirSync(PIPELINE_EVENTS_DIR).filter((f) => f.endsWith("-events.jsonl")).map((f) => f.replace("-events.jsonl", ""));
  } catch {
    return [];
  }
}
function parseWorkUnitEvents(slug) {
  const file = join3(PIPELINE_EVENTS_DIR, `${slug}-workunit.jsonl`);
  if (!existsSync2(file))
    return [];
  try {
    return readFileSync(file, "utf-8").split(`
`).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
function getWorkUnitSlugs() {
  if (!existsSync2(PIPELINE_EVENTS_DIR))
    return [];
  try {
    return readdirSync(PIPELINE_EVENTS_DIR).filter((f) => f.endsWith("-workunit.jsonl")).map((f) => f.replace("-workunit.jsonl", ""));
  } catch {
    return [];
  }
}
function parseAgentInfo(slug) {
  const filePath = join3(AGENTS_DIR, `${slug}.md`);
  if (!existsSync2(filePath)) {
    return { slug, name: slug, department: "unknown" };
  }
  const content = readFileSync(filePath, "utf-8");
  const nameMatch = content.match(/^#\s+(.+)$/m);
  const deptMatch = content.match(/(?:\uBD80\uC11C|department)[:\s]+([^\n]+)/i);
  return {
    slug,
    name: nameMatch?.[1]?.trim() ?? slug,
    department: deptMatch?.[1]?.trim() ?? "unknown"
  };
}
function getAgentSlugs() {
  if (!existsSync2(AGENTS_DIR))
    return [];
  try {
    return readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(".md", ""));
  } catch {
    return [];
  }
}
function syncPipelinesFromEvents() {
  const db = getDefaultDB();
  const wuDb = getDefaultWorkUnitDB();
  const wuSlugs = getWorkUnitSlugs();
  for (const wuSlug of wuSlugs) {
    const existing = wuDb.getWorkUnit(wuSlug);
    if (existing)
      continue;
    const wuEvents = parseWorkUnitEvents(wuSlug);
    const startEvt = wuEvents.find((e) => e.type === "work_unit_start");
    if (!startEvt)
      continue;
    wuDb.createWorkUnit(wuSlug, startEvt.name ?? startEvt.work_unit_name ?? wuSlug, startEvt.ts ?? new Date().toISOString());
    const endEvt = wuEvents.find((e) => e.type === "work_unit_end");
    if (endEvt) {
      wuDb.endWorkUnit(wuSlug, endEvt.status ?? "completed", endEvt.ts ?? new Date().toISOString());
    }
  }
  const slugs = getPipelineSlugs();
  for (const slug of slugs) {
    const events = parsePipelineEvents(slug);
    const startEvt = events.find((e) => e.type === "pipeline_start");
    if (!startEvt)
      continue;
    let workUnitId = undefined;
    if (startEvt.work_unit_slug) {
      const wu = wuDb.getWorkUnit(startEvt.work_unit_slug);
      workUnitId = wu?.id ?? undefined;
    }
    db.upsertPipeline({
      slug,
      type: startEvt.pipeline_type ?? "unknown",
      command: startEvt.command ?? undefined,
      arguments: startEvt.arguments ?? undefined,
      started_at: startEvt.ts ?? undefined,
      work_unit_id: workUnitId
    });
    const endEvt = events.find((e) => e.type === "pipeline_end");
    if (endEvt) {
      db.updatePipelineStatus(slug, endEvt.status ?? "completed", endEvt.ts ?? null, endEvt.duration_ms ?? null);
    }
  }
}
async function handleRequest(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (method === "GET" && path === "/api/pipelines") {
    const db = getDefaultDB();
    const dbPipelines = db.getPipelines();
    const dbMap = new Map(dbPipelines.map((p) => [p.slug, p]));
    const pipelines = dbPipelines.map((p) => {
      const summary = db.getPipelineSummary(p.id);
      return {
        slug: p.slug,
        pipeline_type: p.type ?? "unknown",
        started_at: p.started_at ?? null,
        last_event_at: p.updated_at ?? p.started_at ?? null,
        work_unit_slug: null,
        status: p.status ?? "active",
        task_summary: summary
      };
    });
    const wuDb = getDefaultWorkUnitDB();
    const allWorkUnits = wuDb.getWorkUnits();
    const wuById = new Map(allWorkUnits.map((wu) => [wu.id, wu]));
    for (const p of pipelines) {
      const dbRow = dbMap.get(p.slug);
      if (dbRow?.work_unit_id) {
        const wu = wuById.get(dbRow.work_unit_id);
        p.work_unit_slug = wu?.slug ?? null;
      }
    }
    const jsonlSlugs = getPipelineSlugs();
    for (const slug of jsonlSlugs) {
      if (dbMap.has(slug))
        continue;
      const events = parsePipelineEvents(slug);
      const startEvent = events.find((e) => e.type === "pipeline_start");
      const lastEvent = events[events.length - 1];
      pipelines.push({
        slug,
        pipeline_type: startEvent?.pipeline_type ?? "unknown",
        started_at: startEvent?.ts ?? null,
        last_event_at: lastEvent?.ts ?? null,
        work_unit_slug: startEvent?.work_unit_slug ?? null,
        status: events.some((e) => e.type === "pipeline_end") ? "completed" : "active",
        task_summary: { total: 0, backlog: 0, in_progress: 0, in_review: 0, done: 0, blocked: 0, cancelled: 0 }
      });
    }
    return jsonResponse({ pipelines });
  }
  const pipelineTasksMatch = path.match(/^\/api\/pipelines\/([^/]+)\/tasks$/);
  if (method === "GET" && pipelineTasksMatch) {
    const slug = decodeURIComponent(pipelineTasksMatch[1]);
    const db = getDefaultDB();
    const pipeline = db.getPipelineBySlug(slug);
    if (!pipeline) {
      const events = parsePipelineEvents(slug);
      if (events.length === 0) {
        return errorResponse(`Pipeline not found: ${slug}`, 404);
      }
      return jsonResponse({ pipeline_slug: slug, tasks: [], count: 0 });
    }
    const tasks = db.getTasksByPipelineId(pipeline.id);
    const summary = db.getPipelineSummary(pipeline.id);
    return jsonResponse({ pipeline_slug: slug, tasks, count: tasks.length, summary });
  }
  const pipelineDetailMatch = path.match(/^\/api\/pipelines\/([^/]+)$/);
  if (method === "GET" && pipelineDetailMatch) {
    const slug = decodeURIComponent(pipelineDetailMatch[1]);
    const db = getDefaultDB();
    const pipeline = db.getPipelineBySlug(slug);
    if (pipeline) {
      const tasks = db.getTasksByPipelineId(pipeline.id);
      const summary = db.getPipelineSummary(pipeline.id);
      const events2 = parsePipelineEvents(slug);
      return jsonResponse({ slug, pipeline, events: events2, tasks, summary });
    }
    const events = parsePipelineEvents(slug);
    if (events.length === 0) {
      return errorResponse(`Pipeline not found: ${slug}`, 404);
    }
    return jsonResponse({ slug, pipeline: null, events, tasks: [], summary: { total: 0, backlog: 0, in_progress: 0, in_review: 0, done: 0, blocked: 0, cancelled: 0 } });
  }
  if (method === "GET" && path === "/api/tasks") {
    const pipelineSlug = url.searchParams.get("pipeline");
    const status = url.searchParams.get("status");
    const db = getDefaultDB();
    if (!pipelineSlug) {
      return errorResponse("pipeline query parameter is required");
    }
    const pipeline = db.getPipelineBySlug(pipelineSlug);
    if (!pipeline) {
      return jsonResponse({ tasks: [], count: 0 });
    }
    const tasks = status ? db.getTasksByStatus(pipeline.id, status) : db.getTasksByPipelineId(pipeline.id);
    return jsonResponse({ tasks, count: tasks.length });
  }
  const taskPatchMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
  if (method === "PATCH" && taskPatchMatch) {
    const taskId = taskPatchMatch[1];
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    if (!body.status) {
      return errorResponse("status is required in body");
    }
    const db = getDefaultDB();
    const task = db.getTask(taskId);
    if (!task) {
      return errorResponse(`Task not found: ${taskId}`, 404);
    }
    if (body.status === "in_progress" && task.status === "backlog") {
      const runId = body.run_id ?? `api-${Date.now()}`;
      const agentSlug = body.agent_slug ?? "api";
      const ok = db.checkoutTask(taskId, runId, agentSlug);
      if (!ok) {
        return errorResponse("Task already checked out or not in backlog", 409);
      }
    } else {
      db.updateTaskStatus(taskId, body.status, body.agent_slug ?? "api", body.run_id);
    }
    const updatedTask = db.getTask(taskId);
    if (updatedTask) {
      const pipelineForTask = db.getPipelines().find((p) => p.id === updatedTask.pipeline_id);
      const pipelineSlugForSse = pipelineForTask?.slug ?? updatedTask.pipeline_id;
      pushSseEvent(pipelineSlugForSse, "task_updated", updatedTask);
    }
    return jsonResponse({ task: updatedTask });
  }
  if (method === "GET" && path === "/api/agents") {
    const slugs = getAgentSlugs();
    const agents = slugs.map((slug) => parseAgentInfo(slug));
    return jsonResponse({ agents, count: agents.length });
  }
  const agentStatusMatch = path.match(/^\/api\/agents\/([^/]+)\/status$/);
  if (method === "GET" && agentStatusMatch) {
    const slug = agentStatusMatch[1];
    const slugs = getPipelineSlugs();
    let lastEvent = null;
    let pipelineSlug = null;
    for (const ps of slugs) {
      const events = parsePipelineEvents(ps);
      const agentEvents = events.filter((e) => (e.type === "agent_start" || e.type === "agent_end") && (e.agent_type === slug || e.call_id?.toString().includes(slug)));
      if (agentEvents.length > 0) {
        lastEvent = agentEvents[agentEvents.length - 1];
        pipelineSlug = ps;
      }
    }
    if (!lastEvent) {
      return jsonResponse({ slug, status: "idle", last_event: null });
    }
    const status = lastEvent.type === "agent_start" ? "running" : lastEvent.is_error ? "error" : "idle";
    return jsonResponse({
      slug,
      status,
      pipeline_slug: pipelineSlug,
      last_event: lastEvent
    });
  }
  if (method === "GET" && path === "/api/events/stream") {
    const pipelineParam = url.searchParams.get("pipeline") ?? "global";
    const agentParam = url.searchParams.get("agent");
    const broker = getBroker();
    const stream = broker.createStream({
      pipeline: pipelineParam !== "global" ? pipelineParam : undefined,
      agent: agentParam ?? undefined
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsHeaders()
      }
    });
  }
  if (method === "GET" && path === "/api/workunits/active") {
    const wuSlugs = getWorkUnitSlugs();
    const db = getDefaultDB();
    const active = wuSlugs.map((wuSlug) => {
      const events = parseWorkUnitEvents(wuSlug);
      const startEvent = events.find((e) => e.type === "work_unit_start");
      const endEvent = events.find((e) => e.type === "work_unit_end");
      if (!startEvent || endEvent)
        return null;
      const dbPipelines = getDefaultDB().getWorkUnitPipelines(wuSlug);
      let pipelineCount = dbPipelines.length;
      if (pipelineCount === 0) {
        const pipelineSlugs = getPipelineSlugs();
        pipelineCount = pipelineSlugs.filter((ps) => {
          const pEvents = parsePipelineEvents(ps);
          const pStart = pEvents.find((e) => e.type === "pipeline_start");
          return pStart?.work_unit_slug === wuSlug;
        }).length;
      }
      return {
        slug: wuSlug,
        name: startEvent.name ?? wuSlug,
        status: "active",
        startedAt: startEvent.ts ?? null,
        endedAt: null,
        pipelineCount
      };
    }).filter(Boolean);
    return jsonResponse({ workunits: active });
  }
  if (method === "GET" && path === "/api/workunits") {
    const wuSlugs = getWorkUnitSlugs();
    const deletedWuSlugs = new Set(getDefaultWorkUnitDB().getWorkUnits().filter((wu) => wu.deleted_at != null).map((wu) => wu.slug));
    const workunits = wuSlugs.filter((wuSlug) => !deletedWuSlugs.has(wuSlug)).map((wuSlug) => {
      const events = parseWorkUnitEvents(wuSlug);
      const startEvent = events.find((e) => e.type === "work_unit_start");
      const endEvent = events.find((e) => e.type === "work_unit_end");
      const dbPipelines = getDefaultDB().getWorkUnitPipelines(wuSlug);
      let linkedCount = dbPipelines.length;
      if (linkedCount === 0) {
        const pipelineSlugs = getPipelineSlugs();
        linkedCount = pipelineSlugs.filter((ps) => {
          const pEvents = parsePipelineEvents(ps);
          const pStart = pEvents.find((e) => e.type === "pipeline_start");
          return pStart?.work_unit_slug === wuSlug;
        }).length;
      }
      return {
        slug: wuSlug,
        name: startEvent?.name ?? wuSlug,
        status: endEvent ? "completed" : startEvent ? "active" : "unknown",
        startedAt: startEvent?.ts ?? null,
        endedAt: endEvent?.ts ?? null,
        pipelineCount: linkedCount
      };
    });
    return jsonResponse({ workunits });
  }
  const workunitDetailMatch = path.match(/^\/api\/workunits\/([^/]+)$/);
  if (method === "GET" && workunitDetailMatch) {
    const wuSlug = decodeURIComponent(workunitDetailMatch[1]);
    const events = parseWorkUnitEvents(wuSlug);
    if (events.length === 0) {
      return errorResponse(`Work unit not found: ${wuSlug}`, 404);
    }
    const startEvent = events.find((e) => e.type === "work_unit_start");
    const endEvent = events.find((e) => e.type === "work_unit_end");
    let pipelines = [];
    try {
      const dbRows = getDefaultDB().getWorkUnitPipelines(wuSlug);
      if (dbRows.length > 0) {
        pipelines = dbRows.map((row) => {
          const pEvents = parsePipelineEvents(row.slug);
          const pStart = pEvents.find((e) => e.type === "pipeline_start");
          const pEnd = pEvents.filter((e) => e.type === "pipeline_end").pop();
          return {
            slug: row.slug,
            type: row.type ?? pStart?.pipeline_type ?? "unknown",
            linkedAt: row.created_at ?? null,
            status: row.status ?? (pEnd ? pEnd.status : "active"),
            id: row.id ?? null,
            totalSteps: row.total_steps ?? 0,
            completedSteps: row.completed_steps ?? 0,
            failedSteps: row.failed_steps ?? 0,
            durationMs: row.duration_ms ?? null,
            command: row.command ?? null,
            arguments: row.arguments ?? null
          };
        });
      }
    } catch {}
    if (pipelines.length === 0) {
      const pipelineSlugs = getPipelineSlugs();
      const fallbackDb = getDefaultDB();
      pipelines = pipelineSlugs.map((ps) => {
        const pEvents = parsePipelineEvents(ps);
        const pStart = pEvents.find((e) => e.type === "pipeline_start");
        if (pStart?.work_unit_slug !== wuSlug)
          return null;
        const pEnd = pEvents.filter((e) => e.type === "pipeline_end").pop();
        const dbRow = fallbackDb.getPipelineBySlug(ps);
        return {
          slug: ps,
          type: pStart.pipeline_type ?? "unknown",
          linkedAt: pStart.ts ?? null,
          status: pEnd ? pEnd.status : "active",
          id: dbRow?.id ?? null,
          totalSteps: dbRow?.total_steps ?? 0,
          completedSteps: dbRow?.completed_steps ?? 0,
          failedSteps: dbRow?.failed_steps ?? 0,
          durationMs: dbRow?.duration_ms ?? null,
          command: dbRow?.command ?? null,
          arguments: dbRow?.arguments ?? null
        };
      }).filter((p) => p !== null);
    }
    const db = getDefaultDB();
    let taskSummary = { total: 0, backlog: 0, in_progress: 0, in_review: 0, done: 0, blocked: 0, cancelled: 0 };
    for (const p of pipelines) {
      const dbPipeline = db.getPipelineBySlug(p.slug);
      if (dbPipeline) {
        const s = db.getPipelineSummary(dbPipeline.id);
        taskSummary = {
          total: taskSummary.total + s.total,
          backlog: taskSummary.backlog + s.backlog,
          in_progress: taskSummary.in_progress + s.in_progress,
          in_review: taskSummary.in_review + (s.in_review ?? 0),
          done: taskSummary.done + s.done,
          blocked: taskSummary.blocked + s.blocked,
          cancelled: taskSummary.cancelled + s.cancelled
        };
      }
    }
    return jsonResponse({
      slug: wuSlug,
      name: startEvent?.name ?? wuSlug,
      status: endEvent ? "completed" : startEvent ? "active" : "unknown",
      startedAt: startEvent?.ts ?? null,
      endedAt: endEvent?.ts ?? null,
      events,
      pipelines,
      task_summary: taskSummary
    });
  }
  const workunitTasksMatch = path.match(/^\/api\/workunits\/([^/]+)\/tasks$/);
  if (method === "GET" && workunitTasksMatch) {
    const wuSlug = decodeURIComponent(workunitTasksMatch[1]);
    const events = parseWorkUnitEvents(wuSlug);
    if (events.length === 0) {
      return errorResponse(`Work unit not found: ${wuSlug}`, 404);
    }
    const db = getDefaultDB();
    const dbPipelines = getDefaultDB().getWorkUnitPipelines(wuSlug);
    let pipelinesWithTasks;
    if (dbPipelines.length > 0) {
      pipelinesWithTasks = dbPipelines.map((p) => ({
        slug: p.slug,
        tasks: db.getTasksByPipelineId(p.id)
      }));
    } else {
      const pipelineSlugs = getPipelineSlugs().filter((ps) => {
        const pEvents = parsePipelineEvents(ps);
        const pStart = pEvents.find((e) => e.type === "pipeline_start");
        return pStart?.work_unit_slug === wuSlug;
      });
      pipelinesWithTasks = pipelineSlugs.map((ps) => {
        const pipeline = db.getPipelineBySlug(ps);
        return {
          slug: ps,
          tasks: pipeline ? db.getTasksByPipelineId(pipeline.id) : []
        };
      });
    }
    const allTasks = pipelinesWithTasks.flatMap((p) => p.tasks);
    const summary = {
      backlog: allTasks.filter((t) => t.status === "backlog").length,
      in_progress: allTasks.filter((t) => t.status === "in_progress").length,
      in_review: allTasks.filter((t) => t.status === "in_review").length,
      done: allTasks.filter((t) => t.status === "done").length,
      blocked: allTasks.filter((t) => t.status === "blocked").length,
      cancelled: allTasks.filter((t) => t.status === "cancelled").length
    };
    return jsonResponse({
      work_unit_slug: wuSlug,
      pipelines: pipelinesWithTasks,
      total_count: allTasks.length,
      summary
    });
  }
  const workunitAgentsActiveMatch = path.match(/^\/api\/workunits\/([^/]+)\/agents\/active$/);
  if (method === "GET" && workunitAgentsActiveMatch) {
    const wuSlug = decodeURIComponent(workunitAgentsActiveMatch[1]);
    const wuEvents = parseWorkUnitEvents(wuSlug);
    if (wuEvents.length === 0) {
      return errorResponse(`Work unit not found: ${wuSlug}`, 404);
    }
    const dbPipelines = getDefaultDB().getWorkUnitPipelines(wuSlug);
    let pipelineSlugs;
    if (dbPipelines.length > 0) {
      pipelineSlugs = dbPipelines.map((p) => p.slug);
    } else {
      pipelineSlugs = getPipelineSlugs().filter((ps) => {
        const pEvents = parsePipelineEvents(ps);
        const pStart = pEvents.find((e) => e.type === "pipeline_start");
        return pStart?.work_unit_slug === wuSlug;
      });
    }
    const activeAgents = [];
    for (const ps of pipelineSlugs) {
      const pEvents = parsePipelineEvents(ps);
      const startEvents = pEvents.filter((e) => e.type === "agent_start" && e.call_id);
      for (const se of startEvents) {
        const hasEnd = pEvents.some((e) => e.type === "agent_end" && e.call_id === se.call_id);
        if (!hasEnd) {
          const pipelineEnded = pEvents.some((e) => e.type === "pipeline_end");
          if (!pipelineEnded) {
            activeAgents.push({
              call_id: se.call_id,
              agent_type: se.agent_type ?? "unknown",
              pipeline_slug: ps,
              started_at: se.ts ?? null
            });
          }
        }
      }
    }
    return jsonResponse({ work_unit_slug: wuSlug, active_agents: activeAgents });
  }
  const workunitAgentsMatch = path.match(/^\/api\/workunits\/([^/]+)\/agents$/);
  if (method === "GET" && workunitAgentsMatch) {
    const wuSlug = decodeURIComponent(workunitAgentsMatch[1]);
    const wuEvents = parseWorkUnitEvents(wuSlug);
    if (wuEvents.length === 0) {
      return errorResponse(`Work unit not found: ${wuSlug}`, 404);
    }
    const dbPipelines = getDefaultDB().getWorkUnitPipelines(wuSlug);
    let pipelineSlugs;
    if (dbPipelines.length > 0) {
      pipelineSlugs = dbPipelines.map((p) => p.slug);
    } else {
      pipelineSlugs = getPipelineSlugs().filter((ps) => {
        const pEvents = parsePipelineEvents(ps);
        const pStart = pEvents.find((e) => e.type === "pipeline_start");
        return pStart?.work_unit_slug === wuSlug;
      });
    }
    const agentStatsMap = new Map;
    for (const ps of pipelineSlugs) {
      const pEvents = parsePipelineEvents(ps);
      const agentEndEvents = pEvents.filter((e) => e.type === "agent_end");
      for (const ae of agentEndEvents) {
        const agentType = ae.agent_type ?? "unknown";
        const existing = agentStatsMap.get(agentType) ?? { call_count: 0, error_count: 0, total_duration_ms: 0, duration_count: 0 };
        existing.call_count += 1;
        if (ae.is_error)
          existing.error_count += 1;
        const dur = ae.duration_ms;
        if (dur != null) {
          existing.total_duration_ms += dur;
          existing.duration_count += 1;
        }
        agentStatsMap.set(agentType, existing);
      }
    }
    const stats = Array.from(agentStatsMap.entries()).map(([agent_type, s]) => ({
      agent_type,
      call_count: s.call_count,
      error_count: s.error_count,
      avg_duration_ms: s.duration_count > 0 ? Math.round(s.total_duration_ms / s.duration_count) : null
    })).sort((a, b) => b.call_count - a.call_count);
    const activeAgents = [];
    for (const ps of pipelineSlugs) {
      const pEvents = parsePipelineEvents(ps);
      const startEvents = pEvents.filter((e) => e.type === "agent_start" && e.call_id);
      for (const se of startEvents) {
        const hasEnd = pEvents.some((e) => e.type === "agent_end" && e.call_id === se.call_id);
        if (!hasEnd) {
          const pipelineEnded = pEvents.some((e) => e.type === "pipeline_end");
          if (!pipelineEnded) {
            activeAgents.push({
              call_id: se.call_id,
              agent_type: se.agent_type ?? "unknown",
              pipeline_slug: ps,
              started_at: se.ts ?? null
            });
          }
        }
      }
    }
    return jsonResponse({ work_unit_slug: wuSlug, stats, active_agents: activeAgents });
  }
  const workunitRetroMatch = path.match(/^\/api\/workunits\/([^/]+)\/retro$/);
  if (method === "GET" && workunitRetroMatch) {
    const wuSlug = decodeURIComponent(workunitRetroMatch[1]);
    const wuEvents = parseWorkUnitEvents(wuSlug);
    if (wuEvents.length === 0) {
      return errorResponse(`Work unit not found: ${wuSlug}`, 404);
    }
    const dbPipelines = getDefaultDB().getWorkUnitPipelines(wuSlug);
    let pipelineSlugs;
    if (dbPipelines.length > 0) {
      pipelineSlugs = dbPipelines.map((p) => p.slug);
    } else {
      pipelineSlugs = getPipelineSlugs().filter((ps) => {
        const pEvents = parsePipelineEvents(ps);
        const pStart = pEvents.find((e) => e.type === "pipeline_start");
        return pStart?.work_unit_slug === wuSlug;
      });
    }
    let autoSummary = null;
    if (pipelineSlugs.length > 0) {
      const pipelinesData = [];
      const agentStatsMap = new Map;
      const uniqueAgentTypes = new Set;
      let totalAgentCalls = 0;
      let totalAgentErrors = 0;
      let totalDurationMs = 0;
      let completedCount = 0;
      let failedCount = 0;
      let activeCount = 0;
      for (const ps of pipelineSlugs) {
        const pEvents = parsePipelineEvents(ps);
        const pStart = pEvents.find((e) => e.type === "pipeline_start");
        const pEnd = pEvents.find((e) => e.type === "pipeline_end");
        let status = "active";
        if (pEnd) {
          const endStatus = pEnd.status ?? "completed";
          if (endStatus === "failed")
            status = "failed";
          else if (endStatus === "paused")
            status = "paused";
          else
            status = "completed";
        }
        if (status === "completed")
          completedCount++;
        else if (status === "failed")
          failedCount++;
        else
          activeCount++;
        const startedAt = pStart?.ts ?? null;
        const endedAt = pEnd?.ts ?? null;
        let durationMs = null;
        if (startedAt && endedAt) {
          durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
          if (durationMs > 0)
            totalDurationMs += durationMs;
        }
        const stepCount = pEvents.filter((e) => e.type === "step_start").length;
        const agentEndEvents = pEvents.filter((e) => e.type === "agent_end");
        let pipelineAgentCalls = 0;
        let pipelineAgentErrors = 0;
        for (const ae of agentEndEvents) {
          const agentType = ae.agent_type ?? "unknown";
          uniqueAgentTypes.add(agentType);
          pipelineAgentCalls++;
          totalAgentCalls++;
          const isError = ae.is_error || ae.status === "error";
          if (isError) {
            pipelineAgentErrors++;
            totalAgentErrors++;
          }
          const existing = agentStatsMap.get(agentType) ?? { call_count: 0, error_count: 0, total_duration_ms: 0, duration_count: 0 };
          existing.call_count += 1;
          if (isError)
            existing.error_count += 1;
          const dur = ae.duration_ms;
          if (dur != null) {
            existing.total_duration_ms += dur;
            existing.duration_count += 1;
          }
          agentStatsMap.set(agentType, existing);
        }
        const pipelineType = pStart?.pipeline_type ?? ps.split("_")[0] ?? "unknown";
        pipelinesData.push({
          slug: ps,
          type: pipelineType,
          status,
          started_at: startedAt,
          ended_at: endedAt,
          duration_ms: durationMs,
          step_count: stepCount,
          agent_calls: pipelineAgentCalls,
          agent_errors: pipelineAgentErrors
        });
      }
      const topAgents = Array.from(agentStatsMap.entries()).map(([agent_type, s]) => ({
        agent_type,
        call_count: s.call_count,
        error_count: s.error_count,
        avg_duration_ms: s.duration_count > 0 ? Math.round(s.total_duration_ms / s.duration_count) : null
      })).sort((a, b) => b.call_count - a.call_count);
      autoSummary = {
        total_pipelines: pipelineSlugs.length,
        completed_pipelines: completedCount,
        failed_pipelines: failedCount,
        active_pipelines: activeCount,
        total_agents: uniqueAgentTypes.size,
        total_agent_calls: totalAgentCalls,
        agent_errors: totalAgentErrors,
        total_duration_ms: totalDurationMs,
        pipelines: pipelinesData,
        top_agents: topAgents
      };
    }
    return jsonResponse({
      work_unit_slug: wuSlug,
      auto_summary: autoSummary
    });
  }
  const workunitPipelinePatchMatch = path.match(/^\/api\/workunits\/([^/]+)\/pipelines\/([^/]+)$/);
  if (method === "PATCH" && workunitPipelinePatchMatch) {
    const wuSlug = decodeURIComponent(workunitPipelinePatchMatch[1]);
    const pipelineSlug = decodeURIComponent(workunitPipelinePatchMatch[2]);
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    if (!body.status || !["completed", "failed", "paused"].includes(body.status)) {
      return errorResponse("status must be 'completed', 'failed', or 'paused'");
    }
    const now = new Date().toISOString();
    const eventsFile = join3(PIPELINE_EVENTS_DIR, `${pipelineSlug}-events.jsonl`);
    if (!existsSync2(eventsFile)) {
      return errorResponse(`Pipeline not found: ${pipelineSlug}`, 404);
    }
    try {
      appendFileSync(eventsFile, JSON.stringify({
        type: "pipeline_end",
        pipeline_slug: pipelineSlug,
        work_unit_slug: wuSlug,
        status: body.status,
        forced: true,
        ts: now
      }) + `
`, "utf-8");
    } catch (err) {
      return errorResponse(`Failed to write pipeline_end: ${err}`, 500);
    }
    try {
      const db = getDefaultDB();
      db.updatePipelineStatus(pipelineSlug, body.status, now, undefined);
    } catch {}
    pushSseEvent(pipelineSlug, "pipeline_end", {
      slug: pipelineSlug,
      work_unit_slug: wuSlug,
      status: body.status,
      forced: true
    });
    return jsonResponse({ ok: true });
  }
  const workunitPatchMatch = path.match(/^\/api\/workunits\/([^/]+)$/);
  if (method === "PATCH" && workunitPatchMatch) {
    const wuSlug = decodeURIComponent(workunitPatchMatch[1]);
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    if (!body.status || !["completed", "abandoned"].includes(body.status)) {
      return errorResponse("status must be 'completed' or 'abandoned'");
    }
    if (body.status === "completed") {
      const dbPipelines = getDefaultDB().getWorkUnitPipelines(wuSlug);
      let activePipelines;
      if (dbPipelines.length > 0) {
        activePipelines = dbPipelines.filter((p) => p.status === "active" || p.status === "running").map((p) => p.slug);
      } else {
        const pipelineSlugs = getPipelineSlugs().filter((ps) => {
          const pEvents = parsePipelineEvents(ps);
          const pStart = pEvents.find((e) => e.type === "pipeline_start");
          return pStart?.work_unit_slug === wuSlug;
        });
        activePipelines = pipelineSlugs.filter((ps) => {
          const pEvents = parsePipelineEvents(ps);
          const hasStart = pEvents.some((e) => e.type === "pipeline_start");
          const hasEnd = pEvents.some((e) => e.type === "pipeline_end");
          return hasStart && !hasEnd;
        });
      }
      if (activePipelines.length > 0) {
        return errorResponse("active_pipelines_exist", 400);
      }
    }
    const db = getDefaultWorkUnitDB();
    const now = new Date().toISOString();
    db.endWorkUnit(wuSlug, body.status, now);
    const wuFile = `${PIPELINE_EVENTS_DIR}/${wuSlug}-workunit.jsonl`;
    try {
      appendFileSync(wuFile, JSON.stringify({ type: "work_unit_end", work_unit_slug: wuSlug, status: body.status, ts: now }) + `
`, "utf-8");
    } catch {}
    pushSseEvent("system", "work_unit_end", { slug: wuSlug, status: body.status });
    return jsonResponse({ ok: true });
  }
  const workunitDeleteMatch = path.match(/^\/api\/workunits\/([^/]+)$/);
  if (method === "DELETE" && workunitDeleteMatch) {
    const wuSlug = decodeURIComponent(workunitDeleteMatch[1]);
    const wuEvents = parseWorkUnitEvents(wuSlug);
    const wuDb = getDefaultWorkUnitDB();
    const wuFromDb = wuDb.getWorkUnit(wuSlug);
    if (wuEvents.length === 0 && !wuFromDb) {
      return errorResponse(`Work unit not found: ${wuSlug}`, 404);
    }
    wuDb.deleteWorkUnit(wuSlug);
    try {
      const pipelineDb = getDefaultDB();
      pipelineDb.unlinkPipelinesFromWorkUnit(wuSlug);
    } catch (orphanErr) {
      console.warn("[bams-server] orphan pipeline cleanup failed (non-fatal):", orphanErr);
    }
    const wuFile = `${PIPELINE_EVENTS_DIR}/${wuSlug}-workunit.jsonl`;
    const now = new Date().toISOString();
    try {
      appendFileSync(wuFile, JSON.stringify({ type: "work_unit_archived", work_unit_slug: wuSlug, ts: now }) + `
`, "utf-8");
    } catch {}
    pushSseEvent("system", "work_unit_archived", { slug: wuSlug });
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (method === "GET" && path === "/api/hr/reports") {
    try {
      const hrDb = getDefaultHrReportDB();
      const reports = hrDb.getHrReports();
      return jsonResponse({ reports });
    } catch (err) {
      return errorResponse(`Failed to get HR reports: ${err}`, 500);
    }
  }
  const hrReportDetailMatch = path.match(/^\/api\/hr\/reports\/([^/]+)$/);
  if (method === "GET" && hrReportDetailMatch) {
    const reportId = hrReportDetailMatch[1];
    try {
      const hrDb = getDefaultHrReportDB();
      const report = hrDb.getHrReportBySlug(reportId);
      if (!report) {
        return errorResponse(`HR report not found: ${reportId}`, 404);
      }
      return jsonResponse(report);
    } catch (err) {
      return errorResponse(`Failed to get HR report: ${err}`, 500);
    }
  }
  if (method === "GET" && path === "/health") {
    return jsonResponse({ ok: true, version: "1.0.0", port: PORT });
  }
  const runsLogsMatch = path.match(/^\/api\/runs\/([^/]+)\/logs$/);
  if (method === "GET" && runsLogsMatch) {
    const pipelineSlug = runsLogsMatch[1];
    const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
    const broker = getBroker();
    const logs = broker.getRecentLogs(pipelineSlug, limit);
    return jsonResponse({ pipeline_slug: pipelineSlug, logs, count: logs.length });
  }
  const agentLogsMatch = path.match(/^\/api\/runs\/agent\/([^/]+)\/logs$/);
  if (method === "GET" && agentLogsMatch) {
    const agentSlug = agentLogsMatch[1];
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const broker = getBroker();
    const logs = broker.getAgentLogs(agentSlug, limit);
    return jsonResponse({ agent_slug: agentSlug, logs, count: logs.length });
  }
  if (method === "POST" && path === "/api/runs/events") {
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const broker = getBroker();
    broker.pushEvent({
      type: body.type,
      pipeline_slug: body.pipeline_slug,
      agent_slug: body.agent_slug,
      run_id: body.run_id,
      ts: new Date().toISOString(),
      payload: body.payload
    });
    if (body.type === "agent_end" && body.pipeline_slug) {
      try {
        const db = getDefaultDB();
        const pipeline = db.getPipelineBySlug(body.pipeline_slug);
        if (pipeline) {
          const agentType = body.agent_type ?? body.agent_slug ?? "unknown";
          const resultSummary = body.result_summary ?? body.payload?.result_summary ?? "";
          const callId = body.call_id ?? body.payload?.call_id ?? "";
          const durationMs = body.duration_ms ?? body.payload?.duration_ms ?? null;
          const isError = body.is_error ?? body.payload?.is_error ?? false;
          const agentStatus = body.status ?? body.payload?.status ?? "success";
          const taskTitle = `[${agentType}] ${resultSummary.slice(0, 120) || "\uC791\uC5C5 \uC644\uB8CC"}`;
          const taskDesc = resultSummary || `Agent: ${agentType}, Call ID: ${callId}`;
          db.createTask({
            pipeline_id: pipeline.id,
            title: taskTitle,
            description: taskDesc,
            assignee_agent: agentType,
            label: callId || undefined,
            duration_ms: durationMs ?? undefined,
            summary: resultSummary || undefined,
            tags: [agentType, isError ? "error" : agentStatus]
          });
        } else {
          console.warn("[bams-server] task logging skipped: pipeline not in DB:", body.pipeline_slug);
        }
      } catch (taskErr) {
        console.error("[bams-server] agent_end task logging failed (non-fatal):", taskErr);
      }
    }
    if (body.type === "pipeline_end" && body.pipeline_slug) {
      try {
        const db = getDefaultDB();
        const status = body.status ?? body.payload?.status ?? "completed";
        const now = new Date().toISOString();
        db.updatePipelineStatus(body.pipeline_slug, status, now, undefined);
      } catch (dbErr) {
        console.error("[bams-server] pipeline_end DB sync failed (non-fatal):", dbErr);
      }
    }
    if (body.type === "pipeline_start" && body.pipeline_slug) {
      try {
        const db = getDefaultDB();
        const existing = db.getPipelineBySlug(body.pipeline_slug);
        if (!existing) {
          db.upsertPipeline({
            slug: body.pipeline_slug,
            type: body.payload?.pipeline_type ?? "unknown",
            status: "running",
            started_at: new Date().toISOString()
          });
        }
      } catch (dbErr) {
        console.error("[bams-server] pipeline_start DB sync failed (non-fatal):", dbErr);
      }
    }
    return jsonResponse({ ok: true }, 201);
  }
  return errorResponse(`Not found: ${method} ${path}`, 404);
}
try {
  syncPipelinesFromEvents();
  console.log("[bams-server] Pipeline sync from JSONL completed");
} catch (err) {
  console.error("[bams-server] Pipeline sync failed (non-fatal):", err);
}
var server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
  error(err) {
    console.error("[bams-server] Unhandled error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
console.log(`[bams-server] Control Plane running on http://localhost:${PORT}`);
console.log(`[bams-server] CORS allowed: * (dev mode)`);
export {
  server,
  pushSseEvent
};
