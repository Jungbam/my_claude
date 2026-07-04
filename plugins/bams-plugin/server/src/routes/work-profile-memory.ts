/**
 * routes/work-profile-memory.ts
 *
 * WorkProfileMemory REST API (F-P4) — 4 endpoints:
 *   1) GET  /api/workprofiles/:slug/memories                  — 목록 (?kind=&alive=true)
 *   2) POST /api/workprofiles/:slug/memories                  — 생성 (kind, title, body_md, source?)
 *   3) PATCH /api/workprofiles/:slug/memories/:id             — 수정
 *   4) POST /api/workprofiles/:slug/memories/:id/decay        — soft delete
 *
 * F-P4 상한: body_md 100KB → MEMORY_TOO_LARGE (400).
 * decay된 항목 재수정 → 409 MEMORY_DECAYED.
 * Sanitizer 훅 — TASK-119 이전은 no-op.
 */

import { getStoresDb } from "../stores/db.ts";
import { WorkProfileStore } from "../stores/work-profile-store.ts";
import {
  WorkProfileMemoryStore,
  serializeMemory,
} from "../stores/work-profile-memory-store.ts";
import { scanPromptContent } from "../stores/prompt-sanitizer.ts";
import {
  jsonResp,
  jsonErr,
  readJsonBody,
} from "../stores/http-helpers.ts";
import type { WorkProfileMemoryKind } from "../../../tools/bams-db/schema.ts";

const MAX_MEMORY_BODY_BYTES = 100 * 1024;
const MAX_TITLE_LEN = 300;
const VALID_KINDS: readonly WorkProfileMemoryKind[] = [
  "learned-pattern",
  "gotcha",
  "gold-snippet",
] as const;

interface CreateMemoryBody {
  kind?: unknown;
  title?: unknown;
  body_md?: unknown;
  source?: unknown;
}

interface PatchMemoryBody {
  kind?: unknown;
  title?: unknown;
  body_md?: unknown;
}

function isValidKind(v: unknown): v is WorkProfileMemoryKind {
  return typeof v === "string" && (VALID_KINDS as readonly string[]).includes(v);
}
function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf-8");
}

export async function matchWorkProfileMemoryRoutes(
  method: string,
  path: string,
  req: Request,
  url: URL,
): Promise<Response | null> {
  const db = getStoresDb();
  const workProfileStore = new WorkProfileStore(db);
  const memoryStore = new WorkProfileMemoryStore(db);

  // Memory list / create — /api/workprofiles/:slug/memories
  const listMatch = path.match(/^\/api\/workprofiles\/([^/]+)\/memories$/);
  if (listMatch) {
    const slug = decodeURIComponent(listMatch[1]);
    const wp = workProfileStore.get(slug);
    if (!wp) return jsonErr("WORK_PROFILE_NOT_FOUND", { slug }, 404);

    if (method === "GET") {
      const kindParam = url.searchParams.get("kind");
      const kind = kindParam && isValidKind(kindParam) ? kindParam : undefined;
      const aliveOnly = url.searchParams.get("alive") === "true";
      const rows = memoryStore.list(slug, { kind, alive_only: aliveOnly });
      return jsonResp({ memories: rows.map(serializeMemory) });
    }

    if (method === "POST") {
      const body = await readJsonBody<CreateMemoryBody>(req);
      if (!body) return jsonErr("INVALID_JSON");
      if (!isValidKind(body.kind)) {
        return jsonErr("VALIDATION_FAILED", { field: "kind" });
      }
      if (typeof body.title !== "string" || !body.title.trim() || body.title.length > MAX_TITLE_LEN) {
        return jsonErr("VALIDATION_FAILED", { field: "title" });
      }
      if (typeof body.body_md !== "string") {
        return jsonErr("VALIDATION_FAILED", { field: "body_md" });
      }
      if (byteLength(body.body_md) > MAX_MEMORY_BODY_BYTES) {
        return jsonErr("MEMORY_TOO_LARGE", { limit_bytes: MAX_MEMORY_BODY_BYTES });
      }
      const sourceStr =
        typeof body.source === "string" && body.source.trim() ? body.source.trim() : "manual";

      const scan = scanPromptContent(body.body_md);
      if (scan.ok === "hard_blocked") {
        return jsonErr("PROMPT_INJECTION_BLOCKED", { markers: scan.markers });
      }
      const warnings =
        scan.ok === "soft_flagged"
          ? [{ code: "PROMPT_INJECTION_FLAGGED", markers: scan.markers }]
          : undefined;

      const row = memoryStore.create({
        work_profile_slug: slug,
        kind: body.kind,
        title: body.title.trim(),
        body_md: body.body_md,
        source: sourceStr,
      });
      return jsonResp(
        warnings
          ? { memory: serializeMemory(row), warnings }
          : { memory: serializeMemory(row) },
        201,
      );
    }
  }

  // Memory decay — /api/workprofiles/:slug/memories/:id/decay
  const decayMatch = path.match(/^\/api\/workprofiles\/([^/]+)\/memories\/([^/]+)\/decay$/);
  if (method === "POST" && decayMatch) {
    const slug = decodeURIComponent(decayMatch[1]);
    const memId = decodeURIComponent(decayMatch[2]);
    const wp = workProfileStore.get(slug);
    if (!wp) return jsonErr("WORK_PROFILE_NOT_FOUND", { slug }, 404);
    const mem = memoryStore.get(memId);
    if (!mem || mem.work_profile_slug !== slug) {
      return jsonErr("NOT_FOUND", { memory_id: memId }, 404);
    }
    if (mem.decayed_at !== null) {
      return jsonErr("MEMORY_DECAYED", { memory_id: memId }, 409);
    }
    memoryStore.decay(memId);
    const updated = memoryStore.get(memId);
    return jsonResp({ memory: updated ? serializeMemory(updated) : null });
  }

  // Memory PATCH — /api/workprofiles/:slug/memories/:id
  const detailMatch = path.match(/^\/api\/workprofiles\/([^/]+)\/memories\/([^/]+)$/);
  if (method === "PATCH" && detailMatch) {
    const slug = decodeURIComponent(detailMatch[1]);
    const memId = decodeURIComponent(detailMatch[2]);
    const wp = workProfileStore.get(slug);
    if (!wp) return jsonErr("WORK_PROFILE_NOT_FOUND", { slug }, 404);
    const mem = memoryStore.get(memId);
    if (!mem || mem.work_profile_slug !== slug) {
      return jsonErr("NOT_FOUND", { memory_id: memId }, 404);
    }
    if (mem.decayed_at !== null) {
      return jsonErr("MEMORY_DECAYED", { memory_id: memId }, 409);
    }

    const body = await readJsonBody<PatchMemoryBody>(req);
    if (!body) return jsonErr("INVALID_JSON");
    if (body.kind !== undefined && !isValidKind(body.kind)) {
      return jsonErr("VALIDATION_FAILED", { field: "kind" });
    }
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim() || body.title.length > MAX_TITLE_LEN) {
        return jsonErr("VALIDATION_FAILED", { field: "title" });
      }
    }
    if (body.body_md !== undefined) {
      if (typeof body.body_md !== "string") {
        return jsonErr("VALIDATION_FAILED", { field: "body_md" });
      }
      if (byteLength(body.body_md) > MAX_MEMORY_BODY_BYTES) {
        return jsonErr("MEMORY_TOO_LARGE", { limit_bytes: MAX_MEMORY_BODY_BYTES });
      }
      const scan = scanPromptContent(body.body_md);
      if (scan.ok === "hard_blocked") {
        return jsonErr("PROMPT_INJECTION_BLOCKED", { markers: scan.markers });
      }
    }
    const updated = memoryStore.update(memId, {
      kind: isValidKind(body.kind) ? body.kind : undefined,
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      body_md: typeof body.body_md === "string" ? body.body_md : undefined,
    });
    if (!updated) return jsonErr("NOT_FOUND", { memory_id: memId }, 404);
    return jsonResp({ memory: serializeMemory(updated) });
  }

  return null;
}
