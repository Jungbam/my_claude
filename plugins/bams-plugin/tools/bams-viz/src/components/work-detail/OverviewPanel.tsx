'use client'

import { useMemo } from 'react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDuration, formatRelativeTime } from '@/lib/utils'
import type { WorkUnit, WorkUnitPipeline } from '@/lib/types'

interface OverviewPanelProps {
  workunit: WorkUnit & {
    task_summary?: {
      total: number
      backlog: number
      in_progress: number
      in_review: number
      done: number
    }
  }
  pipelines: WorkUnitPipeline[]
}

export function OverviewPanel({ workunit, pipelines }: OverviewPanelProps) {
  const pipelineStats = useMemo(() => {
    let completed = 0
    let failed = 0
    let running = 0
    let unknown = 0
    let other = 0
    for (const p of pipelines) {
      const s = (p.status ?? '').toLowerCase()
      // C-2: 빈 문자열/null/undefined는 'unknown'으로 분류 — 'running' 오카운트 방지
      if (!s) {
        unknown++
      } else if (s === 'completed') {
        completed++
      } else if (s === 'failed') {
        failed++
      } else if (s === 'running' || s === 'in_progress' || s === 'active') {
        running++
      } else {
        other++
      }
    }
    return { completed, failed, running, unknown, other }
  }, [pipelines])

  const taskSummary = workunit.task_summary
  const taskTotal = taskSummary?.total ?? 0
  const taskDone = taskSummary?.done ?? 0
  const taskPct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0

  const durationMs = useMemo(() => {
    if (workunit.endedAt && workunit.startedAt) {
      return new Date(workunit.endedAt).getTime() - new Date(workunit.startedAt).getTime()
    }
    if (workunit.startedAt) {
      return Date.now() - new Date(workunit.startedAt).getTime()
    }
    return null
  }, [workunit.startedAt, workunit.endedAt])

  const recentPipelines = useMemo(() => {
    return [...pipelines]
      .sort((a, b) => {
        const ta = a.linkedAt ? new Date(a.linkedAt).getTime() : 0
        const tb = b.linkedAt ? new Date(b.linkedAt).getTime() : 0
        return tb - ta
      })
      .slice(0, 5)
  }, [pipelines])

  return (
    <div>
      {/* WU Basic Info */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '12px',
        marginBottom: '24px',
      }}>
        <StatCard label="Status" value={workunit.status ?? 'unknown'} isStatus />
        <StatCard label="Started" value={formatRelativeTime(workunit.startedAt)} />
        <StatCard label="Duration" value={durationMs != null ? formatDuration(durationMs) : '--'} />
        <StatCard label="Pipelines" value={pipelines.length.toString()} />
        <StatCard
          label="Tasks"
          value={taskTotal > 0 ? `${taskDone}/${taskTotal} (${taskPct}%)` : 'No tasks'}
          color={taskTotal > 0 && taskDone === taskTotal ? 'var(--status-done)' : undefined}
        />
      </div>

      {/* Pipeline Status Breakdown */}
      {pipelines.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
            Pipeline Progress
          </h3>
          <div style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
          }}>
            {pipelineStats.completed > 0 && (
              <MiniStat label="Completed" value={pipelineStats.completed} color="var(--status-done)" />
            )}
            {pipelineStats.running > 0 && (
              <MiniStat label="Running" value={pipelineStats.running} color="var(--accent)" />
            )}
            {pipelineStats.failed > 0 && (
              <MiniStat label="Failed" value={pipelineStats.failed} color="var(--status-fail)" />
            )}
            {pipelineStats.unknown > 0 && (
              <MiniStat label="Unknown" value={pipelineStats.unknown} color="var(--text-muted)" />
            )}
            {pipelineStats.other > 0 && (
              <MiniStat label="Other" value={pipelineStats.other} color="var(--text-muted)" />
            )}
          </div>

          {/* Task progress bar */}
          {taskTotal > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginBottom: '4px',
              }}>
                <span>Task Progress</span>
                <span>{taskPct}%</span>
              </div>
              <div style={{
                height: '6px',
                borderRadius: '3px',
                background: 'var(--bg-secondary)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${taskPct}%`,
                  background: taskDone === taskTotal ? 'var(--status-done)' : 'var(--accent)',
                  borderRadius: '3px',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Pipelines */}
      {recentPipelines.length > 0 && (
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
            Recent Pipelines
          </h3>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            {recentPipelines.map(p => {
              const pTotalSteps = p.totalSteps || 0
              const pCompleted = p.completedSteps || 0
              const pPct = pTotalSteps > 0 ? Math.round((pCompleted / pTotalSteps) * 100) : 0

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
                  <span style={{
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {p.slug}
                  </span>

                  <span style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}>
                    {p.type}
                  </span>

                  <StatusBadge status={p.status ?? 'unknown'} size="sm" />

                  {/* Progress */}
                  {pTotalSteps > 0 && (
                    <div style={{
                      width: '50px',
                      height: '4px',
                      borderRadius: '2px',
                      background: 'var(--bg-secondary)',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${pPct}%`,
                        background: (p.failedSteps ?? 0) > 0 ? 'var(--status-fail)' : 'var(--accent)',
                        borderRadius: '2px',
                      }} />
                    </div>
                  )}

                  {p.durationMs != null && (
                    <span style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                    }}>
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
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '13px',
        }}>
          No pipelines linked to this work unit yet
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color, isStatus }: {
  label: string
  value: string
  color?: string
  isStatus?: boolean
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '12px',
    }}>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      {isStatus ? (
        <StatusBadge status={value} size="md" />
      ) : (
        <div style={{ fontSize: '16px', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
      )}
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '6px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      fontSize: '11px',
    }}>
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }} />
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <strong style={{ color: 'var(--text-primary)' }}>{value}</strong>
    </div>
  )
}
