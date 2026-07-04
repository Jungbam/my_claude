/**
 * bams-viz/src/lib/execution-events.ts
 *
 * ExecutionOrchestrator SSE 이벤트 타입 정의 (design-fe.md §4-3, design-be.md §7-1).
 *
 * 서버(sse-broker.ts SseEventType)의 execution_* 8종 + 로그 라인(text_chunk) 유니온.
 * 브라우저에서 `EventSource` 로 수신 후 discriminated union으로 파싱하기 위한 클라이언트-측 정의.
 *
 * 서버측 실제 payload 구조는 execution-orchestrator.ts를 참고. 필드는 nullable로 방어.
 */

// ── SSE Event Type (client mirror of server SseEventType) ────────────────

export type ExecutionEventType =
  | 'execution_session_start'
  | 'execution_session_end'
  | 'execution_session_linked'
  | 'execution_slow_start'
  | 'execution_aborted_requested'
  | 'execution_aborted'
  | 'execution_force_killed'
  | 'text_chunk'
  | 'connected'
  | 'heartbeat'
  | 'error'

/** SSE raw envelope — 서버가 emit하는 공통 필드. */
export interface ExecutionEventEnvelope<TPayload = unknown> {
  type: ExecutionEventType
  pipeline_slug?: string
  agent_slug?: string
  run_id?: string
  ts?: string
  payload?: TPayload
}

/** text_chunk 로그 라인 payload. */
export interface TextChunkPayload {
  line: string
  stream: 'stdout' | 'stderr'
  session_id?: string
  project_slug?: string
}

/** execution_session_start payload. */
export interface SessionStartPayload {
  session_id: string
  project_slug?: string
  command?: string
  pid?: number
}

/** execution_session_linked payload. */
export interface SessionLinkedPayload {
  session_id: string
  pipeline_slug: string
}

/** execution_session_end payload. */
export interface SessionEndPayload {
  session_id: string
  status?: 'completed' | 'failed' | 'cancelled' | 'aborted'
  exit_code?: number | null
  duration_ms?: number
}

/** execution_slow_start payload. */
export interface SlowStartPayload {
  session_id: string
  threshold_ms: number
}

/** execution_aborted / execution_force_killed payload. */
export interface AbortPayload {
  session_id: string
  reason?: string
  grace_ms?: number
}

// ── ExecutionSession (mirror of server serializeExecution output) ────────

export type ExecutionSessionStatus =
  | 'pending_confirmation'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'aborted'
  | 'orphaned'

export interface ExecutionSession {
  id: string
  project_slug: string
  work_profile_slug: string | null
  pipeline_slug: string | null
  command: string
  argv: string[]
  status: ExecutionSessionStatus
  pid: number | null
  stash_ref: string | null
  started_at: string | null
  ended_at: string | null
  exit_code: number | null
  created_at: string
  updated_at: string
}

// ── LogStreamViewer domain ───────────────────────────────────────────────

export interface LogLine {
  /** monotonic seq (rAF batch flush 순서 유지) */
  seq: number
  line: string
  stream: 'stdout' | 'stderr'
  ts: number
}

// ── Terminal state helpers ───────────────────────────────────────────────

export const TERMINAL_STATUSES: readonly ExecutionSessionStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'aborted',
  'orphaned',
]

export function isTerminalStatus(status: ExecutionSessionStatus | null | undefined): boolean {
  if (!status) return false
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}
