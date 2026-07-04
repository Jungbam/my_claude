'use client'

import { useState, useCallback } from 'react'
import { workProfilesApi } from '@/lib/workprofiles-api'
import type {
  WorkProfileMemory,
  WorkProfileMemoryKind,
} from '@/lib/workprofiles-api'

interface MemoryListProps {
  slug: string
  memories: WorkProfileMemory[]
  onMutated: () => void
}

/**
 * design-fe.md §5-4 — Memory 목록.
 *   - kind별 badge, source pipeline 표시.
 *   - Decay 버튼 (즉시 decayed_at = now)
 *   - Delete 버튼 (확인 후)
 *   - sanitizer_warnings가 있는 항목은 좌측 warning 아이콘.
 */
export function MemoryList({ slug, memories, onMutated }: MemoryListProps) {
  if (memories.length === 0) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '13px',
          border: '1px dashed var(--border)',
          borderRadius: '8px',
        }}
      >
        No alive memories yet. Add one below, or promote candidates from retro.
      </div>
    )
  }
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {memories.map((m) => (
        <MemoryItem
          key={m.id}
          slug={slug}
          memory={m}
          onMutated={onMutated}
        />
      ))}
    </ul>
  )
}

// ── inline MemoryItem ─────────────────────────────────────────────────────

function MemoryItem({
  slug,
  memory,
  onMutated,
}: {
  slug: string
  memory: WorkProfileMemory
  onMutated: () => void
}) {
  const [busy, setBusy] = useState<'decay' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDecay = useCallback(async () => {
    setBusy('decay')
    setError(null)
    try {
      await workProfilesApi.memory.decay(slug, memory.id)
      onMutated()
    } catch (err) {
      setError((err as Error).message || 'Decay failed')
    } finally {
      setBusy(null)
    }
  }, [slug, memory.id, onMutated])

  const handleDelete = useCallback(async () => {
    if (
      !confirm(
        `Delete memory #${memory.id}? This is permanent (no restore).`
      )
    )
      return
    setBusy('delete')
    setError(null)
    try {
      await workProfilesApi.memory.delete(slug, memory.id)
      onMutated()
    } catch (err) {
      setError((err as Error).message || 'Delete failed')
    } finally {
      setBusy(null)
    }
  }, [slug, memory.id, onMutated])

  const hasWarnings =
    memory.sanitizer_warnings != null &&
    memory.sanitizer_warnings.length > 0

  return (
    <li
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border)',
        borderLeft: hasWarnings
          ? '3px solid var(--priority-medium, #d4a017)'
          : '1px solid var(--border)',
        borderRadius: '6px',
        background: 'var(--bg-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <KindBadge kind={memory.kind} />
        <span
          style={{ fontSize: '11px', color: 'var(--text-muted)' }}
          title={memory.created_at}
        >
          {formatDate(memory.created_at)}
        </span>
        {memory.source && (
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: 'monospace',
            }}
          >
            from {memory.source}
          </span>
        )}
        {hasWarnings && (
          <span
            role="img"
            aria-label="Sanitizer flagged this memory"
            title={memory.sanitizer_warnings?.join(', ')}
            style={{
              fontSize: '11px',
              color: 'var(--priority-medium, #d4a017)',
            }}
          >
            ⚠ flagged
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--text-primary)',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {memory.body_md}
      </div>
      {hasWarnings && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}
        >
          Sanitizer: {memory.sanitizer_warnings?.join('; ')}
        </div>
      )}
      {error && (
        <div
          role="alert"
          style={{ fontSize: '11px', color: 'var(--status-fail)' }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={handleDecay}
          disabled={busy !== null}
          style={ghostButtonStyle}
        >
          {busy === 'decay' ? 'Decaying…' : 'Decay'}
        </button>
        <button
          onClick={handleDelete}
          disabled={busy !== null}
          style={{
            ...ghostButtonStyle,
            color: 'var(--status-fail)',
          }}
        >
          {busy === 'delete' ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </li>
  )
}

function KindBadge({ kind }: { kind: WorkProfileMemoryKind }) {
  const label =
    kind === 'learned_pattern'
      ? 'learned'
      : kind === 'gotcha'
        ? 'gotcha'
        : 'snippet'
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '10px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
        fontSize: '10px',
        fontFamily: 'monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
      }}
    >
      {label}
    </span>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    if (diff < 30 * 86_400_000)
      return `${Math.floor(diff / 86_400_000)}d ago`
    return d.toISOString().slice(0, 10)
  } catch {
    return iso
  }
}

const ghostButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '11px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
}
