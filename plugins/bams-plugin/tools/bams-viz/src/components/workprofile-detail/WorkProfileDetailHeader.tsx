'use client'

import type { WorkProfileDetail } from '@/lib/workprofiles-api'

interface WorkProfileDetailHeaderProps {
  workprofile: WorkProfileDetail
  onBack: () => void
}

/**
 * design-fe.md §5-4 — WorkProfile 상세 헤더.
 *
 * UI 라벨 "Stack Profile" (OQ-1) — 코드 심볼은 WorkProfile 유지.
 */
export function WorkProfileDetailHeader({
  workprofile,
  onBack,
}: WorkProfileDetailHeaderProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: '4px 0',
          fontSize: '12px',
          marginBottom: '8px',
        }}
      >
        ← Back
      </button>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 700,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          {workprofile.name || workprofile.slug}
        </h1>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            padding: '2px 8px',
            borderRadius: '10px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          Stack Profile
        </span>
        {workprofile.is_preset && (
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Preset (read-only)
          </span>
        )}
      </div>
      <div
        style={{
          marginTop: '4px',
          color: 'var(--text-muted)',
          fontSize: '12px',
        }}
      >
        <code style={{ fontFamily: 'monospace' }}>{workprofile.slug}</code>
      </div>
    </div>
  )
}
