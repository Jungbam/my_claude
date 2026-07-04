'use client'

import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * AbortConfirmDialog — Abort 확인 + aborting 상태 + 15s force-kill 카운트다운
 * (design-fe §4-5 / AC-3 UI).
 *
 * 3단계:
 *   1) confirming — 사용자 확인 대기 (ConfirmDialog + initialFocus=Cancel, danger 스타일).
 *   2) aborting   — POST /abort 성공 후. 15s 카운트다운 배너("Force kill in Xs…") 표시.
 *                   서버 SSE로 execution_aborted / execution_force_killed 도착 시 부모가 unmount.
 *   3) closed     — 부모가 open=false 로 접었을 때.
 *
 * 이 컴포넌트는 다이얼로그 자체 + 카운트다운 배너 두 상태를 관리하며,
 * 실제 상태 배지("aborting", "force-killed")는 부모 ExecutionConsoleModal이 SSE로 렌더한다.
 */

interface AbortConfirmDialogProps {
  open: boolean
  sessionIdPreview: string
  /** onConfirm은 POST /abort를 실행하고 성공 시 resolve. 실패 시 throw. */
  onConfirm: () => Promise<void>
  onCancel: () => void
  /** 부모가 SSE로 aborted 감지 시 다이얼로그 접기 위해 사용 */
}

export function AbortConfirmDialog({
  open,
  sessionIdPreview,
  onConfirm,
  onCancel,
}: AbortConfirmDialogProps) {
  const [phase, setPhase] = useState<'confirming' | 'aborting' | 'error'>('confirming')
  const [countdown, setCountdown] = useState<number>(15)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!open) {
      setPhase('confirming')
      setCountdown(15)
      setErrorMsg(null)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [open])

  useEffect(() => {
    if (phase !== 'aborting') return
    setCountdown(15)
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [phase])

  if (!open) return null

  if (phase === 'confirming') {
    return (
      <ConfirmDialog
        open
        title="Abort execution?"
        description={
          <>
            Session <code>{sessionIdPreview}</code> will receive{' '}
            <strong>SIGTERM</strong> with 15s grace, then <strong>SIGKILL</strong>.
            Ongoing work may be lost.
          </>
        }
        primaryLabel="Abort"
        primaryVariant="danger"
        cancelLabel="Keep running"
        initialFocus="cancel"
        onCancel={onCancel}
        onConfirm={async () => {
          setErrorMsg(null)
          setPhase('aborting')
          try {
            await onConfirm()
          } catch (err) {
            setPhase('error')
            setErrorMsg(err instanceof Error ? err.message : String(err))
          }
        }}
      />
    )
  }

  // aborting / error 배너
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        left: '50%',
        top: '20%',
        transform: 'translateX(-50%)',
        zIndex: 1300,
        background: 'var(--bg-card)',
        border: `1px solid ${phase === 'error' ? 'var(--status-fail, #dc2626)' : 'var(--priority-medium, #d97706)'}`,
        borderRadius: '10px',
        boxShadow: '0 20px 60px var(--shadow-lg, rgba(0,0,0,0.4))',
        padding: '14px 20px',
        maxWidth: '480px',
      }}
    >
      {phase === 'aborting' ? (
        <>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--priority-medium, #d97706)',
              marginBottom: '4px',
            }}
          >
            Aborting… force kill in {countdown}s
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            SIGTERM sent. If the process does not exit within 15s, SIGKILL will be
            issued.
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--status-fail, #dc2626)',
              marginBottom: '4px',
            }}
          >
            Abort failed
          </div>
          {errorMsg && (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
                marginBottom: '8px',
              }}
            >
              {errorMsg}
            </div>
          )}
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </>
      )}
    </div>
  )
}
