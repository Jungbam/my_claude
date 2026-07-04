'use client'

import { useState, useCallback } from 'react'
import { workProfilesApi } from '@/lib/workprofiles-api'
import type { PromoteCandidate } from '@/lib/workprofiles-api'

interface PromoteCandidatesSectionProps {
  slug: string
  candidates: PromoteCandidate[]
  onPromoted: () => void
}

/**
 * design-fe.md §5-4 — Memory 탭 상단 promote 후보 배너.
 *
 * 서버가 /memory-candidates endpoint 미제공 시 candidates=[] 로
 * 우아하게 빈 상태 처리 (workprofiles-api.candidates 참조).
 */
export function PromoteCandidatesSection({
  slug,
  candidates,
  onPromoted,
}: PromoteCandidatesSectionProps) {
  if (candidates.length === 0) return null

  return (
    <div
      style={{
        padding: '12px',
        border: '1px solid var(--accent)',
        borderRadius: '8px',
        background: 'var(--bg-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <h3
          style={{
            fontSize: '13px',
            fontWeight: 600,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Promote candidates ({candidates.length})
        </h3>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          Extracted from recent retro pipelines
        </span>
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {candidates.map((c, i) => (
          <PromoteCandidateRow
            key={`${c.source}-${i}`}
            slug={slug}
            candidate={c}
            onPromoted={onPromoted}
          />
        ))}
      </ul>
    </div>
  )
}

function PromoteCandidateRow({
  slug,
  candidate,
  onPromoted,
}: {
  slug: string
  candidate: PromoteCandidate
  onPromoted: () => void
}) {
  const [busy, setBusy] = useState<'accept' | 'dismiss' | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAccept = useCallback(async () => {
    setBusy('accept')
    setError(null)
    try {
      await workProfilesApi.memory.create(slug, {
        kind: candidate.kind,
        body_md: candidate.body_md,
        source: candidate.source,
      })
      onPromoted()
    } catch (err) {
      setError((err as Error).message || 'Promote failed')
    } finally {
      setBusy(null)
    }
  }, [slug, candidate, onPromoted])

  if (dismissed) return null

  return (
    <li
      style={{
        padding: '8px 10px',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: 'monospace',
        }}
      >
        <span>{candidate.kind}</span>
        <span>·</span>
        <span>{candidate.source}</span>
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {candidate.body_md}
      </div>
      {error && (
        <div
          role="alert"
          style={{ fontSize: '11px', color: 'var(--status-fail)' }}
        >
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button
          onClick={() => {
            setDismissed(true)
          }}
          disabled={busy !== null}
          style={ghostButtonStyle}
        >
          Dismiss
        </button>
        <button
          onClick={handleAccept}
          disabled={busy !== null}
          style={{
            ...primaryButtonStyle,
            opacity: busy === 'accept' ? 0.6 : 1,
          }}
        >
          {busy === 'accept' ? 'Promoting…' : 'Promote'}
        </button>
      </div>
    </li>
  )
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '4px 12px',
  fontSize: '11px',
  borderRadius: '4px',
  border: 'none',
  background: 'var(--accent)',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 600,
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
