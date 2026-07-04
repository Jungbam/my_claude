'use client'

import { useEffect, useRef } from 'react'

/**
 * UncommittedChangesDialog — 202 pending_confirmation 응답 시 3지선택 (design-fe §4-6 / OQ-5).
 *
 * 버튼 순서(안전순 → 파괴순): [Cancel] [Stash & Run] [Continue Anyway].
 * 기본 focus=Cancel — 우연한 Enter로 파괴 방지.
 *
 * 다이얼로그는 uncommitted_action 재요청을 부모(ExecutionConsoleModal)가 담당한다.
 * 여기서는 3개 콜백 중 하나를 트리거하고 자체 open 상태만 관리.
 */

interface UncommittedChangesDialogProps {
  open: boolean
  /** 서버가 detail로 전달 가능한 dirty 파일 힌트 (v1 미제공 시 빈 배열) */
  dirtyFiles?: readonly string[]
  onCancel: () => void
  onStashAndRun: () => void
  onContinueAnyway: () => void
  isBusy?: boolean
}

export function UncommittedChangesDialog({
  open,
  dirtyFiles,
  onCancel,
  onStashAndRun,
  onContinueAnyway,
  isBusy,
}: UncommittedChangesDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => cancelRef.current?.focus(), 0)
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', handler)
    }
  }, [open, onCancel, isBusy])

  if (!open) return null

  const btn = (
    label: string,
    onClick: () => void,
    variant: 'safe' | 'default' | 'danger',
    refProp?: React.RefObject<HTMLButtonElement | null>,
  ) => {
    const styles: Record<'safe' | 'default' | 'danger', React.CSSProperties> = {
      safe: {
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      },
      default: {
        background: 'var(--accent)',
        border: '1px solid var(--accent)',
        color: '#fff',
      },
      danger: {
        background: 'transparent',
        border: '1px solid var(--status-fail, #dc2626)',
        color: 'var(--status-fail, #dc2626)',
      },
    }
    return (
      <button
        type="button"
        ref={refProp}
        onClick={onClick}
        disabled={isBusy}
        style={{
          padding: '6px 14px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: variant === 'safe' ? 500 : 600,
          cursor: isBusy ? 'not-allowed' : 'pointer',
          opacity: isBusy ? 0.6 : 1,
          ...styles[variant],
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="uncommitted-dialog-title"
      aria-describedby="uncommitted-dialog-desc"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) onCancel()
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          boxShadow: '0 20px 60px var(--shadow-lg, rgba(0,0,0,0.4))',
          width: '520px',
          maxWidth: '92vw',
          padding: '20px',
        }}
      >
        <h3
          id="uncommitted-dialog-title"
          style={{
            margin: 0,
            marginBottom: '10px',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          Uncommitted changes detected
        </h3>
        <div
          id="uncommitted-dialog-desc"
          style={{
            fontSize: '12px',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            marginBottom: '14px',
          }}
        >
          The working tree has uncommitted changes. Running now may make them harder
          to review after the pipeline finishes.
        </div>

        {dirtyFiles && dirtyFiles.length > 0 && (
          <div
            style={{
              maxHeight: '160px',
              overflowY: 'auto',
              padding: '8px 10px',
              marginBottom: '14px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-light, var(--border))',
              borderRadius: '6px',
              fontFamily: 'monospace',
              fontSize: '11px',
              color: 'var(--text-secondary)',
            }}
          >
            {dirtyFiles.slice(0, 30).map((f) => (
              <div key={f}>{f}</div>
            ))}
            {dirtyFiles.length > 30 && (
              <div style={{ opacity: 0.6 }}>
                …and {dirtyFiles.length - 30} more
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          {btn('Cancel', onCancel, 'safe', cancelRef)}
          {btn('Stash & Run', onStashAndRun, 'default')}
          {btn('Continue Anyway', onContinueAnyway, 'danger')}
        </div>
      </div>
    </div>
  )
}
