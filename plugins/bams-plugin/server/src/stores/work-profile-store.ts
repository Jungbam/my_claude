/**
 * stores/work-profile-store.ts
 *
 * work_profiles 테이블 CRUD. 프리셋 3종은 스키마 시드 시 삽입되며 `is_preset=1`.
 * PATCH/DELETE 프리셋 시도 → 403 PRESET_READONLY (routes 계층에서 판단).
 */

import type { Database } from "bun:sqlite";
import type { WorkProfileRow } from "../../../tools/bams-db/schema.ts";

export interface CreateWorkProfileInput {
  slug: string;
  name: string;
  stack_tags?: string[];
  system_prompt_md?: string;
  auto_retro_enabled?: boolean;
}

export interface UpdateWorkProfileInput {
  name?: string;
  stack_tags?: string[];
  system_prompt_md?: string;
  auto_retro_enabled?: boolean;
}

export class WorkProfileStore {
  constructor(private db: Database) {}

  list(): WorkProfileRow[] {
    return this.db
      .prepare<WorkProfileRow>("SELECT * FROM work_profiles ORDER BY is_preset DESC, created_at ASC")
      .all();
  }

  get(slug: string): WorkProfileRow | null {
    return (
      this.db
        .prepare<WorkProfileRow>("SELECT * FROM work_profiles WHERE slug = ?")
        .get(slug) ?? null
    );
  }

  slugExists(slug: string): boolean {
    return !!this.db
      .prepare<{ slug: string }>("SELECT slug FROM work_profiles WHERE slug = ?")
      .get(slug);
  }

  create(input: CreateWorkProfileInput): WorkProfileRow {
    this.db
      .prepare(
        `INSERT INTO work_profiles
           (slug, name, stack_tags, system_prompt_md, auto_retro_enabled, is_preset)
         VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .run(
        input.slug,
        input.name,
        JSON.stringify(input.stack_tags ?? []),
        input.system_prompt_md ?? "",
        input.auto_retro_enabled === false ? 0 : 1,
      );
    const row = this.get(input.slug);
    if (!row) throw new Error(`WorkProfileStore.create: row missing after insert: ${input.slug}`);
    return row;
  }

  update(slug: string, patch: UpdateWorkProfileInput): WorkProfileRow | null {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (patch.name !== undefined) {
      sets.push("name = ?");
      params.push(patch.name);
    }
    if (patch.stack_tags !== undefined) {
      sets.push("stack_tags = ?");
      params.push(JSON.stringify(patch.stack_tags));
    }
    if (patch.system_prompt_md !== undefined) {
      sets.push("system_prompt_md = ?");
      params.push(patch.system_prompt_md);
    }
    if (patch.auto_retro_enabled !== undefined) {
      sets.push("auto_retro_enabled = ?");
      params.push(patch.auto_retro_enabled ? 1 : 0);
    }
    if (sets.length === 0) return this.get(slug);
    sets.push("updated_at = datetime('now')");
    const sql = `UPDATE work_profiles SET ${sets.join(", ")} WHERE slug = ?`;
    params.push(slug);
    this.db.prepare(sql).run(...params);
    return this.get(slug);
  }

  /**
   * DELETE(하드) — routes 계층에서 사전에 프리셋/사용중 검사를 통과한 경우에만 호출.
   */
  delete(slug: string): boolean {
    const res = this.db
      .prepare("DELETE FROM work_profiles WHERE slug = ?")
      .run(slug);
    return res.changes === 1;
  }
}

/**
 * WorkProfileRow → HTTP 응답. stack_tags는 JSON 파싱, boolean 필드는 실제 boolean으로.
 */
export function serializeWorkProfile(row: WorkProfileRow): Record<string, unknown> {
  let stackTags: string[] = [];
  try {
    const parsed = JSON.parse(row.stack_tags);
    if (Array.isArray(parsed)) stackTags = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* ignore malformed JSON */
  }
  return {
    slug: row.slug,
    name: row.name,
    stack_tags: stackTags,
    system_prompt_md: row.system_prompt_md,
    auto_retro_enabled: !!row.auto_retro_enabled,
    is_preset: !!row.is_preset,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
