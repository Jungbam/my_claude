'use client'

import { useMemo } from 'react'
import { usePolling } from '@/hooks/usePolling'
import type { WorkProfilesListResponse } from '@/lib/projects-types'

interface StackProfileSelectorProps {
  value: string
  onChange: (slug: string) => void
  disabled?: boolean
  id?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
}

/**
 * Stack Profile 선택 위젯 — UI 라벨은 "Stack Profile", 코드 심볼은 WorkProfile (OQ-1).
 *
 * BE가 아직 /api/workprofiles 미제공 시 select는 비어있고, empty state 문구를 보여준다.
 */
export function StackProfileSelector({
  value,
  onChange,
  disabled,
  id,
  ariaLabelledBy,
  ariaDescribedBy,
}: StackProfileSelectorProps) {
  const { data, error, isLoading } = usePolling<WorkProfilesListResponse>(
    '/api/workprofiles',
    30000
  )
  const profiles = useMemo(() => data?.workprofiles ?? [], [data])

  const isEmpty = !isLoading && !error && profiles.length === 0

  return (
    <div>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled || isLoading || isEmpty}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <option value="" disabled>
          {isLoading
            ? 'Loading profiles…'
            : isEmpty
              ? 'No profiles registered'
              : 'Select a stack profile…'}
        </option>
        {profiles.map(p => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
      {error && (
        <div
          role="status"
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '4px',
          }}
        >
          Could not load stack profiles. You can still register the project.
        </div>
      )}
    </div>
  )
}
