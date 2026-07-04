/**
 * routes/executions.ts
 *
 * ExecutionSessions REST API — 6 endpoints:
 *   1) POST /api/projects/:slug/executions  — 실행 트리거 (spec §F-P6)
 *   2) GET  /api/executions                  — 목록 (?project=&status=&limit=)
 *   3) GET  /api/executions/:id              — 상세
 *   4) GET  /api/executions/:id/stream       — SSE 스트림 (기존 broker 재사용)
 *   5) GET  /api/executions/:id/logs?tail=N  — ring buffer tail 조회
 *   6) POST /api/executions/:id/abort        — SIGTERM 15s grace → SIGKILL (F-P7)
 *
 * 응답 규약: 성공 시 payload, 오류 시 { error: CODE, ...detail }.
 */

import { getStoresDb } from "../stores/db.ts";
import {
  ExecutionSessionStore,
  serializeExecution,
} from "../orchestrator/execution-store.ts";
import {
  getExecutionOrchestrator,
  MAX_CONCURRENT_ACTIVE,
} from "../orchestrator/execution-orchestrator.ts";
import type { UncommittedAction } from "../orchestrator/execution-orchestrator.ts";
import { getBroker } from "../sse-broker.ts";
import { jsonResp, jsonErr, readJsonBody } from "../stores/http-helpers.ts";
import type { ExecutionSessionStatus } from "../../../tools/bams-db/schema.ts";

interface CreateExecutionBody {
  command?: unknown;
  argv?: unknown;
  uncommitted_action?: unknown;
}

function isValidAction(v: unknown): v is UncommittedAction {
  return v === "proceed" || v === "stash" || v === "cancel";
}

function isValidStatus(v: string | null): v is ExecutionSessionStatus {
  if (!v) return false;
  return [
    "pending_confirmation",
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
    "aborted",
    "orphaned",
  ].includes(v);
}

/**
 * error code → HTTP status mapping (spec §F-P6 에러 시나리오).
 */
function mapErrorStatus(code: string): number {
  switch (code) {
    case "PROJECT_NOT_FOUND":
      return 404;
    case "PROJECT_ARCHIVED":
      return 409;
    case "TOO_MANY_ACTIVE_SESSIONS":
      return 429;
    case "COMMAND_NOT_ALLOWED":
    case "UNSAFE_ARGUMENT":
    case "ARGUMENT_TOO_LONG":
    case "TOO_MANY_ARGUMENTS":
    case "PATH_MISSING":
    case "PATH_ESCAPED":
      return 400;
    case "PROMPT_INJECTION_BLOCKED":
      return 400;
    default:
      return 400;
  }
}

export async function matchExecutionsRoutes(
  method: string,
  path: string,
  req: Request,
  url: URL,
): Promise<Response | null> {
  const db = getStoresDb();
  const store = new ExecutionSessionStore(db);

  // ── POST /api/projects/:slug/executions ─────────────────
  const createMatch = path.match(/^\/api\/projects\/([^/]+)\/executions$/);
  if (method === "POST" && createMatch) {
    const projectSlug = decodeURIComponent(createMatch[1]);
    const body = await readJsonBody<CreateExecutionBody>(req);
    if (!body) return jsonErr("INVALID_JSON");
    if (typeof body.command !== "string") {
      return jsonErr("VALIDATION_FAILED", { field: "command" });
    }
    if (body.argv !== undefined && !Array.isArray(body.argv)) {
      return jsonErr("VALIDATION_FAILED", { field: "argv" });
    }
    if (body.uncommitted_action !== undefined && !isValidAction(body.uncommitted_action)) {
      return jsonErr("VALIDATION_FAILED", { field: "uncommitted_action" });
    }

    const orchestrator = getExecutionOrchestrator();
    const result = await orchestrator.start({
      project_slug: projectSlug,
      command: body.command,
      argv: Array.isArray(body.argv) ? (body.argv as unknown[]) as string[] : [],
      uncommitted_action: isValidAction(body.uncommitted_action)
        ? body.uncommitted_action
        : undefined,
    });
    if ("error" in result) {
      const { code, detail, ...rest } = result.error as { code: string; detail: string };
      return jsonErr(code, { detail, ...rest }, mapErrorStatus(code));
    }
    const responseBody: Record<string, unknown> = {
      session: result.session,
      status: result.status,
      max_concurrent: MAX_CONCURRENT_ACTIVE,
    };
    if (result.prompt_stats) {
      responseBody.prompt_stats = result.prompt_stats;
    }
    // Pending confirmation → 202 (spec §1-5)
    const httpStatus = result.status === "pending_confirmation" ? 202 : 201;
    return jsonResp(responseBody, httpStatus);
  }

  // ── GET /api/executions ─────────────────────────────────
  if (method === "GET" && path === "/api/executions") {
    const projectParam = url.searchParams.get("project");
    const statusParam = url.searchParams.get("status");
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const rows = store.list({
      project_slug: projectParam ?? undefined,
      status: isValidStatus(statusParam) ? statusParam : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return jsonResp({ executions: rows.map(serializeExecution) });
  }

  // ── GET /api/executions/:id/stream (SSE) ────────────────
  const streamMatch = path.match(/^\/api\/executions\/([^/]+)\/stream$/);
  if (method === "GET" && streamMatch) {
    const sessionId = decodeURIComponent(streamMatch[1]);
    const row = store.get(sessionId);
    if (!row) return jsonErr("NOT_FOUND", { id: sessionId }, 404);
    const channel = row.pipeline_slug ?? `session:${sessionId}`;
    const broker = getBroker();
    const stream = broker.createStream({ pipeline: channel });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── GET /api/executions/:id/logs?tail=N ─────────────────
  const logsMatch = path.match(/^\/api\/executions\/([^/]+)\/logs$/);
  if (method === "GET" && logsMatch) {
    const sessionId = decodeURIComponent(logsMatch[1]);
    const row = store.get(sessionId);
    if (!row) return jsonErr("NOT_FOUND", { id: sessionId }, 404);
    const tailParam = url.searchParams.get("tail");
    const tail = tailParam ? Math.max(1, Math.min(512, parseInt(tailParam, 10) || 100)) : 100;
    const orchestrator = getExecutionOrchestrator();
    const lines = orchestrator.getLogs(sessionId, tail);
    return jsonResp({ session_id: sessionId, lines, tail });
  }

  // ── POST /api/executions/:id/abort (F-P7) ───────────────
  // 요청 규약 (spec §F-P7):
  //   Body: { confirmed: true, reason?: 'user' | 'timeout' }
  //   응답: 202 { session, signal: 'SIGTERM' } — abort in progress
  //   에러:
  //     400 CONFIRMATION_REQUIRED — body.confirmed !== true
  //     404 NOT_FOUND               — 세션 없음
  //     409 NOT_RUNNING             — 이미 종료됨
  //     200 ORPHANED                — pid 없거나 이미 죽음, 상태 orphaned로 정정
  //     500 KILL_FAILED             — 정상 경로에선 발생 안 함 (grace timer에서 orphaned로 처리)
  const abortMatch = path.match(/^\/api\/executions\/([^/]+)\/abort$/);
  if (method === "POST" && abortMatch) {
    const sessionId = decodeURIComponent(abortMatch[1]);
    // Body 파싱 — confirmed 필수
    const body = await readJsonBody<{ confirmed?: unknown; reason?: unknown }>(req);
    // body 없음/파싱실패도 확인 미충족으로 처리
    if (!body || body.confirmed !== true) {
      return jsonErr(
        "CONFIRMATION_REQUIRED",
        { detail: "abort requires { confirmed: true } in body" },
        400,
      );
    }
    // reason 화이트리스트
    const reasonRaw = typeof body.reason === "string" ? body.reason : "user";
    const reason = ["user", "timeout", "server_shutdown"].includes(reasonRaw)
      ? reasonRaw
      : "user";

    const row = store.get(sessionId);
    if (!row) return jsonErr("NOT_FOUND", { id: sessionId }, 404);

    const orchestrator = getExecutionOrchestrator();
    const result = orchestrator.abort(sessionId, { reason });
    if (result.ok) {
      // 202 Accepted — SIGTERM 발송됨, grace 대기 중
      return jsonResp(
        { session: serializeExecution(result.session), signal: result.signal },
        202,
      );
    }
    switch (result.code) {
      case "NOT_FOUND":
        return jsonErr("NOT_FOUND", { id: sessionId }, 404);
      case "NOT_RUNNING":
        return jsonErr(
          "NOT_RUNNING",
          {
            current_status: result.session.status,
            session: serializeExecution(result.session),
          },
          409,
        );
      case "ORPHANED":
        // spec §F-P7 에러 표: "pid 없거나 이미 죽은 프로세스 → orphaned 정정, 200"
        return jsonResp(
          {
            session: serializeExecution(result.session),
            status: "orphaned",
            detail: "pid was already dead — session marked orphaned",
          },
          200,
        );
      case "ALREADY_ABORTING":
        return jsonErr(
          "ALREADY_ABORTING",
          {
            detail: "abort already in progress for this session",
            session: serializeExecution(result.session),
          },
          409,
        );
      default: {
        // 미래의 신규 코드 안전 처리
        const _exhaustive: never = result;
        return jsonErr("UNKNOWN_ABORT_ERROR", { detail: String(_exhaustive) }, 500);
      }
    }
  }

  // ── GET /api/executions/:id ─────────────────────────────
  const detailMatch = path.match(/^\/api\/executions\/([^/]+)$/);
  if (method === "GET" && detailMatch) {
    const sessionId = decodeURIComponent(detailMatch[1]);
    const row = store.get(sessionId);
    if (!row) return jsonErr("NOT_FOUND", { id: sessionId }, 404);
    return jsonResp({ session: serializeExecution(row) });
  }

  return null;
}
