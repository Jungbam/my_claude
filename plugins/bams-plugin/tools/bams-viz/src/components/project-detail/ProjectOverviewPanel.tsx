'use client'

import { useMemo } from 'react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDuration, formatRelativeTime } from '@/lib/utils'
import type { ProjectDetail } from '@/lib/projects-types'
import type { ProjectPipeline } from '@/lib/project-detail-types'

/**
 * /project/[slug] Overview 탭 (design-ui.md §3-3 / design-fe.md §5-3).
 *
 * 섹션:
 *   1. Summary tiles — pipelines / active executions / must-read count / last activity
 *   2. Workprofile summary card (Stack Profile 링크)
 *   3. Rules count card (must-read / pref / style)
 *   4. Recent pipelines (최대 5건, /work/[slug] OverviewPanel 패턴 참고)
 */

interface ProjectOverviewPanelProps {
  project: ProjectDetail
  pipelines: ProjectPipeline[]
}

export function ProjectOverviewPanel({ project, pipelines }: ProjectOverviewPanelProps) {
  const ruleCounts = project.rule_count_by_kind ?? {}
  const mustReadCount = ruleCounts.must_read ?? 0
  const prefCount = ruleCounts.pref ?? 0
  const styleCount = ruleCounts.style ?? 0
  const activeCount = project.active_execution_count ?? 0
  const pipelineCount = project.pipeline_count ?? pipelines.length

  const recentPipelines = useMemo(() => {
    return [...pipelines]
      .sort((a, b) => {
        const ta = a.linkedAt ? new Date(a.linkedAt).getTime() : 0
        const tb = b.linkedAt ? new Date(b.linkedAt).getTime() : 0
        return tb - ta
      })
      .slice(0, 5)
  }, [pipelines])

  const unassignedCount = useMemo(
    () => pipelines.filter(p => p.unassigned === true || !p.wu_slug).length,
    [pipelines],
  )

  const lastActivityLabel = formatRelativeTime(project.last_pipeline_ts ?? null)

  return (
    <div
      role="tabpanel"
      id="project-tabpanel-overview"
      aria-labelledby="project-tab-overview"
    >
      {/* Summary tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <StatCard label="Pipelines" value={pipelineCount.toString()} />
        <StatCard
          label="Active executions"
          value={activeCount.toString()}
          color={activeCount > 0 ? 'var(--accent)' : undefined}
        />
        <StatCard
          label="Must-read"
          value={mustReadCount.toString()}
          color={mustReadCount > 0 ? 'var(--priority-medium)' : undefined}
        />
        <StatCard
          label="Last activity"
          value={lastActivityLabel === '--' ? 'No activity' : lastActivityLabel}
        />
      </div>

      {/* Two-column: Stack Profile card + Rules count card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <SummaryCard
          title="Stack Profile"
          subtitle="Applied system prompt + memory scope"
        >
          {project.work_profile_slug ? (
            <a
              href={`/workprofile/${encodeURIComponent(project.work_profile_slug)}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--accent)',
                textDecoration: 'none',
              }}
            >
              {project.work_profile_slug}
              <span aria-hidden style={{ fontSize: '11px' }}>&rarr;</span>
            </a>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              No stack profile
            </div>
          )}
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
            default branch: {project.default_branch || '—'}
          </div>
        </SummaryCard>

        <SummaryCard title="Rules" subtitle="Project-scope knowledge layer">
          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <RuleChip label="must-read" count={mustReadCount} priority />
            <RuleChip label="pref" count={prefCount} />
            <RuleChip label="style" count={styleCount} />
          </div>
        </SummaryCard>
      </div>

      {/* Recent Pipelines */}
      {recentPipelines.length > 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <h3
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Recent Pipelines
            </h3>
            {unassignedCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}
              >
                {unassignedCount} unassigned
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recentPipelines.map(p => {
              const pTotal = p.totalSteps || 0
              const pDone = p.completedSteps || 0
              const pPct = pTotal > 0 ? Math.round((pDone / pTotal) * 100) : 0
              return (
                <div
                  key={p.id ?? p.slug}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {p.slug}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                      flexShrink: 0,
                    }}
                  >
                    {p.type}
                  </span>
                  <StatusBadge status={p.status ?? 'unknown'} size="sm" />
                  {pTotal > 0 && (
                    <div
                      style={{
                        width: '50px',
                        height: '4px',
                        borderRadius: '2px',
                        background: 'var(--bg-secondary)',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${pPct}%`,
                          background: (p.failedSteps ?? 0) > 0 ? 'var(--status-fail)' : 'var(--accent)',
                          borderRadius: '2px',
                        }}
                      />
                    </div>
                  )}
                  {p.durationMs != null && (
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        flexShrink: 0,
                      }}
                    >
                      {formatDuration(p.durationMs)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {pipelines.length === 0 && (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}
        >
          No pipelines linked to this project yet
        </div>
      )}
    </div>
  )
}

// ── internal parts ──────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '12px',
      }}
    >
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '16px', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

function SummaryCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '14px',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            marginBottom: '8px',
            fontStyle: 'italic',
          }}
        >
          {subtitle}
        </div>
      )}
      <div style={{ marginTop: '6px' }}>{children}</div>
    </div>
  )
}

function RuleChip({ label, count, priority }: { label: string; count: number; priority?: boolean }) {
  const color = priority && count > 0 ? 'var(--priority-medium)' : 'var(--text-secondary)'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '10px',
        background: 'var(--bg-secondary)',
        color,
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      {label}
      <strong style={{ color }}>{count}</strong>
    </span>
  )
}
