/**
 * routes/projects.ts
 *
 * Projects REST API (F-P1 + F-P8 pipelines 조회) — 7 endpoints:
 *   1) GET    /api/projects                     — 목록 (?include_archived=&work_profile_slug=)
 *   2) POST   /api/projects                     — 등록 (validateRepoPath + .git 확인 + 중복/WP 검사)
 *   3) GET    /api/projects/:slug               — 상세
 *   4) PATCH  /api/projects/:slug                — 수정 (name/work_profile_slug/default_branch/auto_retro_override)
 *   5) POST   /api/projects/:slug/archive        — 아카이브
 *   6) POST   /api/projects/:slug/unarchive      — 아카이브 해제
 *   7) GET    /api/projects/:slug/pipelines      — 프로젝트 스코프 파이프라인 (F-P8)
 *
 * 응답 규약: 성공 시 payload, 오류 시 { error: CODE, ...detail }.
 */

import { existsSync } from "fs";
import { join } from "path";
import { getStoresDb } from "../stores/db.ts";
import {
  ProjectStore,
  serializeProject,
} from "../stores/project-store.ts";
import { WorkProfileStore } from "../stores/work-profile-store.ts";
import { ProjectRuleStore } from "../stores/project-rule-store.ts";
import { validateRepoPath } from "../stores/validate-repo-path.ts";
import { slugify, findUniqueSlug } from "../stores/slugify.ts";
import {
  jsonResp,
  jsonErr,
  noContent,
  readJsonBody,
} from "../stores/http-helpers.ts";

// F-P1 상한: PROMPT_TOO_LARGE 등 body 크기 검사에 재사용
const MAX_NAME_LEN = 200;

interface CreateProjectBody {
  repo_path?: unknown;
  name?: unknown;
  work_profile_slug?: unknown;
  default_branch?: unknown;
  auto_retro_override?: unknown;
}

interface PatchProjectBody {
  name?: unknown;
  work_profile_slug?: unknown;
  default_branch?: unknown;
  auto_retro_override?: unknown;
}

function isValidAutoRetro(v: unknown): v is "inherit" | "on" | "off" {
  return v === "inherit" || v === "on" || v === "off";
}

export async function matchProjectsRoutes(
  method: string,
  path: string,
  req: Request,
  url: URL,
): Promise<Response | null> {
  const db = getStoresDb();
  const projectStore = new ProjectStore(db);
  const workProfileStore = new WorkProfileStore(db);
  const ruleStore = new ProjectRuleStore(db);

  // ── GET /api/projects ─────────────────────────────────────
  if (method === "GET" && path === "/api/projects") {
    const includeArchived = url.searchParams.get("include_archived") === "true";
    const workProfileSlug = url.searchParams.get("work_profile_slug") ?? undefined;
    const rows = projectStore.list({
      include_archived: includeArchived,
      work_profile_slug: workProfileSlug ?? undefined,
    });
    return jsonResp({ projects: rows.map(serializeProject) });
  }

  // ── POST /api/projects ────────────────────────────────────
  if (method === "POST" && path === "/api/projects") {
    const body = await readJsonBody<CreateProjectBody>(req);
    if (!body) return jsonErr("INVALID_JSON");

    // 1) work_profile_slug 필수 존재
    if (typeof body.work_profile_slug !== "string" || !body.work_profile_slug) {
      return jsonErr("VALIDATION_FAILED", { field: "work_profile_slug" });
    }
    // 2) repo_path validateRepoPath (spec §1-2)
    const pathResult = validateRepoPath(body.repo_path);
    if (!pathResult.ok) {
      return jsonErr(pathResult.reason, { path: body.repo_path ?? null });
    }
    const absPath = pathResult.absolute;

    // 3) .git 존재 확인 — 없으면 allow_non_git 쿼리 없을 시 400
    const isGitRepo = existsSync(join(absPath, ".git"));
    const allowNonGit = url.searchParams.get("allow_non_git") === "true";
    if (!isGitRepo && !allowNonGit) {
      return jsonErr("NOT_A_GIT_REPO", {
        suggestion: "retry with ?allow_non_git=true",
      });
    }

    // 4) work_profile 존재
    if (!workProfileStore.get(body.work_profile_slug)) {
      return jsonErr("WORK_PROFILE_NOT_FOUND", { slug: body.work_profile_slug });
    }

    // 5) 중복 등록(활성) 검사
    const existing = projectStore.getByRepoPathActive(absPath);
    if (existing) {
      return jsonErr(
        "ALREADY_REGISTERED",
        { existing_slug: existing.slug },
        409,
      );
    }

    // 6) name / auto_retro_override 검증
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.length > MAX_NAME_LEN) {
        return jsonErr("VALIDATION_FAILED", { field: "name" });
      }
    }
    if (body.default_branch !== undefined) {
      if (typeof body.default_branch !== "string" || body.default_branch.length > 100) {
        return jsonErr("VALIDATION_FAILED", { field: "default_branch" });
      }
    }
    if (body.auto_retro_override !== undefined && !isValidAutoRetro(body.auto_retro_override)) {
      return jsonErr("VALIDATION_FAILED", { field: "auto_retro_override" });
    }

    // 7) slug 생성 — name → slugify, 없으면 basename(absPath)
    const nameCandidate =
      (typeof body.name === "string" && body.name.trim())
        ? body.name.trim()
        : absPath.split("/").pop() || "project";
    const baseSlug = slugify(nameCandidate);
    const uniqueSlug = findUniqueSlug(baseSlug, (s) => projectStore.slugExists(s));

    // 8) INSERT
    const row = projectStore.create({
      slug: uniqueSlug,
      name: nameCandidate,
      repo_path: absPath,
      work_profile_slug: body.work_profile_slug,
      default_branch: typeof body.default_branch === "string" ? body.default_branch : undefined,
      auto_retro_override: isValidAutoRetro(body.auto_retro_override)
        ? body.auto_retro_override
        : undefined,
    });

    return jsonResp({ project: serializeProject(row) }, 201);
  }

  // ── GET /api/projects/:slug/pipelines (F-P8) ──────────────
  // NOTE: 더 구체적 경로 — /:slug 매칭 앞에 위치
  const pipelinesMatch = path.match(/^\/api\/projects\/([^/]+)\/pipelines$/);
  if (method === "GET" && pipelinesMatch) {
    const slug = decodeURIComponent(pipelinesMatch[1]);
    const project = projectStore.get(slug);
    if (!project) return jsonErr("NOT_FOUND", { slug }, 404);

    // F-P8: pipelines.project_slug = ? OR (project_slug IS NULL AND WU가 이 프로젝트) 폴백.
    // TASK-118 시점에는 project_slug FK만 사용. WU-project mapping은 후속.
    const rows = db
      .prepare<{
        id: string;
        slug: string;
        type: string;
        status: string;
        started_at: string | null;
        ended_at: string | null;
      }>(
        `SELECT id, slug, type, status, started_at, ended_at
         FROM pipelines
         WHERE project_slug = ?
         ORDER BY created_at DESC
         LIMIT 100`,
      )
      .all(slug);
    return jsonResp({ project_slug: slug, pipelines: rows });
  }

  // ── POST /api/projects/:slug/archive ─────────────────────
  const archiveMatch = path.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (method === "POST" && archiveMatch) {
    const slug = decodeURIComponent(archiveMatch[1]);
    const project = projectStore.get(slug);
    if (!project) return jsonErr("NOT_FOUND", { slug }, 404);
    if (project.archived_at !== null) {
      return jsonErr("PROJECT_ARCHIVED", { slug }, 409);
    }
    projectStore.archive(slug);
    return noContent();
  }

  // ── POST /api/projects/:slug/unarchive ───────────────────
  const unarchiveMatch = path.match(/^\/api\/projects\/([^/]+)\/unarchive$/);
  if (method === "POST" && unarchiveMatch) {
    const slug = decodeURIComponent(unarchiveMatch[1]);
    const project = projectStore.get(slug);
    if (!project) return jsonErr("NOT_FOUND", { slug }, 404);
    if (project.archived_at === null) {
      return jsonErr("NOT_ARCHIVED", { slug }, 409);
    }
    try {
      projectStore.unarchive(slug);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("REBIND_CONFLICT:")) {
        return jsonErr(
          "ALREADY_REGISTERED",
          { existing_slug: msg.split(":")[1] ?? null },
          409,
        );
      }
      throw err;
    }
    return noContent();
  }

  // ── GET /api/projects/:slug ──────────────────────────────
  const detailMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (method === "GET" && detailMatch) {
    const slug = decodeURIComponent(detailMatch[1]);
    const project = projectStore.get(slug);
    if (!project) return jsonErr("NOT_FOUND", { slug }, 404);

    // rule_count_by_kind
    const rules = ruleStore.list(slug);
    const ruleCountByKind = { "must-read": 0, pref: 0, style: 0 } as Record<string, number>;
    for (const r of rules) {
      ruleCountByKind[r.kind] = (ruleCountByKind[r.kind] ?? 0) + 1;
    }

    // pipeline_count
    const pipeCountRow = db
      .prepare<{ n: number }>(
        "SELECT COUNT(*) AS n FROM pipelines WHERE project_slug = ?",
      )
      .get(slug);

    return jsonResp({
      project: serializeProject(project),
      rule_count_by_kind: ruleCountByKind,
      pipeline_count: pipeCountRow?.n ?? 0,
    });
  }

  // ── PATCH /api/projects/:slug ────────────────────────────
  if (method === "PATCH" && detailMatch) {
    const slug = decodeURIComponent(detailMatch[1]);
    const existing = projectStore.get(slug);
    if (!existing) return jsonErr("NOT_FOUND", { slug }, 404);
    if (existing.archived_at !== null) {
      return jsonErr("PROJECT_ARCHIVED", { slug }, 409);
    }

    const body = await readJsonBody<PatchProjectBody>(req);
    if (!body) return jsonErr("INVALID_JSON");

    // work_profile_slug 참조 무결성 검사
    if (body.work_profile_slug !== undefined) {
      if (typeof body.work_profile_slug !== "string") {
        return jsonErr("VALIDATION_FAILED", { field: "work_profile_slug" });
      }
      if (!workProfileStore.get(body.work_profile_slug)) {
        return jsonErr("WORK_PROFILE_NOT_FOUND", { slug: body.work_profile_slug });
      }
    }
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.length > MAX_NAME_LEN) {
        return jsonErr("VALIDATION_FAILED", { field: "name" });
      }
    }
    if (body.default_branch !== undefined) {
      if (typeof body.default_branch !== "string" || body.default_branch.length > 100) {
        return jsonErr("VALIDATION_FAILED", { field: "default_branch" });
      }
    }
    if (body.auto_retro_override !== undefined && !isValidAutoRetro(body.auto_retro_override)) {
      return jsonErr("VALIDATION_FAILED", { field: "auto_retro_override" });
    }

    const updated = projectStore.update(slug, {
      name: typeof body.name === "string" ? body.name : undefined,
      work_profile_slug:
        typeof body.work_profile_slug === "string" ? body.work_profile_slug : undefined,
      default_branch:
        typeof body.default_branch === "string" ? body.default_branch : undefined,
      auto_retro_override: isValidAutoRetro(body.auto_retro_override)
        ? body.auto_retro_override
        : undefined,
    });
    if (!updated) return jsonErr("NOT_FOUND", { slug }, 404);
    return jsonResp({ project: serializeProject(updated) });
  }

  return null;
}
