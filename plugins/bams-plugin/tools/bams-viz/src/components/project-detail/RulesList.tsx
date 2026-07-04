'use client'

import { useMemo, useState } from 'react'
import type { ProjectRule, ProjectRuleKind } from '@/lib/project-detail-types'

/**
 * kind별 rules 목록 렌더 (design-ui.md §3-3).
 *
 * 정렬 규약:
 *   - must-read: 등록 순서(created_at ASC) — 무제한
 *   - pref:      최근 20건 + "N older rules" collapsible
 *   - style:     알파벳순 (title 기준)
 *
 * must-read reorder: 간단한 ↑/↓ 버튼 (배치 안내 §5-3의 "간단 위/아래 버튼 허용")
 * sanitizer_warnings: 인라인 warning 배지 표시 (design-fe §5-4).
 */

interface RulesListProps {
  kind: ProjectRuleKind
  rules: ProjectRule[]
  onEdit?: (rule: ProjectRule) => void
  onDelete?: (rule: ProjectRule) => void
  onReorder?: (rule: ProjectRule, direction: 'up' | 'down') => void
}

export function RulesList({ kind, rules, onEdit, onDelete, onReorder }: RulesListProps) {
  const [showAllPref, setShowAllPref] = useState(false)

  const sorted = useMemo(() => {
    if (kind === 'must-read') {
      return [...rules].sort((a, b) => {
        // display_order가 있으면 우선, 없으면 created_at ASC
        const oa = a.display_order ?? Number.MAX_SAFE_INTEGER
        const ob = b.display_order ?? Number.MAX_SAFE_INTEGER
        if (oa !== ob) return oa - ob
        const ta = new Date(a.created_at || '').getTime()
        const tb = new Date(b.created_at || '').getTime()
        return ta - tb
      })
    }
    if (kind === 'style') {
      return [...rules].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    }
    // pref: 최근순 (created_at DESC)
    return [...rules].sort((a, b) => {
      const ta = new Date(a.created_at || '').getTime()
      const tb = new Date(b.created_at || '').getTime()
      return tb - ta
    })
  }, [kind, rules])

  const visible = useMemo(() => {
    if (kind !== 'pref' || showAllPref) return sorted
    return sorted.slice(0, 20)
  }, [kind, sorted, showAllPref])
  const hiddenPrefCount = kind === 'pref' && !showAllPref ? Math.max(0, sorted.length - 20) : 0

  if (rules.length === 0) {
    return (
      <div
        style={{
          padding: '16px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '12px',
          fontStyle: 'italic',
        }}
      >
        No {kind} rules yet
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {visible.map((rule, i) => (
        <RuleRow
          key={rule.id}
          rule={rule}
          canReorder={kind === 'must-read'}
          canMoveUp={i > 0}
          canMoveDown={i < visible.length - 1}
          onEdit={onEdit}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      ))}
      {hiddenPrefCount > 0 && (
        <button
          onClick={() => setShowAllPref(true)}
          style={{
            padding: '6px 12px',
            background: 'none',
            border: '1px dashed var(--border)',
            borderRadius: '6px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            marginTop: '4px',
          }}
        >
          Show {hiddenPrefCount} older rule{hiddenPrefCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

// ── internal parts ──────────────────────────────────────────────────

interface RuleRowProps {
  rule: ProjectRule
  canReorder: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onEdit?: (rule: ProjectRule) => void
  onDelete?: (rule: ProjectRule) => void
  onReorder?: (rule: ProjectRule, direction: 'up' | 'down') => void
}

function RuleRow({
  rule,
  canReorder,
  canMoveUp,
  canMoveDown,
  onEdit,
  onDelete,
  onReorder,
}: RuleRowProps) {
  const [expanded, setExpanded] = useState(false)
  const warnings = rule.sanitizer_warnings ?? []
  const hasWarning = warnings.length > 0

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: hasWarning ? '3px solid var(--priority-medium)' : '1px solid var(--border)',
        borderRadius: '6px',
        padding: '8px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          aria-controls={`rule-body-${rule.id}`}
          aria-label={expanded ? 'Collapse rule body' : 'Expand rule body'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '10px',
            padding: 0,
            width: '14px',
            textAlign: 'center',
            transition: 'transform 0.15s',
            transform: expanded ? 'rotate(90deg)' : 'none',
          }}
        >
          &#9654;
        </button>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={rule.title}
        >
          {rule.title}
        </span>

        {hasWarning && (
          <span
            title={warnings.join('\n')}
            aria-label={`${warnings.length} sanitizer warnings`}
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'color-mix(in srgb, var(--priority-medium) 18%, transparent)',
              color: 'var(--priority-medium)',
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            ⚠ {warnings.length}
          </span>
        )}

        {canReorder && onReorder && (
          <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
            <IconButton
              label="Move up"
              disabled={!canMoveUp}
              onClick={() => onReorder(rule, 'up')}
            >
              ↑
            </IconButton>
            <IconButton
              label="Move down"
              disabled={!canMoveDown}
              onClick={() => onReorder(rule, 'down')}
            >
              ↓
            </IconButton>
          </div>
        )}

        {onEdit && (
          <IconButton label="Edit rule" onClick={() => onEdit(rule)}>
            ✎
          </IconButton>
        )}
        {onDelete && (
          <IconButton label="Delete rule" onClick={() => onDelete(rule)} destructive>
            ✕
          </IconButton>
        )}
      </div>

      {expanded && (
        <div
          id={`rule-body-${rule.id}`}
          style={{
            marginTop: '8px',
            padding: '8px 10px',
            background: 'var(--code-bg)',
            borderRadius: '4px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
            maxHeight: '240px',
            overflow: 'auto',
          }}
        >
          {rule.body_md}
        </div>
      )}

      {expanded && hasWarning && (
        <div
          role="status"
          style={{
            marginTop: '6px',
            padding: '6px 10px',
            background: 'color-mix(in srgb, var(--priority-medium) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '11px',
            color: 'var(--priority-medium)',
          }}
        >
          <strong>Sanitizer warnings:</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        background: 'none',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: destructive ? 'var(--status-fail)' : 'var(--text-muted)',
        fontSize: '11px',
        padding: '2px 6px',
        borderRadius: '4px',
        opacity: disabled ? 0.35 : 1,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}
