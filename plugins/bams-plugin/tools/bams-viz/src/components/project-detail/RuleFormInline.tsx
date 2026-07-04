'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProjectRule, ProjectRuleInput, ProjectRuleKind } from '@/lib/project-detail-types'

/**
 * 인라인 rule 편집 폼 (design-fe.md §5-3, "인라인 폼").
 *
 * 사용 방식:
 *   - 신규 등록: initialRule 미지정 → title + body_md 빈 값
 *   - 편집: initialRule 주입 → 기존 값으로 채워짐
 *
 * kind는 상위 섹션에서 고정 (props로 주입) — 규칙별 카테고리 정합성 유지.
 */

interface RuleFormInlineProps {
  kind: ProjectRuleKind
  initialRule?: ProjectRule | null
  submitting?: boolean
  errorMessage?: string | null
  onSubmit: (input: ProjectRuleInput) => Promise<void> | void
  onCancel: () => void
}

export function RuleFormInline({
  kind,
  initialRule,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
}: RuleFormInlineProps) {
  const [title, setTitle] = useState(initialRule?.title ?? '')
  const [bodyMd, setBodyMd] = useState(initialRule?.body_md ?? '')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 신규 폼 열릴 때 focus
    titleRef.current?.focus()
  }, [])

  const canSubmit = title.trim().length > 0 && bodyMd.trim().length > 0 && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    await onSubmit({
      kind,
      title: title.trim(),
      body_md: bodyMd,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--accent)',
        borderRadius: '6px',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        {initialRule ? `Editing ${kind} rule` : `New ${kind} rule`}
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Title</span>
        <input
          ref={titleRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={submitting}
          maxLength={200}
          placeholder="Short summary (max 200)"
          style={{
            padding: '6px 10px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '12px',
          }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Body (Markdown)</span>
        <textarea
          value={bodyMd}
          onChange={e => setBodyMd(e.target.value)}
          disabled={submitting}
          rows={6}
          placeholder="Markdown body — rendered on agent context injection"
          style={{
            padding: '8px 10px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontFamily: 'monospace',
            resize: 'vertical',
            minHeight: '100px',
          }}
        />
      </label>

      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: '6px 10px',
            background: 'var(--error-bg)',
            color: 'var(--status-fail)',
            borderRadius: '4px',
            fontSize: '11px',
          }}
        >
          {errorMessage}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          style={{
            padding: '6px 12px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '6px',
            background: canSubmit ? 'var(--accent)' : 'var(--bg-secondary)',
            color: canSubmit ? '#fff' : 'var(--text-muted)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'Saving…' : initialRule ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
  )
}
