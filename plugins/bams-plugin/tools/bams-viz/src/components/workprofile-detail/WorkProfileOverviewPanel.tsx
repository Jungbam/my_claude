'use client'

import { useState, useCallback } from 'react'
import { workProfilesApi } from '@/lib/workprofiles-api'
import type { WorkProfileDetail } from '@/lib/workprofiles-api'

interface WorkProfileOverviewPanelProps {
  workprofile: WorkProfileDetail
  onPatched: () => void
}

/**
 * design-fe.md §5-4 — Overview 탭.
 *   - stack_tags 뱃지
 *   - usage_count (사용 중 프로젝트 수)
 *   - auto_retro_enabled 토글
 *   - memory_summary 미리보기
 *
 * 프리셋(is_preset=true)은 auto_retro_enabled 토글 read-only + fork 안내.
 */
export function WorkProfileOverviewPanel({
  workprofile,
  onPatched,
}: WorkProfileOverviewPanelProps) {
  const isPreset = workprofile.is_preset === true
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = useCallback(async () => {
    if (isPreset) return
    setSaving(true)
    setError(null)
    try {
      await workProfilesApi.patch(workprofile.slug, {
        auto_retro_enabled: !workprofile.auto_retro_enabled,
      })
      onPatched()
    } catch (err) {
      setError((err as Error).message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }, [
    isPreset,
    workprofile.slug,
    workprofile.auto_retro_enabled,
    onPatched,
  ])

  const stackTags = workprofile.stack_tags ?? []
  const summary = workprofile.memory_summary ?? {}

  return (
    <div
      id="workprofile-panel-overview"
      role="tabpanel"
      aria-labelledby="workprofile-tab-overview"
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
    >
      {/* Stack tags */}
      <section>
        <h2 style={sectionTitleStyle}>Stack tags</h2>
        {stackTags.length === 0 ? (
          <div style={emptyStyle}>No stack tags</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {stackTags.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Usage count */}
      <section>
        <h2 style={sectionTitleStyle}>Projects using this Stack Profile</h2>
        <div
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {workprofile.usage_count ?? 0}
        </div>
      </section>

      {/* Memory summary */}
      <section>
        <h2 style={sectionTitleStyle}>Memory summary</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '8px',
          }}
        >
          <StatTile
            label="Learned patterns"
            value={summary.learned_pattern ?? 0}
          />
          <StatTile label="Gotchas" value={summary.gotcha ?? 0} />
          <StatTile label="Gold snippets" value={summary.gold_snippet ?? 0} />
        </div>
      </section>

      {/* auto_retro_enabled */}
      <section>
        <h2 style={sectionTitleStyle}>Auto retro</h2>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'var(--bg-card)',
          }}
        >
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: isPreset ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={workprofile.auto_retro_enabled ?? false}
              disabled={isPreset || saving}
              onChange={handleToggle}
              aria-describedby="auto-retro-help"
            />
            <span style={{ fontSize: '13px' }}>
              Enable automatic retrospective harvest
            </span>
          </label>
          {saving && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Saving…
            </span>
          )}
        </div>
        <div
          id="auto-retro-help"
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '6px',
          }}
        >
          {isPreset
            ? 'Presets are read-only. Fork this profile to enable customization.'
            : 'When enabled, retro pipelines auto-promote KPT items into this profile\'s Memory.'}
        </div>
        {error && (
          <div
            role="alert"
            style={{
              fontSize: '12px',
              color: 'var(--status-fail)',
              marginTop: '6px',
            }}
          >
            {error}
          </div>
        )}
      </section>
    </div>
  )
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  margin: '0 0 8px 0',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
}

const emptyStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '8px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          fontSize: '18px',
          fontWeight: 700,
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        {label}
      </div>
    </div>
  )
}
