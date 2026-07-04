/**
 * stores/project-rule-store.ts
 *
 * project_rules 테이블 CRUD. kind ∈ must-read|pref|style.
 * F-P5: pref 20건 상한 경고는 KnowledgeLoader(TASK-119)에서 처리 —
 *       store 계층은 저장/조회만 담당한다.
 */

import type { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import type {
  ProjectRuleRow,
  ProjectRuleKind,
} from "../../../tools/bams-db/schema.ts";

export interface CreateProjectRuleInput {
  project_slug: string;
  kind: ProjectRuleKind;
  title: string;
  body_md: string;
  ordering?: number;
}

export interface UpdateProjectRuleInput {
  kind?: ProjectRuleKind;
  title?: string;
  body_md?: string;
  ordering?: number;
}

export interface ListRulesOpts {
  kind?: ProjectRuleKind;
}

export class ProjectRuleStore {
  constructor(private db: Database) {}

  list(projectSlug: string, opts: ListRulesOpts = {}): ProjectRuleRow[] {
    if (opts.kind) {
      return this.db
        .prepare<ProjectRuleRow>(
          `SELECT * FROM project_rules
           WHERE project_slug = ? AND kind = ?
           ORDER BY ordering ASC, created_at ASC`,
        )
        .all(projectSlug, opts.kind);
    }
    return this.db
      .prepare<ProjectRuleRow>(
        `SELECT * FROM project_rules
         WHERE project_slug = ?
         ORDER BY kind ASC, ordering ASC, created_at ASC`,
      )
      .all(projectSlug);
  }

  get(id: string): ProjectRuleRow | null {
    return (
      this.db
        .prepare<ProjectRuleRow>("SELECT * FROM project_rules WHERE id = ?")
        .get(id) ?? null
    );
  }

  create(input: CreateProjectRuleInput): ProjectRuleRow {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO project_rules (id, project_slug, kind, title, body_md, ordering)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_slug,
        input.kind,
        input.title,
        input.body_md,
        input.ordering ?? 0,
      );
    const row = this.get(id);
    if (!row) throw new Error(`ProjectRuleStore.create: row missing after insert: ${id}`);
    return row;
  }

  update(id: string, patch: UpdateProjectRuleInput): ProjectRuleRow | null {
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
    if (patch.ordering !== undefined) {
      sets.push("ordering = ?");
      params.push(patch.ordering);
    }
    if (sets.length === 0) return this.get(id);
    sets.push("updated_at = datetime('now')");
    const sql = `UPDATE project_rules SET ${sets.join(", ")} WHERE id = ?`;
    params.push(id);
    this.db.prepare(sql).run(...params);
    return this.get(id);
  }

  delete(id: string): boolean {
    const res = this.db
      .prepare("DELETE FROM project_rules WHERE id = ?")
      .run(id);
    return res.changes === 1;
  }

  /** kind='pref' 활성 룰 카운트 — F-P5 warning 판정용. */
  countByKind(projectSlug: string, kind: ProjectRuleKind): number {
    const row = this.db
      .prepare<{ n: number }>(
        "SELECT COUNT(*) AS n FROM project_rules WHERE project_slug = ? AND kind = ?",
      )
      .get(projectSlug, kind);
    return row?.n ?? 0;
  }
}

export function serializeProjectRule(row: ProjectRuleRow): Record<string, unknown> {
  return {
    id: row.id,
    project_slug: row.project_slug,
    kind: row.kind,
    title: row.title,
    body_md: row.body_md,
    ordering: row.ordering,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
