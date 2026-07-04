'use client'

import { useEffect, useRef } from 'react'

/**
 * ConfirmDialog — 파괴적 액션 공통 확인 다이얼로그 (design-fe §3-4 / NF-SEC-6).
 *
 * 원칙:
 *   - 기본 focus는 안전 버튼(cancel) — Enter로 우연 파괴 방지 (design-fe §3-4).
 *   - Escape 취소.
 *   - onClose(=cancel), onConfirm(=primary). isBusy 시 primary disabled.
 */

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string | React.ReactNode
  primaryLabel: string
  primaryVariant?: 'default' | 'danger'
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  isBusy?: boolean
  /** 기본 focus: 'cancel'(안전, default) | 'primary'(비파괴 액션 흐름에서 명시적 opt-in) */
  initialFocus?: 'cancel' | 'primary'
}

export function ConfirmDialog({
  open,
  title,
  description,
  primaryLabel,
  primaryVariant = 'default',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isBusy,
  initialFocus = 'cancel',
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const primaryRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    // 프레임 밀린 후 focus (Modal open과 경합 방지)
    const timer = setTimeout(() => {
      if (initialFocus === 'primary') primaryRef.current?.focus()
      else cancelRef.current?.focus()
    }, 0)
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handler)
    }
  }, [open, initialFocus, onCancel, isBusy])

  if (!open) return null

  const primaryStyle: React.CSSProperties =
    primaryVariant === 'danger'
      ? {
          background: 'var(--status-fail, #dc2626)',
          color: '#fff',
          border: '1px solid var(--status-fail, #dc2626)',
        }
      : {
          background: 'var(--accent)',
          color: '#fff',
          border: '1px solid var(--accent)',
        }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? 'confirm-dialog-desc' : undefined}
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
          width: '420px',
          maxWidth: '90vw',
          padding: '20px',
        }}
      >
        <h3
          id="confirm-dialog-title"
          style={{
            margin: 0,
            marginBottom: description ? '10px' : '16px',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </h3>
        {description && (
          <div
            id="confirm-dialog-desc"
            style={{
              fontSize: '12px',
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
              marginBottom: '20px',
            }}
          >
            {description}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={isBusy}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              cursor: isBusy ? 'not-allowed' : 'pointer',
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={primaryRef}
            onClick={onConfirm}
            disabled={isBusy}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              opacity: isBusy ? 0.6 : 1,
              ...primaryStyle,
            }}
          >
            {isBusy ? '…' : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
