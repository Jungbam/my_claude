/**
 * bams-viz/src/lib/executions-api.ts
 *
 * ExecutionSession REST 클라이언트 (design-fe.md §4 / design-be.md §2 계약).
 *
 * 프록시 경유:
 *   - POST /api/projects/:slug/executions  → bams-server POST /api/projects/:slug/executions
 *   - GET  /api/executions/:id             → bams-server GET  /api/executions/:id
 *   - GET  /api/executions/:id/logs?tail=N → bams-server GET  /api/executions/:id/logs?tail=N
 *   - POST /api/executions/:id/abort       → bams-server POST /api/executions/:id/abort
 *   - GET  /api/executions?project=&status=&limit=
 *
 * SSE 구독은 훅 `useExecutionStream`에서 EventSource로 직접 소비 (본 파일 미노출).
 *
 * 에러: fetch 응답 !ok 시 `{ status, code, detail }`를 담은 Error 던짐 (UI 컴포넌트가 code로 분기).
 */

import type { ExecutionSession, ExecutionSessionStatus } from './execution-events'

// ── 요청 타입 ─────────────────────────────────────────────────────

export type UncommittedAction = 'proceed' | 'stash' | 'cancel'

export interface CreateExecutionInput {
  command: string
  argv?: string[]
  uncommitted_action?: UncommittedAction
}

export interface CreateExecutionSuccess {
  session: ExecutionSession
  status: 'pending_confirmation' | 'queued' | 'running'
  max_concurrent?: number
  prompt_stats?: {
    system_prompt_len?: number
    memory_count?: number
    rules_count?: number
    truncated?: boolean
  }
}

export interface AbortExecutionInput {
  /** UI 필수 확인 후에만 true — spec §F-P7 안전장치 */
  confirmed: true
  reason?: string
}

// ── 에러 표면 ─────────────────────────────────────────────────────

/**
 * upstream 에러 코드는 executions.ts route + errorResponse 표준 포맷:
 *   { error: { code, message } } (Next proxy 마스킹 후)
 *   또는 { error: 'CODE', detail: '...' } (bams-server 직접)
 * 두 형태 모두 파싱.
 */
export interface ExecutionApiError extends Error {
  status: number
  code: string
  detail?: string
  raw?: unknown
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (res.ok) {
    return res.json() as Promise<T>
  }
  let bodyText = ''
  try {
    bodyText = await res.text()
  } catch {
    /* ignore */
  }
  let code = `HTTP_${res.status}`
  let detail: string | undefined
  let raw: unknown
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText) as {
        error?: string | { code?: string; message?: string; detail?: string }
        detail?: string
      }
      raw = parsed
      const err = parsed.error
      if (typeof err === 'string') {
        code = err
        detail = parsed.detail ?? undefined
      } else if (err && typeof err === 'object') {
        code = err.code ?? code
        detail = err.detail ?? err.message ?? parsed.detail ?? undefined
      }
    } catch {
      detail = bodyText.slice(0, 200)
    }
  }
  const err = new Error(`executions-api: ${res.status} ${code}${detail ? ` — ${detail}` : ''}`) as ExecutionApiError
  err.status = res.status
  err.code = code
  err.detail = detail
  err.raw = raw
  throw err
}

// ── API 표면 ───────────────────────────────────────────────────────

export const executionsApi = {
  /**
   * POST /api/projects/:slug/executions
   *
   * 202 → status=pending_confirmation (dirty git). uncommitted_action 채워 재요청 필요.
   * 201 → status=queued|running.
   */
  create(projectSlug: string, input: CreateExecutionInput): Promise<CreateExecutionSuccess> {
    return apiFetch<CreateExecutionSuccess>(
      `/api/projects/${encodeURIComponent(projectSlug)}/executions`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    )
  },

  /** GET /api/executions/:id */
  get(id: string): Promise<{ session: ExecutionSession }> {
    return apiFetch<{ session: ExecutionSession }>(
      `/api/executions/${encodeURIComponent(id)}`,
    )
  },

  /** GET /api/executions/:id/logs?tail=N — SSE 초기 리플레이 backfill용 */
  logs(id: string, tail = 100): Promise<{ session_id: string; lines: string[]; tail: number }> {
    return apiFetch(
      `/api/executions/${encodeURIComponent(id)}/logs?tail=${encodeURIComponent(String(tail))}`,
    )
  },

  /**
   * POST /api/executions/:id/abort
   *
   * spec §F-P7: `{ confirmed: true }` 필수 (UI 다이얼로그 확인 강제).
   * 서버 응답 501 NOT_IMPLEMENTED — TASK-120 완료 전 UI 표면 사전 구현.
   */
  abort(id: string, input: AbortExecutionInput = { confirmed: true }): Promise<{ ok: true } | { ok: false; code: string }> {
    return apiFetch(
      `/api/executions/${encodeURIComponent(id)}/abort`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    )
  },

  /** GET /api/executions?project=&status=&limit= */
  list(opts?: {
    project?: string
    status?: ExecutionSessionStatus
    limit?: number
  }): Promise<{ executions: ExecutionSession[] }> {
    const sp = new URLSearchParams()
    if (opts?.project) sp.set('project', opts.project)
    if (opts?.status) sp.set('status', opts.status)
    if (opts?.limit != null) sp.set('limit', String(opts.limit))
    const qs = sp.toString()
    return apiFetch(`/api/executions${qs ? `?${qs}` : ''}`)
  },
}

// ── 클라이언트-측 사전검증 ────────────────────────────────────────
//
// 서버 command-validator.ts 룰의 하위집합 — UX 즉시성 우선.
// 서버가 최종 판정을 하므로 여기 실패는 "안내"에 그친다.

/** spec §1-7과 동일 — `/bams:` prefix + 소문자 시작 + 2~21자 lower/digit/dash */
const COMMAND_PATTERN = /^\/bams:[a-z][a-z0-9-]{1,20}$/

/** shell metachar / control char — 하나라도 있으면 즉시 안내 */
const METACHAR_PATTERN = /[;|&`$><\n\r\t\0"'\\]/

/** ARG_ALLOWED — spec §1-7 화이트리스트 */
const ARG_ALLOWED_PATTERN = /^[a-zA-Z0-9_\-./=@:가-힣ㄱ-ㅎ]*$/

export const ARG_MAX_LEN = 200
export const ARG_MAX_COUNT = 32

export interface PrevalidateResult {
  ok: boolean
  reason?:
    | 'command_empty'
    | 'command_pattern'
    | 'argv_metachar'
    | 'argv_disallowed_char'
    | 'argv_too_long'
    | 'argv_too_many'
  hint?: string
  offendingIndex?: number
}

/**
 * 커맨드 폼 제출 전 클라이언트-측 사전검증.
 * 서버의 command-validator.ts 룰과 동일한 정규식/한계 (일치성 유지).
 */
export function prevalidateExecutionInput(command: string, argv: string[]): PrevalidateResult {
  if (!command || command.trim().length === 0) {
    return { ok: false, reason: 'command_empty', hint: 'Select a command.' }
  }
  if (!COMMAND_PATTERN.test(command)) {
    return {
      ok: false,
      reason: 'command_pattern',
      hint: `Command must match ${COMMAND_PATTERN.source}`,
    }
  }
  if (argv.length > ARG_MAX_COUNT) {
    return {
      ok: false,
      reason: 'argv_too_many',
      hint: `Too many arguments (max ${ARG_MAX_COUNT}).`,
    }
  }
  for (let i = 0; i < argv.length; i++) {
    const el = argv[i]
    if (el.length > ARG_MAX_LEN) {
      return {
        ok: false,
        reason: 'argv_too_long',
        hint: `Argument #${i + 1} exceeds ${ARG_MAX_LEN} chars.`,
        offendingIndex: i,
      }
    }
    const meta = METACHAR_PATTERN.exec(el)
    if (meta) {
      return {
        ok: false,
        reason: 'argv_metachar',
        hint: `Argument #${i + 1} contains disallowed character '${meta[0]}'. Shell metachars are blocked.`,
        offendingIndex: i,
      }
    }
    if (!ARG_ALLOWED_PATTERN.test(el)) {
      return {
        ok: false,
        reason: 'argv_disallowed_char',
        hint: `Argument #${i + 1} contains disallowed character. Allowed: a-z A-Z 0-9 _ - . / = @ : and Korean.`,
        offendingIndex: i,
      }
    }
  }
  return { ok: true }
}

/**
 * shell-word 스타일로 인자 문자열을 argv 배열로 파싱.
 * 단순 공백 split — 따옴표 escape 미지원 (허용 문자셋에 quote 없음).
 */
export function parseArgvString(input: string): string[] {
  return input
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
}

/** 자주 쓰는 커맨드 프리셋 — ExecutionConfigForm select 옵션 */
export const COMMON_COMMANDS: readonly { command: string; label: string; hint?: string }[] = [
  { command: '/bams:dev', label: '/bams:dev', hint: 'Full dev pipeline' },
  { command: '/bams:feature', label: '/bams:feature', hint: 'Full feature cycle' },
  { command: '/bams:hotfix', label: '/bams:hotfix', hint: 'Single-bug fast path' },
  { command: '/bams:plan', label: '/bams:plan', hint: 'PRD + spec + task split' },
  { command: '/bams:review', label: '/bams:review', hint: '5-aspect parallel review' },
  { command: '/bams:deep-review', label: '/bams:deep-review', hint: 'Deep review + codex' },
  { command: '/bams:debug', label: '/bams:debug', hint: 'Bug triage → fix → regress' },
  { command: '/bams:ship', label: '/bams:ship' },
  { command: '/bams:deploy', label: '/bams:deploy' },
  { command: '/bams:verify', label: '/bams:verify' },
  { command: '/bams:status', label: '/bams:status' },
  { command: '/bams:retro', label: '/bams:retro' },
] as const
