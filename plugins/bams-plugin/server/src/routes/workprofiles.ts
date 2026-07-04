/**
 * routes/workprofiles.ts
 *
 * WorkProfiles REST API (F-P3) — 5 endpoints:
 *   1) GET    /api/workprofiles              — 목록 (프리셋 3종 포함)
 *   2) POST   /api/workprofiles              — 생성 (name, stack_tags[], system_prompt_md?)
 *   3) GET    /api/workprofiles/:slug         — 상세 (project_count 포함)
 *   4) PATCH  /api/workprofiles/:slug         — 수정 (프리셋 403)
 *   5) DELETE /api/workprofiles/:slug         — 삭제 (프리셋 403, in-use 409)
 *
 * 응답 규약: 성공 시 payload, 오류 시 { error: CODE, ...detail }.
 */

import { getStoresDb } from "../stores/db.ts";
import {
  WorkProfileStore,
  serializeWorkProfile,
} from "../stores/work-profile-store.ts";
import { ProjectStore } from "../stores/project-store.ts";
import { slugify, findUniqueSlug } from "../stores/slugify.ts";
import { scanPromptContent } from "../stores/prompt-sanitizer.ts";
import {
  jsonResp,
  jsonErr,
  noContent,
  readJsonBody,
} from "../stores/http-helpers.ts";

// spec F-P3: system_prompt_md > 200KB → PROMPT_TOO_LARGE (400)
const MAX_PROMPT_BYTES = 200 * 1024;
const MAX_NAME_LEN = 200;

interface CreateWorkProfileBody {
  name?: unknown;
  slug?: unknown;
  stack_tags?: unknown;
  system_prompt_md?: unknown;
  auto_retro_enabled?: unknown;
}

interface PatchWorkProfileBody {
  name?: unknown;
  stack_tags?: unknown;
  system_prompt_md?: unknown;
  auto_retro_enabled?: unknown;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf-8");
}

export async function matchWorkProfilesRoutes(
  method: string,
  path: string,
  req: Request,
): Promise<Response | null> {
  const db = getStoresDb();
  const store = new WorkProfileStore(db);
  const projectStore = new ProjectStore(db);

  // ── GET /api/workprofiles ────────────────────────────────
  if (method === "GET" && path === "/api/workprofiles") {
    const rows = store.list();
    return jsonResp({ workprofiles: rows.map(serializeWorkProfile) });
  }

  // ── POST /api/workprofiles ───────────────────────────────
  if (method === "POST" && path === "/api/workprofiles") {
    const body = await readJsonBody<CreateWorkProfileBody>(req);
    if (!body) return jsonErr("INVALID_JSON");

    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > MAX_NAME_LEN) {
      return jsonErr("VALIDATION_FAILED", { field: "name" });
    }
    let stackTags: string[] = [];
    if (body.stack_tags !== undefined) {
      if (!isStringArray(body.stack_tags)) {
        return jsonErr("VALIDATION_FAILED", { field: "stack_tags" });
      }
      stackTags = body.stack_tags;
    }
    let systemPromptMd = "";
    if (body.system_prompt_md !== undefined) {
      if (typeof body.system_prompt_md !== "string") {
        return jsonErr("VALIDATION_FAILED", { field: "system_prompt_md" });
      }
      if (byteLength(body.system_prompt_md) > MAX_PROMPT_BYTES) {
        return jsonErr("PROMPT_TOO_LARGE", { limit_bytes: MAX_PROMPT_BYTES });
      }
      systemPromptMd = body.system_prompt_md;
    }
    let autoRetro = true;
    if (body.auto_retro_enabled !== undefined) {
      if (typeof body.auto_retro_enabled !== "boolean") {
        return jsonErr("VALIDATION_FAILED", { field: "auto_retro_enabled" });
      }
      autoRetro = body.auto_retro_enabled;
    }

    // Sanitizer 스캔 (TASK-119 이전은 no-op) — hard_blocked면 400 거부.
    const scan = scanPromptContent(systemPromptMd);
    if (scan.ok === "hard_blocked") {
      return jsonErr("PROMPT_INJECTION_BLOCKED", { markers: scan.markers });
    }
    const warnings = scan.ok === "soft_flagged" ? scan.markers : undefined;

    // slug 생성 (명시 slug 우선, 없으면 name→slugify), 프리셋 3종 이름 충돌 방지 위해 unique 접미사.
    const baseSlug =
      typeof body.slug === "string" && body.slug.trim()
        ? slugify(body.slug.trim())
        : slugify(body.name.trim());
    const uniqueSlug = findUniqueSlug(baseSlug, (s) => store.slugExists(s));

    const row = store.create({
      slug: uniqueSlug,
      name: body.name.trim(),
      stack_tags: stackTags,
      system_prompt_md: systemPromptMd,
      auto_retro_enabled: autoRetro,
    });
    return jsonResp(
      warnings
        ? { workprofile: serializeWorkProfile(row), warnings }
        : { workprofile: serializeWorkProfile(row) },
      201,
    );
  }

  // ── GET/PATCH/DELETE /api/workprofiles/:slug ─────────────
  const detailMatch = path.match(/^\/api\/workprofiles\/([^/]+)$/);
  if (!detailMatch) return null;
  const slug = decodeURIComponent(detailMatch[1]);

  if (method === "GET") {
    const row = store.get(slug);
    if (!row) return jsonErr("NOT_FOUND", { slug }, 404);
    const inUse = projectStore.listActiveByWorkProfile(slug);
    return jsonResp({
      workprofile: serializeWorkProfile(row),
      project_count: inUse.length,
    });
  }

  if (method === "PATCH") {
    const existing = store.get(slug);
    if (!existing) return jsonErr("NOT_FOUND", { slug }, 404);
    if (existing.is_preset) {
      return jsonErr("PRESET_READONLY", { slug }, 403);
    }

    const body = await readJsonBody<PatchWorkProfileBody>(req);
    if (!body) return jsonErr("INVALID_JSON");

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.length > MAX_NAME_LEN) {
        return jsonErr("VALIDATION_FAILED", { field: "name" });
      }
    }
    if (body.stack_tags !== undefined && !isStringArray(body.stack_tags)) {
      return jsonErr("VALIDATION_FAILED", { field: "stack_tags" });
    }
    if (body.system_prompt_md !== undefined) {
      if (typeof body.system_prompt_md !== "string") {
        return jsonErr("VALIDATION_FAILED", { field: "system_prompt_md" });
      }
      if (byteLength(body.system_prompt_md) > MAX_PROMPT_BYTES) {
        return jsonErr("PROMPT_TOO_LARGE", { limit_bytes: MAX_PROMPT_BYTES });
      }
      const scan = scanPromptContent(body.system_prompt_md);
      if (scan.ok === "hard_blocked") {
        return jsonErr("PROMPT_INJECTION_BLOCKED", { markers: scan.markers });
      }
    }
    if (body.auto_retro_enabled !== undefined && typeof body.auto_retro_enabled !== "boolean") {
      return jsonErr("VALIDATION_FAILED", { field: "auto_retro_enabled" });
    }

    const updated = store.update(slug, {
      name: typeof body.name === "string" ? body.name.trim() : undefined,
      stack_tags: isStringArray(body.stack_tags) ? body.stack_tags : undefined,
      system_prompt_md:
        typeof body.system_prompt_md === "string" ? body.system_prompt_md : undefined,
      auto_retro_enabled:
        typeof body.auto_retro_enabled === "boolean" ? body.auto_retro_enabled : undefined,
    });
    if (!updated) return jsonErr("NOT_FOUND", { slug }, 404);
    return jsonResp({ workprofile: serializeWorkProfile(updated) });
  }

  if (method === "DELETE") {
    const existing = store.get(slug);
    if (!existing) return jsonErr("NOT_FOUND", { slug }, 404);
    if (existing.is_preset) {
      return jsonErr("PRESET_READONLY", { slug }, 403);
    }
    const inUse = projectStore.listActiveByWorkProfile(slug);
    if (inUse.length > 0) {
      return jsonErr("IN_USE", { project_slugs: inUse }, 409);
    }
    store.delete(slug);
    return noContent();
  }

  return null;
}
