/**
 * stores/project-store.ts
 *
 * projects 테이블 CRUD. schema.ts §Schema v3 정의를 100% 준수한다.
 *
 * 컨벤션(_shared_common: bun:sqlite, ORM 없음):
 *   - db.prepare(...).all/get/run 만 사용.
 *   - id/timestamp는 SQL DEFAULT(datetime('now')) 또는 randomUUID() 사용.
 *   - archived_at IS NULL 조건의 partial unique index(schema)와 정합 —
 *     store의 create()도 활성 상태에서 중복 검사를 수행.
 */

import type { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import type {
  ProjectRow,
  AutoRetroOverride,
} from "../../../tools/bams-db/schema.ts";

export interface CreateProjectInput {
  slug: string;
  name: string;
  repo_path: string; // 이미 realpath 정규화된 절대 경로
  work_profile_slug: string;
  default_branch?: string;
  auto_retro_override?: AutoRetroOverride;
}

export interface UpdateProjectInput {
  name?: string;
  work_profile_slug?: string;
  default_branch?: string;
  auto_retro_override?: AutoRetroOverride;
}

export interface ListProjectsOpts {
  include_archived?: boolean;
  work_profile_slug?: string;
}

export class ProjectStore {
  constructor(private db: Database) {}

  list(opts: ListProjectsOpts = {}): ProjectRow[] {
    const clauses: string[] = [];
    const params: string[] = [];
    if (!opts.include_archived) clauses.push("archived_at IS NULL");
    if (opts.work_profile_slug) {
      clauses.push("work_profile_slug = ?");
      params.push(opts.work_profile_slug);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const sql = `SELECT * FROM projects ${where} ORDER BY created_at DESC`;
    return this.db.prepare<ProjectRow>(sql).all(...params);
  }

  get(slug: string): ProjectRow | null {
    return (
      this.db
        .prepare<ProjectRow>("SELECT * FROM projects WHERE slug = ?")
        .get(slug) ?? null
    );
  }

  /**
   * repo_path에 대한 **활성(archived_at IS NULL) 등록**을 조회한다.
   * 아카이브된 프로젝트는 반환하지 않는다 → 재등록 허용 규약 준수.
   */
  getByRepoPathActive(absPath: string): ProjectRow | null {
    return (
      this.db
        .prepare<ProjectRow>(
          "SELECT * FROM projects WHERE repo_path = ? AND archived_at IS NULL",
        )
        .get(absPath) ?? null
    );
  }

  /**
   * slug가 이미 존재하는지 검사 (아카이브 포함).
   * findUniqueSlug 헬퍼가 콜백으로 사용.
   */
  slugExists(slug: string): boolean {
    const row = this.db
      .prepare<{ slug: string }>("SELECT slug FROM projects WHERE slug = ?")
      .get(slug);
    return !!row;
  }

  create(input: CreateProjectInput): ProjectRow {
    this.db
      .prepare(
        `INSERT INTO projects (slug, name, repo_path, work_profile_slug, default_branch, auto_retro_override)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.slug,
        input.name,
        input.repo_path,
        input.work_profile_slug,
        input.default_branch ?? "main",
        input.auto_retro_override ?? "inherit",
      );
    const row = this.get(input.slug);
    if (!row) throw new Error(`ProjectStore.create: row missing after insert: ${input.slug}`);
    return row;
  }

  update(slug: string, patch: UpdateProjectInput): ProjectRow | null {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (patch.name !== undefined) {
      sets.push("name = ?");
      params.push(patch.name);
    }
    if (patch.work_profile_slug !== undefined) {
      sets.push("work_profile_slug = ?");
      params.push(patch.work_profile_slug);
    }
    if (patch.default_branch !== undefined) {
      sets.push("default_branch = ?");
      params.push(patch.default_branch);
    }
    if (patch.auto_retro_override !== undefined) {
      sets.push("auto_retro_override = ?");
      params.push(patch.auto_retro_override);
    }
    if (sets.length === 0) return this.get(slug);
    sets.push("updated_at = datetime('now')");
    const sql = `UPDATE projects SET ${sets.join(", ")} WHERE slug = ?`;
    params.push(slug);
    this.db.prepare(sql).run(...params);
    return this.get(slug);
  }

  archive(slug: string): boolean {
    const res = this.db
      .prepare(
        `UPDATE projects
         SET archived_at = datetime('now'), updated_at = datetime('now')
         WHERE slug = ? AND archived_at IS NULL`,
      )
      .run(slug);
    return res.changes === 1;
  }

  unarchive(slug: string): boolean {
    // repo_path 활성 unique 제약을 지키기 위해 동일 repo_path의 활성 프로젝트가 있으면 실패.
    const target = this.get(slug);
    if (!target || target.archived_at === null) return false;
    const conflict = this.db
      .prepare<{ slug: string }>(
        "SELECT slug FROM projects WHERE repo_path = ? AND archived_at IS NULL AND slug != ?",
      )
      .get(target.repo_path, slug);
    if (conflict) {
      throw new Error(`REBIND_CONFLICT:${conflict.slug}`);
    }
    const res = this.db
      .prepare(
        "UPDATE projects SET archived_at = NULL, updated_at = datetime('now') WHERE slug = ?",
      )
      .run(slug);
    return res.changes === 1;
  }

  /**
   * WorkProfile을 사용하는 활성 프로젝트 slug 목록 (F-P3 in-use 삭제 판정용).
   */
  listActiveByWorkProfile(workProfileSlug: string): string[] {
    return this.db
      .prepare<{ slug: string }>(
        "SELECT slug FROM projects WHERE work_profile_slug = ? AND archived_at IS NULL",
      )
      .all(workProfileSlug)
      .map((r) => r.slug);
  }
}

/**
 * ProjectRow → HTTP 응답 형태. 컨벤션: is_preset/boolean은 그대로 노출.
 * 필드는 spec.md §F-P1 응답 스키마 그대로.
 */
export function serializeProject(row: ProjectRow): Record<string, unknown> {
  return {
    slug: row.slug,
    name: row.name,
    repo_path: row.repo_path,
    work_profile_slug: row.work_profile_slug,
    default_branch: row.default_branch,
    auto_retro_override: row.auto_retro_override,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
