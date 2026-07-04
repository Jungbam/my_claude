/**
 * routes/project-rules.ts
 *
 * ProjectRules REST API (F-P5) — 4 endpoints:
 *   1) GET    /api/projects/:slug/rules          — 목록 (?kind=must-read|pref|style)
 *   2) POST   /api/projects/:slug/rules          — 생성 (kind, title, body_md, ordering?)
 *   3) PATCH  /api/projects/:slug/rules/:id      — 수정
 *   4) DELETE /api/projects/:slug/rules/:id      — 삭제
 *
 * F-P5 body_md 상한: 50KB.
 * F-P5 pref 20건 상한 warning: 저장은 성공하되 응답에 warnings 포함.
 * Sanitizer(§NF-SEC-5) 훅: scanPromptContent — TASK-119 이전은 no-op(패스).
 */

import { getStoresDb } from "../stores/db.ts";
import { ProjectStore } from "../stores/project-store.ts";
import {
  ProjectRuleStore,
  serializeProjectRule,
} from "../stores/project-rule-store.ts";
import { scanPromptContent } from "../stores/prompt-sanitizer.ts";
import {
  jsonResp,
  jsonErr,
  noContent,
  readJsonBody,
} from "../stores/http-helpers.ts";
import type { ProjectRuleKind } from "../../../tools/bams-db/schema.ts";

const MAX_RULE_BODY_BYTES = 50 * 1024;
const MAX_TITLE_LEN = 300;
const VALID_KINDS: readonly ProjectRuleKind[] = ["must-read", "pref", "style"] as const;
const PREF_WARNING_THRESHOLD = 20;

interface CreateRuleBody {
  kind?: unknown;
  title?: unknown;
  body_md?: unknown;
  ordering?: unknown;
}

interface PatchRuleBody {
  kind?: unknown;
  title?: unknown;
  body_md?: unknown;
  ordering?: unknown;
}

function isValidKind(v: unknown): v is ProjectRuleKind {
  return typeof v === "string" && (VALID_KINDS as readonly string[]).includes(v);
}

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf-8");
}

export async function matchProjectRulesRoutes(
  method: string,
  path: string,
  req: Request,
  url: URL,
): Promise<Response | null> {
  const db = getStoresDb();
  const projectStore = new ProjectStore(db);
  const ruleStore = new ProjectRuleStore(db);

  // Rules list / create — /api/projects/:slug/rules
  const listMatch = path.match(/^\/api\/projects\/([^/]+)\/rules$/);
  if (listMatch) {
    const projectSlug = decodeURIComponent(listMatch[1]);
    const project = projectStore.get(projectSlug);
    if (!project) return jsonErr("NOT_FOUND", { slug: projectSlug }, 404);

    if (method === "GET") {
      const kindParam = url.searchParams.get("kind");
      const kind = kindParam && isValidKind(kindParam) ? kindParam : undefined;
      const rows = ruleStore.list(projectSlug, { kind });
      return jsonResp({ rules: rows.map(serializeProjectRule) });
    }

    if (method === "POST") {
      if (project.archived_at !== null) {
        return jsonErr("PROJECT_ARCHIVED", { slug: projectSlug }, 409);
      }
      const body = await readJsonBody<CreateRuleBody>(req);
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
      if (byteLength(body.body_md) > MAX_RULE_BODY_BYTES) {
        return jsonErr("RULE_TOO_LARGE", { limit_bytes: MAX_RULE_BODY_BYTES });
      }
      if (body.ordering !== undefined && typeof body.ordering !== "number") {
        return jsonErr("VALIDATION_FAILED", { field: "ordering" });
      }

      // Sanitizer 훅 (TASK-119 이전은 no-op)
      const scan = scanPromptContent(body.body_md);
      if (scan.ok === "hard_blocked") {
        return jsonErr("PROMPT_INJECTION_BLOCKED", { markers: scan.markers });
      }

      const warnings: Array<Record<string, unknown>> = [];
      if (scan.ok === "soft_flagged") {
        warnings.push({ code: "PROMPT_INJECTION_FLAGGED", markers: scan.markers });
      }
      // pref 20건 상한 경고
      if (body.kind === "pref") {
        const count = ruleStore.countByKind(projectSlug, "pref");
        if (count >= PREF_WARNING_THRESHOLD) {
          warnings.push({
            code: "PREF_OVER_LIMIT",
            message: "Older pref rules will be summarized during injection.",
            current_count: count,
            limit: PREF_WARNING_THRESHOLD,
          });
        }
      }

      const row = ruleStore.create({
        project_slug: projectSlug,
        kind: body.kind,
        title: body.title.trim(),
        body_md: body.body_md,
        ordering: typeof body.ordering === "number" ? body.ordering : 0,
      });
      return jsonResp(
        warnings.length > 0
          ? { rule: serializeProjectRule(row), warnings }
          : { rule: serializeProjectRule(row) },
        201,
      );
    }
  }

  // Rules PATCH / DELETE — /api/projects/:slug/rules/:id
  const detailMatch = path.match(/^\/api\/projects\/([^/]+)\/rules\/([^/]+)$/);
  if (detailMatch) {
    const projectSlug = decodeURIComponent(detailMatch[1]);
    const ruleId = decodeURIComponent(detailMatch[2]);
    const project = projectStore.get(projectSlug);
    if (!project) return jsonErr("NOT_FOUND", { slug: projectSlug }, 404);
    const rule = ruleStore.get(ruleId);
    if (!rule || rule.project_slug !== projectSlug) {
      return jsonErr("NOT_FOUND", { rule_id: ruleId }, 404);
    }

    if (method === "PATCH") {
      const body = await readJsonBody<PatchRuleBody>(req);
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
        if (byteLength(body.body_md) > MAX_RULE_BODY_BYTES) {
          return jsonErr("RULE_TOO_LARGE", { limit_bytes: MAX_RULE_BODY_BYTES });
        }
        const scan = scanPromptContent(body.body_md);
        if (scan.ok === "hard_blocked") {
          return jsonErr("PROMPT_INJECTION_BLOCKED", { markers: scan.markers });
        }
      }
      if (body.ordering !== undefined && typeof body.ordering !== "number") {
        return jsonErr("VALIDATION_FAILED", { field: "ordering" });
      }

      const updated = ruleStore.update(ruleId, {
        kind: isValidKind(body.kind) ? body.kind : undefined,
        title: typeof body.title === "string" ? body.title.trim() : undefined,
        body_md: typeof body.body_md === "string" ? body.body_md : undefined,
        ordering: typeof body.ordering === "number" ? body.ordering : undefined,
      });
      if (!updated) return jsonErr("NOT_FOUND", { rule_id: ruleId }, 404);
      return jsonResp({ rule: serializeProjectRule(updated) });
    }

    if (method === "DELETE") {
      ruleStore.delete(ruleId);
      return noContent();
    }
  }

  return null;
}
