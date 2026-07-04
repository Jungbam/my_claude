'use client'

import { usePolling } from '@/hooks/usePolling'
import { formatRelativeTime } from '@/lib/utils'
import type { ProjectRetrosListResponse } from '@/lib/project-detail-types'

/**
 * /project/[slug] Retro 탭 (design-ui.md §3-3).
 *
 * BE 미구현 케이스가 흔하므로 우아한 empty state 유지:
 *   - endpoint 부재 시 usePolling error 세팅 → "No retros yet" empty 렌더.
 *   - 첫 응답이 empty array라도 안내 텍스트 노출.
 *
 * design-fe.md §5-3에서 "기존 /work/[slug]의 RetroPanel을 shared로 승격"이라
 * 언급되나, 본 태스크 범위는 별도 프로젝트 스코프 목록 → 간단 리스트 렌더로 우선.
 * (승격 리팩터링은 W4/W5에서 결정)
 */

interface ProjectRetroPanelProps {
  projectSlug: string
}

export function ProjectRetroPanel({ projectSlug }: ProjectRetroPanelProps) {
  const { data, error, isLoading } = usePolling<ProjectRetrosListResponse>(
    projectSlug ? `/api/projects/${encodeURIComponent(projectSlug)}/retros` : null,
    15_000,
  )

  const retros = data?.retros ?? []

  return (
    <div
      role="tabpanel"
      id="project-tabpanel-retro"
      aria-labelledby="project-tab-retro"
    >
      {isLoading && !data && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          Loading retros…
        </div>
      )}

      {error && (
        <EmptyState
          title="No retros to show"
          hint="Retro endpoint is not yet available for projects. Retros surface as pipelines complete."
        />
      )}

      {!error && !isLoading && retros.length === 0 && (
        <EmptyState
          title="No retros yet"
          hint="Retros are auto-generated when pipelines complete. Trigger a pipeline to see the first retro here."
        />
      )}

      {retros.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {retros.map(r => (
            <div
              key={r.retro_slug}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '12px',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={r.retro_slug}
                >
                  {r.retro_slug}
                </div>
                <div style={{ marginTop: '2px', fontSize: '10px', color: 'var(--text-muted)' }}>
                  {r.pipeline_slug ? `pipeline: ${r.pipeline_slug} · ` : ''}
                  {formatRelativeTime(r.date ?? null)}
                </div>
              </div>
              {(r.keep_count != null || r.problem_count != null || r.try_count != null) && (
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <KptChip label="K" value={r.keep_count ?? 0} color="var(--status-done)" />
                  <KptChip label="P" value={r.problem_count ?? 0} color="var(--status-fail)" />
                  <KptChip label="T" value={r.try_count ?? 0} color="var(--accent)" />
                </div>
              )}
              {r.status && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                  }}
                >
                  {r.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      style={{
        padding: '40px 20px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '13px',
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
        {title}
      </div>
      {hint && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function KptChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '10px',
        padding: '1px 6px',
        borderRadius: '4px',
        background: `${color}15`,
        color,
        fontWeight: 600,
      }}
    >
      {label}
      <strong>{value}</strong>
    </span>
  )
}
