'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSWRConfig } from 'swr'
import {
  executionsApi,
  parseArgvString,
  prevalidateExecutionInput,
  COMMON_COMMANDS,
  type CreateExecutionSuccess,
  type ExecutionApiError,
  type UncommittedAction,
} from '@/lib/executions-api'
import type {
  ExecutionSession,
  ExecutionSessionStatus,
} from '@/lib/execution-events'
import { isTerminalStatus } from '@/lib/execution-events'
import { useExecutionStream } from '@/hooks/useExecutionStream'
import { LogStreamViewer } from '@/components/execution/LogStreamViewer'
import { UncommittedChangesDialog } from './UncommittedChangesDialog'
import { AbortConfirmDialog } from './AbortConfirmDialog'

/**
 * ExecutionConsoleModal — /bams:* 실행 콘솔 (TASK-124 진입점 — design-fe.md §4).
 *
 * 상태 머신 (design-fe §4-1):
 *   config → (POST) → streaming → (session_end) → ended
 *
 * 202 pending_confirmation 수신 시 UncommittedChangesDialog 3지선택:
 *   Cancel / Stash & Run / Continue Anyway. Stash&Run → uncommitted_action=stash 재요청,
 *   Continue → proceed 재요청.
 *
 * NF-2 (트리거 → 첫 로그 25s slow-start): 서버 execution_slow_start + FE 자체 25s
 *   타이머 이중감지 (useExecutionStream 내부). "Still preparing…" 배너 표시.
 *
 * 접근성:
 *   - Modal role=dialog + aria-modal + aria-labelledby.
 *   - Escape은 config phase에서만 close (streaming 중에는 accidental close 방지 — 확인 후 close).
 *   - Abort는 항상 확인 다이얼로그 (AC-3 / NF-SEC-6).
 */

export type ConsolePhase = 'config' | 'streaming' | 'ended'

export interface ExecutionConsoleModalProps {
  open: boolean
  projectSlug: string
  onClose: () => void
  /** SWR mutate 트리거 (외부 유입 활성 카운트 갱신 등) */
  onExecutionStarted?: (session: ExecutionSession) => void
}

export function ExecutionConsoleModal({
  open,
  projectSlug,
  onClose,
  onExecutionStarted,
}: ExecutionConsoleModalProps) {
  const [phase, setPhase] = useState<ConsolePhase>('config')
  const [session, setSession] = useState<ExecutionSession | null>(null)
  const [maxConcurrent, setMaxConcurrent] = useState<number | null>(null)
  // 폼 상태
  const [command, setCommand] = useState<string>(COMMON_COMMANDS[0].command)
  const [argvInput, setArgvInput] = useState<string>('')
  // 제출 상태
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<{ code: string; hint?: string } | null>(null)
  const [showUncommitted, setShowUncommitted] = useState(false)
  const [showAbort, setShowAbort] = useState(false)
  const [stashBanner, setStashBanner] = useState<string | null>(null)
  const abortDialogClosingRef = useRef(false)
  const { mutate } = useSWRConfig()

  // ── Reset when modal closes ─────────────────────────────
  useEffect(() => {
    if (!open) {
      setPhase('config')
      setSession(null)
      setSubmitError(null)
      setShowUncommitted(false)
      setShowAbort(false)
      setStashBanner(null)
      setSubmitting(false)
    }
  }, [open])

  // ── SSE stream ──────────────────────────────────────────
  const sessionIdForStream = phase === 'config' ? null : session?.id ?? null

  const stream = useExecutionStream(sessionIdForStream, {
    fetchInitialSession: true,
    onLinked: (payload) => {
      // 파이프라인 매핑 완료 — 관련 SWR 캐시 갱신
      mutate(`/api/projects/${encodeURIComponent(projectSlug)}`)
      mutate('/api/projects')
      mutate(`/api/projects/${encodeURIComponent(projectSlug)}/pipelines`)
      void payload
    },
    onEnd: () => {
      // 종료 → phase=ended 자동 전환 (아래 effect)
      mutate(`/api/projects/${encodeURIComponent(projectSlug)}`)
      mutate('/api/projects')
      mutate(`/api/projects/${encodeURIComponent(projectSlug)}/pipelines`)
    },
  })

  // 서버가 push한 session 상태를 로컬 session에 병합
  const mergedSession: ExecutionSession | null = useMemo(() => {
    if (!session && !stream.session) return null
    if (!session) return stream.session
    if (!stream.session) return session
    return { ...session, ...stream.session }
  }, [session, stream.session])

  // Session 종료 감지 → phase=ended
  useEffect(() => {
    if (phase === 'streaming' && isTerminalStatus(mergedSession?.status ?? null)) {
      setPhase('ended')
      // aborting 배너 정리
      if (showAbort && !abortDialogClosingRef.current) {
        abortDialogClosingRef.current = true
        setShowAbort(false)
      }
    }
  }, [phase, mergedSession?.status, showAbort])

  // ── 실행 트리거 ────────────────────────────────────────
  const runExecution = useCallback(
    async (uncommittedAction?: UncommittedAction) => {
      setSubmitError(null)
      const argv = parseArgvString(argvInput)
      const pre = prevalidateExecutionInput(command, argv)
      if (!pre.ok) {
        setSubmitError({ code: pre.reason ?? 'validation', hint: pre.hint })
        return
      }
      setSubmitting(true)
      try {
        const result: CreateExecutionSuccess = await executionsApi.create(projectSlug, {
          command,
          argv,
          uncommitted_action: uncommittedAction,
        })
        setMaxConcurrent(result.max_concurrent ?? null)
        if (result.status === 'pending_confirmation') {
          setSession(result.session)
          setShowUncommitted(true)
          setSubmitting(false)
          return
        }
        // running/queued
        setShowUncommitted(false)
        setSession(result.session)
        setPhase('streaming')
        setSubmitting(false)
        onExecutionStarted?.(result.session)
        // 프로젝트 SWR 캐시 즉시 무효화 (active_execution_count)
        mutate(`/api/projects/${encodeURIComponent(projectSlug)}`)
        mutate('/api/projects')
      } catch (err) {
        const e = err as ExecutionApiError
        setSubmitError({ code: e.code ?? 'error', hint: e.detail ?? e.message })
        setSubmitting(false)
      }
    },
    [argvInput, command, projectSlug, onExecutionStarted, mutate],
  )

  // ── Handlers ────────────────────────────────────────────
  const handleUncommittedCancel = useCallback(() => {
    setShowUncommitted(false)
    setSession(null)
    setSubmitting(false)
  }, [])

  const handleStashAndRun = useCallback(async () => {
    setShowUncommitted(false)
    await runExecution('stash')
    setStashBanner('Working tree stashed automatically before run.')
  }, [runExecution])

  const handleContinueAnyway = useCallback(async () => {
    setShowUncommitted(false)
    await runExecution('proceed')
  }, [runExecution])

  const handleAbort = useCallback(async () => {
    if (!mergedSession?.id) return
    try {
      await executionsApi.abort(mergedSession.id, { confirmed: true })
    } catch (err) {
      // NOT_IMPLEMENTED (501) 등을 catch. 사용자에게 노출.
      const e = err as ExecutionApiError
      throw new Error(e.detail || e.message || `Abort failed (${e.code ?? e.status})`)
    }
  }, [mergedSession?.id])

  const handleClose = useCallback(() => {
    if (phase === 'streaming' && !isTerminalStatus(mergedSession?.status)) {
      // 진행 중 실행 종료 없이 모달 닫기 — 확인
      const ok = window.confirm(
        'Execution is still running. Close the console without aborting?',
      )
      if (!ok) return
    }
    onClose()
  }, [phase, mergedSession?.status, onClose])

  // ── ESC 처리 ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showUncommitted || showAbort) return
        handleClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, showUncommitted, showAbort, handleClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="execution-console-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          boxShadow: '0 20px 60px var(--shadow-lg, rgba(0,0,0,0.4))',
          width: '820px',
          maxWidth: '92vw',
          height: phase === 'config' ? 'auto' : '80vh',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-light, var(--border))',
          }}
        >
          <div>
            <h3
              id="execution-console-title"
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Execution Console
            </h3>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {projectSlug}
              {mergedSession?.id && (
                <>
                  {' · '}
                  <code>{mergedSession.id.slice(0, 8)}</code>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close execution console"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              color: 'var(--text-muted)',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* stash banner (auto-dismiss 30s는 v2 — v1은 dismiss 버튼) */}
          {stashBanner && (
            <div
              role="status"
              style={{
                padding: '8px 12px',
                background: 'color-mix(in srgb, var(--priority-medium) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--priority-medium) 40%, transparent)',
                borderRadius: '6px',
                color: 'var(--priority-medium, #d97706)',
                fontSize: '11px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{stashBanner}</span>
              <button
                type="button"
                onClick={() => setStashBanner(null)}
                aria-label="Dismiss"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--priority-medium, #d97706)',
                  fontSize: '14px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          )}

          {phase === 'config' && (
            <ExecutionConfigForm
              command={command}
              onCommandChange={setCommand}
              argvInput={argvInput}
              onArgvInputChange={setArgvInput}
              submitting={submitting}
              submitError={submitError}
              maxConcurrent={maxConcurrent}
              onSubmit={() => runExecution()}
              onCancel={handleClose}
            />
          )}

          {phase !== 'config' && (
            <ExecutionStreamPanel
              session={mergedSession}
              logs={stream.logs}
              connectionStatus={stream.connectionStatus}
              slowStart={stream.slowStart}
              forceKilled={stream.forceKilled}
              onAbort={() => setShowAbort(true)}
              onRunAgain={() => {
                setPhase('config')
                setSession(null)
              }}
              onClose={handleClose}
              phase={phase}
            />
          )}
        </div>
      </div>

      {/* 202 pending_confirmation 3지선택 */}
      <UncommittedChangesDialog
        open={showUncommitted}
        dirtyFiles={undefined}
        onCancel={handleUncommittedCancel}
        onStashAndRun={handleStashAndRun}
        onContinueAnyway={handleContinueAnyway}
        isBusy={submitting}
      />

      {/* Abort 확인 + aborting 카운트다운 */}
      <AbortConfirmDialog
        open={showAbort && mergedSession != null}
        sessionIdPreview={mergedSession?.id?.slice(0, 8) ?? ''}
        onConfirm={handleAbort}
        onCancel={() => setShowAbort(false)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components (inline — 파일 수 최소화)
// ─────────────────────────────────────────────────────────────

interface ExecutionConfigFormProps {
  command: string
  onCommandChange: (v: string) => void
  argvInput: string
  onArgvInputChange: (v: string) => void
  submitting: boolean
  submitError: { code: string; hint?: string } | null
  maxConcurrent: number | null
  onSubmit: () => void
  onCancel: () => void
}

function ExecutionConfigForm({
  command,
  onCommandChange,
  argvInput,
  onArgvInputChange,
  submitting,
  submitError,
  maxConcurrent,
  onSubmit,
  onCancel,
}: ExecutionConfigFormProps) {
  const parsedArgv = useMemo(() => parseArgvString(argvInput), [argvInput])
  const preview = useMemo(() => prevalidateExecutionInput(command, parsedArgv), [command, parsedArgv])
  const canSubmit = preview.ok && !submitting

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) onSubmit()
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
    >
      <label
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}
      >
        Command
        <select
          value={command}
          onChange={(e) => onCommandChange(e.target.value)}
          disabled={submitting}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        >
          {COMMON_COMMANDS.map((c) => (
            <option key={c.command} value={c.command}>
              {c.label}
              {c.hint ? ` — ${c.hint}` : ''}
            </option>
          ))}
        </select>
      </label>

      <label
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}
      >
        Arguments <span style={{ opacity: 0.7 }}>(space-separated, optional)</span>
        <input
          type="text"
          value={argvInput}
          onChange={(e) => onArgvInputChange(e.target.value)}
          placeholder="e.g. plan_myfeature"
          disabled={submitting}
          aria-invalid={!preview.ok}
          aria-describedby="argv-hint"
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: `1px solid ${preview.ok ? 'var(--border)' : 'var(--status-fail, #dc2626)'}`,
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        />
        <div
          id="argv-hint"
          style={{
            fontSize: '11px',
            color: preview.ok
              ? 'var(--text-muted)'
              : 'var(--status-fail, #dc2626)',
            minHeight: '14px',
          }}
        >
          {!preview.ok
            ? preview.hint
            : parsedArgv.length > 0
            ? `${parsedArgv.length} argument${parsedArgv.length === 1 ? '' : 's'} · shell metachars blocked`
            : 'Shell metachars (`;`, `|`, `&`, `` ` ``, `$`, `>`, `<`) are rejected.'}
        </div>
      </label>

      {/* command preview */}
      <div
        style={{
          padding: '10px 12px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          fontFamily: 'monospace',
          fontSize: '12px',
          color: 'var(--text-primary)',
          wordBreak: 'break-all',
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>$ </span>
        {command}
        {parsedArgv.length > 0 && ` ${parsedArgv.join(' ')}`}
      </div>

      {submitError && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            background: 'color-mix(in srgb, var(--status-fail) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--status-fail) 40%, transparent)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--status-fail, #dc2626)',
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {friendlySubmitError(submitError.code)}
          </div>
          {submitError.hint && (
            <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '4px', fontFamily: 'monospace' }}>
              {submitError.hint}
            </div>
          )}
          {submitError.code === 'TOO_MANY_ACTIVE_SESSIONS' && maxConcurrent && (
            <div style={{ fontSize: '11px', marginTop: '4px' }}>
              Max concurrent sessions: {maxConcurrent}.
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={submitting}
          style={{
            padding: '6px 18px',
            borderRadius: '6px',
            border: '1px solid var(--accent)',
            background: canSubmit ? 'var(--accent)' : 'var(--bg-secondary)',
            color: canSubmit ? '#fff' : 'var(--text-muted)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'Starting…' : '▶ Execute'}
        </button>
      </div>
    </form>
  )
}

interface ExecutionStreamPanelProps {
  phase: 'streaming' | 'ended'
  session: ExecutionSession | null
  logs: readonly import('@/lib/execution-events').LogLine[]
  connectionStatus: string
  slowStart: boolean
  forceKilled: boolean
  onAbort: () => void
  onRunAgain: () => void
  onClose: () => void
}

function ExecutionStreamPanel({
  phase,
  session,
  logs,
  connectionStatus,
  slowStart,
  forceKilled,
  onAbort,
  onRunAgain,
  onClose,
}: ExecutionStreamPanelProps) {
  const status: ExecutionSessionStatus | null = session?.status ?? null
  const isTerminal = isTerminalStatus(status)
  const showSlowStart = phase === 'streaming' && slowStart && !session?.pipeline_slug && !isTerminal

  return (
    <>
      {/* status badge row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          fontSize: '11px',
        }}
      >
        {status && <StatusBadge status={status} />}
        {session?.pipeline_slug && (
          <a
            href={`/pipeline/${encodeURIComponent(session.pipeline_slug)}`}
            style={{
              color: 'var(--accent)',
              textDecoration: 'none',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}
            title="Open linked pipeline"
          >
            → {session.pipeline_slug}
          </a>
        )}
        {session?.command && (
          <span
            style={{
              fontFamily: 'monospace',
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '260px',
            }}
            title={session.command + (session.argv?.length ? ' ' + session.argv.join(' ') : '')}
          >
            {session.command}
            {session.argv?.length ? ` ${session.argv.join(' ')}` : ''}
          </span>
        )}
      </div>

      {/* slow-start banner (AC-2 25s) */}
      {showSlowStart && (
        <div
          role="status"
          style={{
            padding: '8px 12px',
            background: 'color-mix(in srgb, var(--priority-medium) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--priority-medium) 40%, transparent)',
            borderRadius: '6px',
            color: 'var(--priority-medium, #d97706)',
            fontSize: '11px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>
            <strong>Still preparing…</strong> No pipeline event yet after 25s.
            The child process may still be spawning.
          </span>
          <button
            type="button"
            onClick={onAbort}
            style={{
              padding: '3px 10px',
              borderRadius: '4px',
              border: '1px solid var(--priority-medium, #d97706)',
              background: 'transparent',
              color: 'var(--priority-medium, #d97706)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Abort
          </button>
        </div>
      )}

      {/* force-killed banner (AC-3) — dismiss 불가 (감사 정보) */}
      {forceKilled && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            background: 'color-mix(in srgb, var(--status-fail) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--status-fail) 40%, transparent)',
            borderRadius: '6px',
            color: 'var(--status-fail, #dc2626)',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          Force killed after 15s grace period (SIGKILL).
        </div>
      )}

      {/* Log viewer — flex:1로 나머지 공간 채움 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      >
        <LogStreamViewer
          logs={logs}
          status={status ?? undefined}
          connectionStatus={connectionStatus}
        />
      </div>

      {/* Footer actions */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--border-light, var(--border))',
          paddingTop: '10px',
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {phase === 'ended' && session && (
            <>
              <span>Ended</span>
              {session.exit_code != null && (
                <span style={{ marginLeft: '8px' }}>
                  · exit={session.exit_code}
                </span>
              )}
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {phase === 'streaming' && !isTerminal && (
            <button
              type="button"
              onClick={onAbort}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid var(--status-fail, #dc2626)',
                background: 'transparent',
                color: 'var(--status-fail, #dc2626)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Abort
            </button>
          )}
          {phase === 'ended' && (
            <>
              <button
                type="button"
                onClick={onRunAgain}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Run again
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--accent)',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function StatusBadge({ status }: { status: ExecutionSessionStatus }) {
  const map: Record<
    ExecutionSessionStatus,
    { bg: string; fg: string; label: string; dot?: boolean }
  > = {
    pending_confirmation: {
      bg: 'var(--bg-secondary)',
      fg: 'var(--text-secondary)',
      label: 'pending',
    },
    queued: { bg: 'var(--bg-secondary)', fg: 'var(--text-secondary)', label: 'queued' },
    running: {
      bg: 'color-mix(in srgb, var(--accent) 15%, transparent)',
      fg: 'var(--accent)',
      label: 'running',
      dot: true,
    },
    completed: {
      bg: 'color-mix(in srgb, var(--status-pass, #10b981) 15%, transparent)',
      fg: 'var(--status-pass, #10b981)',
      label: 'completed',
    },
    failed: {
      bg: 'color-mix(in srgb, var(--status-fail, #dc2626) 12%, transparent)',
      fg: 'var(--status-fail, #dc2626)',
      label: 'failed',
    },
    cancelled: {
      bg: 'var(--bg-secondary)',
      fg: 'var(--text-muted)',
      label: 'cancelled',
    },
    aborted: {
      bg: 'color-mix(in srgb, var(--priority-medium, #d97706) 12%, transparent)',
      fg: 'var(--priority-medium, #d97706)',
      label: 'aborted',
    },
    orphaned: {
      bg: 'var(--bg-secondary)',
      fg: 'var(--text-muted)',
      label: 'orphaned',
    },
  }
  const v = map[status]
  return (
    <span
      aria-label={`Status: ${v.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: 600,
        background: v.bg,
        color: v.fg,
        lineHeight: 1.4,
      }}
    >
      {v.dot && (
        <span
          aria-hidden
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: v.fg,
          }}
        />
      )}
      {v.label}
    </span>
  )
}

function friendlySubmitError(code: string): string {
  switch (code) {
    case 'PROJECT_NOT_FOUND':
      return 'Project not found.'
    case 'PROJECT_ARCHIVED':
      return 'This project is archived — cannot run.'
    case 'TOO_MANY_ACTIVE_SESSIONS':
      return 'Too many active executions. Wait for one to finish.'
    case 'COMMAND_NOT_ALLOWED':
      return 'Command is not in the /bams:* allowlist.'
    case 'UNSAFE_ARGUMENT':
    case 'argv_metachar':
    case 'argv_disallowed_char':
      return 'Argument contains disallowed characters.'
    case 'ARGUMENT_TOO_LONG':
    case 'argv_too_long':
      return 'Argument too long.'
    case 'TOO_MANY_ARGUMENTS':
    case 'argv_too_many':
      return 'Too many arguments.'
    case 'PATH_MISSING':
    case 'PATH_ESCAPED':
      return 'Project path is invalid.'
    case 'PROMPT_INJECTION_BLOCKED':
      return 'Prompt injection detected in project rules/memory — clean them and retry.'
    case 'command_pattern':
      return 'Command must match /bams:{name}.'
    case 'command_empty':
      return 'Select a command.'
    case 'NETWORK_ERROR':
      return 'Server unreachable. Is bams-server running on :3099?'
    default:
      return `Execution failed (${code}).`
  }
}
