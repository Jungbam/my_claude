/**
 * stores/work-profile-memory-store.ts
 *
 * work_profile_memories 테이블 CRUD + decay(soft delete).
 * kind ∈ learned-pattern|gotcha|gold-snippet.
 */

import type { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import type {
  WorkProfileMemoryRow,
  WorkProfileMemoryKind,
} from "../../../tools/bams-db/schema.ts";

export interface CreateMemoryInput {
  work_profile_slug: string;
  kind: WorkProfileMemoryKind;
  source: string;
  title: string;
  body_md: string;
}

export interface UpdateMemoryInput {
  kind?: WorkProfileMemoryKind;
  title?: string;
  body_md?: string;
}

export interface ListMemoriesOpts {
  kind?: WorkProfileMemoryKind;
  alive_only?: boolean; // decayed_at IS NULL
}

export class WorkProfileMemoryStore {
  constructor(private db: Database) {}

  list(workProfileSlug: string, opts: ListMemoriesOpts = {}): WorkProfileMemoryRow[] {
    const clauses = ["work_profile_slug = ?"];
    const params: (string | number)[] = [workProfileSlug];
    if (opts.kind) {
      clauses.push("kind = ?");
      params.push(opts.kind);
    }
    if (opts.alive_only) {
      clauses.push("decayed_at IS NULL");
    }
    const sql = `SELECT * FROM work_profile_memories
                 WHERE ${clauses.join(" AND ")}
                 ORDER BY created_at DESC`;
    return this.db.prepare<WorkProfileMemoryRow>(sql).all(...params);
  }

  get(id: string): WorkProfileMemoryRow | null {
    return (
      this.db
        .prepare<WorkProfileMemoryRow>(
          "SELECT * FROM work_profile_memories WHERE id = ?",
        )
        .get(id) ?? null
    );
  }

  create(input: CreateMemoryInput): WorkProfileMemoryRow {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO work_profile_memories
           (id, work_profile_slug, kind, source, title, body_md)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.work_profile_slug, input.kind, input.source, input.title, input.body_md);
    const row = this.get(id);
    if (!row) throw new Error(`WorkProfileMemoryStore.create: row missing after insert: ${id}`);
    return row;
  }

  update(id: string, patch: UpdateMemoryInput): WorkProfileMemoryRow | null {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (patch.kind !== undefined) {
      sets.push("kind = ?");
      params.push(patch.kind);
    }
    if (patch.title !== undefined) {
      sets.push("title = ?");
      params.push(patch.title);
    }
    if (patch.body_md !== undefined) {
      sets.push("body_md = ?");
      params.push(patch.body_md);
    }
    if (sets.length === 0) return this.get(id);
    const sql = `UPDATE work_profile_memories SET ${sets.join(", ")} WHERE id = ?`;
    params.push(id);
    this.db.prepare(sql).run(...params);
    return this.get(id);
  }

  /** decay — soft delete. 이미 decay된 항목은 no-op. */
  decay(id: string): boolean {
    const res = this.db
      .prepare(
        "UPDATE work_profile_memories SET decayed_at = datetime('now') WHERE id = ? AND decayed_at IS NULL",
      )
      .run(id);
    return res.changes === 1;
  }
}

export function serializeMemory(row: WorkProfileMemoryRow): Record<string, unknown> {
  return {
    id: row.id,
    work_profile_slug: row.work_profile_slug,
    kind: row.kind,
    source: row.source,
    title: row.title,
    body_md: row.body_md,
    created_at: row.created_at,
    decayed_at: row.decayed_at,
  };
}
