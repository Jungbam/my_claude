'use client'

/**
 * useExecutionStream — ExecutionSession SSE 소비 훅 (design-fe.md §4-3).
 *
 * 계약:
 *   - sessionId가 null이면 idle. sessionId 셋 시 EventSource 오픈.
 *   - EventSource 자동 재연결 OFF (readyState 확인 없이 명시적 close + backoff 재오픈).
 *   - Backoff: 1s → 2s → 5s → 10s (cap 10s). NF-REL-2 대응.
 *   - Last-Event-ID 리플레이: 매 이벤트 수신 시 event.lastEventId 저장 → 다음 오픈 시
 *     `?last-event-id=<id>` 쿼리 전달.
 *   - logs ring buffer max 2000줄 (LogStreamViewer §4-4 대응). tail drop.
 *   - rAF 100ms batch flush로 대량 로그 렌더 스로틀 (NF-3).
 *   - status가 terminal이 되면 자동 close (재연결 안 함).
 *
 * onLinked/onEnd 콜백: SWR mutate 트리거 지점.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type {
  ExecutionEventEnvelope,
  ExecutionEventType,
  ExecutionSession,
  LogLine,
  SessionEndPayload,
  SessionLinkedPayload,
  SessionStartPayload,
  TextChunkPayload,
} from '@/lib/execution-events'
import { isTerminalStatus } from '@/lib/execution-events'
import { executionsApi } from '@/lib/executions-api'

// ── 상수 ─────────────────────────────────────────────────────────────

const MAX_LOG_LINES = 2000
const RAF_BATCH_INTERVAL_MS = 100
const BACKOFF_SEQUENCE_MS = [1000, 2000, 5000, 10_000, 10_000] as const

// ── 상태 & 리듀서 ────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed'
  | 'error'

export interface ExecutionStreamState {
  session: ExecutionSession | null
  logs: LogLine[]
  events: ExecutionEventEnvelope[]
  connectionStatus: ConnectionStatus
  lastEventId: string | null
  error: string | null
  /** slow_start 이벤트 수신 or 25s FE 타이머 만료 */
  slowStart: boolean
  /** force-killed 배너 표시 (감사 정보) */
  forceKilled: boolean
}

type Action =
  | { type: 'reset' }
  | { type: 'connecting' }
  | { type: 'connected' }
  | { type: 'reconnecting' }
  | { type: 'closed' }
  | { type: 'error'; error: string }
  | { type: 'session'; session: ExecutionSession }
  | { type: 'session_patch'; patch: Partial<ExecutionSession> }
  | { type: 'append_logs'; lines: LogLine[] }
  | { type: 'event'; event: ExecutionEventEnvelope; lastEventId: string | null }
  | { type: 'slow_start' }
  | { type: 'force_killed' }

const INITIAL_STATE: ExecutionStreamState = {
  session: null,
  logs: [],
  events: [],
  connectionStatus: 'idle',
  lastEventId: null,
  error: null,
  slowStart: false,
  forceKilled: false,
}

function reducer(state: ExecutionStreamState, action: Action): ExecutionStreamState {
  switch (action.type) {
    case 'reset':
      return { ...INITIAL_STATE }
    case 'connecting':
      return { ...state, connectionStatus: 'connecting', error: null }
    case 'connected':
      return { ...state, connectionStatus: 'connected', error: null }
    case 'reconnecting':
      return { ...state, connectionStatus: 'reconnecting' }
    case 'closed':
      return { ...state, connectionStatus: 'closed' }
    case 'error':
      return { ...state, connectionStatus: 'error', error: action.error }
    case 'session':
      return { ...state, session: action.session }
    case 'session_patch': {
      if (!state.session) {
        // SSE 이벤트가 fetchInitialSession 응답 전에 도착한 경우 stub으로 시드.
        // 부모 컴포넌트는 mergedSession으로 자체 session과 병합하므로 최소 필드만 채운다.
        const stub: ExecutionSession = {
          id: '',
          project_slug: '',
          work_profile_slug: null,
          pipeline_slug: null,
          command: '',
          argv: [],
          status: 'running',
          pid: null,
          stash_ref: null,
          started_at: null,
          ended_at: null,
          exit_code: null,
          created_at: '',
          updated_at: '',
        }
        return { ...state, session: { ...stub, ...action.patch } }
      }
      return { ...state, session: { ...state.session, ...action.patch } }
    }
    case 'append_logs': {
      const next = state.logs.concat(action.lines)
      // ring buffer — head drop
      const clipped = next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next
      return { ...state, logs: clipped }
    }
    case 'event': {
      // 종말/링크 이벤트만 events에 축적 (text_chunk는 logs로만)
      const t = action.event.type
      const isMilestone =
        t === 'execution_session_start' ||
        t === 'execution_session_linked' ||
        t === 'execution_session_end' ||
        t === 'execution_slow_start' ||
        t === 'execution_aborted_requested' ||
        t === 'execution_aborted' ||
        t === 'execution_force_killed'
      return {
        ...state,
        events: isMilestone ? state.events.concat(action.event) : state.events,
        lastEventId: action.lastEventId ?? state.lastEventId,
      }
    }
    case 'slow_start':
      return { ...state, slowStart: true }
    case 'force_killed':
      return { ...state, forceKilled: true }
    default:
      return state
  }
}

// ── 옵션 & 반환 ──────────────────────────────────────────────────────

export interface UseExecutionStreamOptions {
  /**
   * SSE 스트림 base URL. 기본 `/api/executions/:id/stream` (Next 프록시).
   * 프로덕션에서는 이대로 두고, 로컬 개발에서만 override.
   */
  streamPathBuilder?: (sessionId: string, lastEventId: string | null) => string
  /** phase=streaming 진입 후 세션 상세 fallback fetch (SSE 첫 이벤트 이전 UI 렌더링용) */
  fetchInitialSession?: boolean
  /**
   * pipeline_slug 매핑 완료 시 콜백. SWR mutate에 활용:
   *   mutate(`/api/projects/${projectSlug}`); mutate('/api/projects');
   */
  onLinked?: (payload: SessionLinkedPayload) => void
  /** 세션 종료 시 콜백. SWR mutate에 활용. */
  onEnd?: (payload: SessionEndPayload | null, session: ExecutionSession | null) => void
}

export interface UseExecutionStreamResult extends ExecutionStreamState {
  /** 명시적 close (모달 unmount 등). 이후 재활성화 불가 — 새 훅 인스턴스 필요. */
  close: () => void
}

// ── 훅 ────────────────────────────────────────────────────────────────

export function useExecutionStream(
  sessionId: string | null,
  options: UseExecutionStreamOptions = {},
): UseExecutionStreamResult {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const esRef = useRef<EventSource | null>(null)
  const closedRef = useRef(false)
  const reconnectAttemptRef = useRef(0)
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafHandleRef = useRef<number | null>(null)
  const pendingLogsRef = useRef<LogLine[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0)
  const slowStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastEventIdRef = useRef<string | null>(null)
  const onLinkedRef = useRef(options.onLinked)
  const onEndRef = useRef(options.onEnd)

  // callback ref 최신값 유지 (재구독 유발 방지)
  useEffect(() => {
    onLinkedRef.current = options.onLinked
    onEndRef.current = options.onEnd
  })

  const streamPathBuilder = options.streamPathBuilder

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current != null) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      const rafSupported = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      if (rafSupported) {
        rafHandleRef.current = window.requestAnimationFrame(() => {
          rafHandleRef.current = null
          const batch = pendingLogsRef.current
          if (batch.length > 0) {
            pendingLogsRef.current = []
            dispatch({ type: 'append_logs', lines: batch })
          }
        })
      } else {
        const batch = pendingLogsRef.current
        if (batch.length > 0) {
          pendingLogsRef.current = []
          dispatch({ type: 'append_logs', lines: batch })
        }
      }
    }, RAF_BATCH_INTERVAL_MS)
  }, [])

  const enqueueLog = useCallback(
    (payload: TextChunkPayload) => {
      seqRef.current += 1
      pendingLogsRef.current.push({
        seq: seqRef.current,
        line: payload.line ?? '',
        stream: payload.stream ?? 'stdout',
        ts: Date.now(),
      })
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const clearBackoffTimer = useCallback(() => {
    if (backoffTimerRef.current != null) {
      clearTimeout(backoffTimerRef.current)
      backoffTimerRef.current = null
    }
  }, [])

  const clearSlowStartTimer = useCallback(() => {
    if (slowStartTimerRef.current != null) {
      clearTimeout(slowStartTimerRef.current)
      slowStartTimerRef.current = null
    }
  }, [])

  const closeEventSource = useCallback(() => {
    if (esRef.current != null) {
      try {
        esRef.current.close()
      } catch {
        /* ignore */
      }
      esRef.current = null
    }
  }, [])

  const parseEventEnvelope = useCallback((raw: string, type: ExecutionEventType): ExecutionEventEnvelope | null => {
    if (!raw) {
      return { type }
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      // 서버가 emit하는 완전한 envelope 시나리오
      if (parsed && typeof parsed === 'object' && 'type' in parsed) {
        return parsed as unknown as ExecutionEventEnvelope
      }
      return { type, payload: parsed }
    } catch {
      return { type, payload: raw }
    }
  }, [])

  const handleEnvelope = useCallback(
    (envelope: ExecutionEventEnvelope, lastEventId: string | null) => {
      dispatch({ type: 'event', event: envelope, lastEventId })
      switch (envelope.type) {
        case 'text_chunk': {
          const p = envelope.payload as TextChunkPayload | undefined
          if (p && typeof p.line === 'string') enqueueLog(p)
          break
        }
        case 'execution_session_start': {
          const p = envelope.payload as SessionStartPayload | undefined
          if (p?.session_id) {
            dispatch({
              type: 'session_patch',
              patch: {
                status: 'running',
                pid: p.pid ?? null,
                started_at: envelope.ts ?? new Date().toISOString(),
              },
            })
          }
          break
        }
        case 'execution_session_linked': {
          const p = envelope.payload as SessionLinkedPayload | undefined
          if (p?.pipeline_slug) {
            dispatch({
              type: 'session_patch',
              patch: { pipeline_slug: p.pipeline_slug },
            })
            onLinkedRef.current?.(p)
          }
          break
        }
        case 'execution_slow_start': {
          dispatch({ type: 'slow_start' })
          break
        }
        case 'execution_aborted_requested': {
          dispatch({ type: 'session_patch', patch: { status: 'running' } })
          break
        }
        case 'execution_aborted': {
          dispatch({ type: 'session_patch', patch: { status: 'aborted' } })
          break
        }
        case 'execution_force_killed': {
          dispatch({ type: 'force_killed' })
          break
        }
        case 'execution_session_end': {
          const p = envelope.payload as SessionEndPayload | undefined
          const nextStatus = p?.status ?? 'completed'
          dispatch({
            type: 'session_patch',
            patch: {
              status: nextStatus,
              exit_code: p?.exit_code ?? null,
              ended_at: envelope.ts ?? new Date().toISOString(),
            },
          })
          break
        }
        default:
          break
      }
    },
    [enqueueLog],
  )

  // ── EventSource 라이프사이클 ──────────────────────────────────────

  useEffect(() => {
    if (!sessionId) {
      dispatch({ type: 'reset' })
      closedRef.current = false
      return
    }

    closedRef.current = false
    reconnectAttemptRef.current = 0
    lastEventIdRef.current = null
    seqRef.current = 0
    pendingLogsRef.current = []

    const buildUrl = (): string => {
      if (streamPathBuilder) return streamPathBuilder(sessionId, lastEventIdRef.current)
      const base = `/api/executions/${encodeURIComponent(sessionId)}/stream`
      const lid = lastEventIdRef.current
      return lid ? `${base}?last-event-id=${encodeURIComponent(lid)}` : base
    }

    const open = () => {
      if (closedRef.current) return
      closeEventSource()
      const url = buildUrl()
      dispatch({
        type: reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting',
      })
      let es: EventSource
      try {
        es = new EventSource(url)
      } catch (err) {
        dispatch({ type: 'error', error: err instanceof Error ? err.message : String(err) })
        scheduleReconnect()
        return
      }
      esRef.current = es

      // 서버가 named event로 push. 각 타입별 리스너.
      const eventTypes: ExecutionEventType[] = [
        'connected',
        'heartbeat',
        'text_chunk',
        'execution_session_start',
        'execution_session_end',
        'execution_session_linked',
        'execution_slow_start',
        'execution_aborted_requested',
        'execution_aborted',
        'execution_force_killed',
        'error',
      ]

      for (const type of eventTypes) {
        es.addEventListener(type, (raw) => {
          const evt = raw as MessageEvent
          if (evt.lastEventId) {
            lastEventIdRef.current = evt.lastEventId
          }
          if (type === 'connected') {
            reconnectAttemptRef.current = 0
            dispatch({ type: 'connected' })
            return
          }
          if (type === 'heartbeat') {
            return
          }
          const envelope = parseEventEnvelope(evt.data, type)
          if (!envelope) return
          handleEnvelope(envelope, evt.lastEventId ?? null)
        })
      }

      // 기본 message (unnamed) — 방어적
      es.onmessage = (evt) => {
        if (evt.lastEventId) lastEventIdRef.current = evt.lastEventId
        const envelope = parseEventEnvelope(evt.data, 'text_chunk')
        if (envelope) handleEnvelope(envelope, evt.lastEventId ?? null)
      }

      es.onerror = () => {
        if (closedRef.current) return
        // 정상 종료(스트림 close) vs 네트워크 에러 구분 어려움 → 종말 상태면 재연결 skip
        closeEventSource()
        // session이 terminal이면 재연결 불필요
        // NOTE: state.session은 클로저 캡처 시점이라 최신값 반영 안 됨.
        //       ref로 최신 status를 추적하는 것이 이상적이지만, 서버가 session_end 이벤트
        //       송신 후 스트림 close를 명시하므로 여기서는 재연결을 시도하고
        //       session_end 도착 시 아래 useEffect가 close()를 트리거.
        scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      if (closedRef.current) return
      const attempt = reconnectAttemptRef.current
      const delay =
        BACKOFF_SEQUENCE_MS[Math.min(attempt, BACKOFF_SEQUENCE_MS.length - 1)] ??
        BACKOFF_SEQUENCE_MS[BACKOFF_SEQUENCE_MS.length - 1]
      reconnectAttemptRef.current = attempt + 1
      dispatch({ type: 'reconnecting' })
      clearBackoffTimer()
      backoffTimerRef.current = setTimeout(() => {
        backoffTimerRef.current = null
        open()
      }, delay)
    }

    // FE 자체 25s slow-start 타이머 (서버 이벤트 유실 방어, design-fe §4-2)
    slowStartTimerRef.current = setTimeout(() => {
      dispatch({ type: 'slow_start' })
    }, 25_000)

    // 초기 세션 상세 fetch (option)
    if (options.fetchInitialSession) {
      executionsApi
        .get(sessionId)
        .then(({ session }) => {
          dispatch({ type: 'session', session })
        })
        .catch(() => {
          /* SSE로 채워지므로 무시 */
        })
    }

    open()

    return () => {
      closedRef.current = true
      clearBackoffTimer()
      clearSlowStartTimer()
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      if (rafHandleRef.current != null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafHandleRef.current)
        rafHandleRef.current = null
      }
      closeEventSource()
      dispatch({ type: 'closed' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // terminal 도달 시 close (재연결 방지)
  useEffect(() => {
    if (isTerminalStatus(state.session?.status)) {
      closedRef.current = true
      clearBackoffTimer()
      closeEventSource()
      // 마지막 flush 강제
      if (pendingLogsRef.current.length > 0) {
        const batch = pendingLogsRef.current
        pendingLogsRef.current = []
        dispatch({ type: 'append_logs', lines: batch })
      }
      dispatch({ type: 'closed' })
      onEndRef.current?.(null, state.session)
    }
  }, [state.session?.status, state.session, clearBackoffTimer, closeEventSource])

  const closeCallback = useCallback(() => {
    closedRef.current = true
    clearBackoffTimer()
    clearSlowStartTimer()
    closeEventSource()
    dispatch({ type: 'closed' })
  }, [clearBackoffTimer, clearSlowStartTimer, closeEventSource])

  return { ...state, close: closeCallback }
}
