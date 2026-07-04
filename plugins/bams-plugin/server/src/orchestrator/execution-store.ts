/**
 * orchestrator/execution-store.ts
 *
 * execution_sessions 테이블 CRUD + 상태 머신 조회.
 *
 * spec.md §2 F-P6 status:
 *   pending_confirmation | queued | running | completed | failed | cancelled | aborted | orphaned
 *
 * design-be §4-7 Session ↔ Pipeline 매핑:
 *   session_id는 UUID, spawn 시 BAMS_SESSION_ID env로 child에 주입.
 *   child가 pipeline_start emit 시 payload에 session_id를 포함 → linkPipeline() 호출.
 *
 * 컨벤션: bun:sqlite prepared statements, ORM 없음.
 */

import type { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import type {
  ExecutionSessionRow,
  ExecutionSessionStatus,
} from "../../../tools/bams-db/schema.ts";

export interface CreateExecutionInput {
  project_slug: string;
  work_profile_slug: string | null;
  command: string;
  argv: string[];
  status: ExecutionSessionStatus; // pending_confirmation | queued
  stash_ref?: string | null;
  stdout_ring_key?: string | null;
}

export interface UpdateExecutionInput {
  status?: ExecutionSessionStatus;
  pid?: number | null;
  pipeline_slug?: string | null;
  stash_ref?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  exit_code?: number | null;
  stdout_ring_key?: string | null;
}

export interface ListExecutionsOpts {
  project_slug?: string;
  status?: ExecutionSessionStatus | ExecutionSessionStatus[];
  limit?: number;
}

export class ExecutionSessionStore {
  constructor(private db: Database) {}

  create(input: CreateExecutionInput): ExecutionSessionRow {
    const id = randomUUID();
    const spawnNonce = randomUUID();
    this.db
      .prepare(
        `INSERT INTO execution_sessions
           (id, project_slug, work_profile_slug, command, argv_json, status,
            spawn_nonce, stash_ref, stdout_ring_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_slug,
        input.work_profile_slug,
        input.command,
        JSON.stringify(input.argv),
        input.status,
        spawnNonce,
        input.stash_ref ?? null,
        input.stdout_ring_key ?? null,
      );
    const row = this.get(id);
    if (!row) {
      throw new Error(`ExecutionSessionStore.create: row missing after insert: ${id}`);
    }
    return row;
  }

  get(id: string): ExecutionSessionRow | null {
    return (
      this.db
        .prepare<ExecutionSessionRow>("SELECT * FROM execution_sessions WHERE id = ?")
        .get(id) ?? null
    );
  }

  update(id: string, patch: UpdateExecutionInput): ExecutionSessionRow | null {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (patch.status !== undefined) {
      sets.push("status = ?");
      params.push(patch.status);
    }
    if (patch.pid !== undefined) {
      sets.push("pid = ?");
      params.push(patch.pid);
    }
    if (patch.pipeline_slug !== undefined) {
      sets.push("pipeline_slug = ?");
      params.push(patch.pipeline_slug);
    }
    if (patch.stash_ref !== undefined) {
      sets.push("stash_ref = ?");
      params.push(patch.stash_ref);
    }
    if (patch.started_at !== undefined) {
      sets.push("started_at = ?");
      params.push(patch.started_at);
    }
    if (patch.ended_at !== undefined) {
      sets.push("ended_at = ?");
      params.push(patch.ended_at);
    }
    if (patch.exit_code !== undefined) {
      sets.push("exit_code = ?");
      params.push(patch.exit_code);
    }
    if (patch.stdout_ring_key !== undefined) {
      sets.push("stdout_ring_key = ?");
      params.push(patch.stdout_ring_key);
    }
    if (sets.length === 0) return this.get(id);
    sets.push("updated_at = datetime('now')");
    const sql = `UPDATE execution_sessions SET ${sets.join(", ")} WHERE id = ?`;
    params.push(id);
    this.db.prepare(sql).run(...params);
    return this.get(id);
  }

  /**
   * pipeline_slug 매핑 (design-be §4-7).
   * 이미 다른 pipeline_slug가 채워져 있으면 no-op (nested spawn 첫 관측만 반영).
   */
  linkPipeline(id: string, pipelineSlug: string): boolean {
    const res = this.db
      .prepare(
        `UPDATE execution_sessions
         SET pipeline_slug = ?, updated_at = datetime('now')
         WHERE id = ? AND pipeline_slug IS NULL`,
      )
      .run(pipelineSlug, id);
    return res.changes === 1;
  }

  list(opts: ListExecutionsOpts = {}): ExecutionSessionRow[] {
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (opts.project_slug) {
      clauses.push("project_slug = ?");
      params.push(opts.project_slug);
    }
    if (opts.status) {
      if (Array.isArray(opts.status)) {
        if (opts.status.length === 0) return [];
        const placeholders = opts.status.map(() => "?").join(",");
        clauses.push(`status IN (${placeholders})`);
        params.push(...opts.status);
      } else {
        clauses.push("status = ?");
        params.push(opts.status);
      }
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 500) : 100;
    const sql = `SELECT * FROM execution_sessions ${where} ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);
    return this.db.prepare<ExecutionSessionRow>(sql).all(...params);
  }

  /**
   * NF-SEC-7 동시 실행 상한 판정용 — 활성(queued|running) 세션 카운트.
   */
  countActive(): number {
    const row = this.db
      .prepare<{ n: number }>(
        `SELECT COUNT(*) AS n FROM execution_sessions WHERE status IN ('queued','running')`,
      )
      .get();
    return row?.n ?? 0;
  }

  /**
   * 특정 프로젝트의 활성 세션 카운트 — UI 뱃지 렌더링용.
   */
  countActiveByProject(projectSlug: string): number {
    const row = this.db
      .prepare<{ n: number }>(
        `SELECT COUNT(*) AS n FROM execution_sessions
         WHERE project_slug = ? AND status IN ('queued','running')`,
      )
      .get(projectSlug);
    return row?.n ?? 0;
  }
}

/**
 * ExecutionSessionRow → HTTP 응답. argv_json은 파싱하여 배열로 노출.
 * spawn_nonce는 외부 노출 불필요 → 응답에 미포함.
 */
export function serializeExecution(row: ExecutionSessionRow): Record<string, unknown> {
  let argv: string[] = [];
  if (row.argv_json) {
    try {
      const parsed = JSON.parse(row.argv_json);
      if (Array.isArray(parsed)) argv = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      /* ignore */
    }
  }
  return {
    id: row.id,
    project_slug: row.project_slug,
    work_profile_slug: row.work_profile_slug,
    pipeline_slug: row.pipeline_slug,
    command: row.command,
    argv,
    status: row.status,
    pid: row.pid,
    stash_ref: row.stash_ref,
    started_at: row.started_at,
    ended_at: row.ended_at,
    exit_code: row.exit_code,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
