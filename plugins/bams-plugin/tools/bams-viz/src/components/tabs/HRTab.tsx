'use client'

import { useMemo, useState } from 'react'
import { usePolling } from '@/hooks/usePolling'

/* ------------------------------------------------------------------ */
/*  Types matching the JSON schema from PRD section 3.4               */
/* ------------------------------------------------------------------ */

interface HRReportSummary {
  total_pipelines: number
  total_invocations: number
  overall_success_rate: number
}

interface HRDepartment {
  department_id: string
  agent_count: number
  avg_success_rate: number
  total_invocations: number
}

interface HRAgent {
  agent_id: string
  department: string
  grade: string
  invocation_count: number
  success_rate: number
  avg_duration_ms: number
  retry_count: number
  escalation_count: number
  trend: 'improving' | 'declining' | 'stable'
}

interface HRReport {
  report_date: string | null
  period: { start: string | null; end: string | null }
  summary: HRReportSummary
  departments: HRDepartment[]
  agents: HRAgent[]
  alerts: string[]
  recommendations: string[]
}

interface HRReportListItem {
  date: string
  filename: string
  report_date: string
  period: { start: string; end: string } | null
  agent_count: number
  alert_count: number
}

/* ------------------------------------------------------------------ */
/*  Grade color mapping                                                */
/* ------------------------------------------------------------------ */

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#3b82f6',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
}

function gradeColor(grade: string): string {
  return GRADE_COLORS[grade.toUpperCase()] ?? 'var(--text-muted)'
}

/* ------------------------------------------------------------------ */
/*  Trend display                                                      */
/* ------------------------------------------------------------------ */

function trendSymbol(trend: string): { symbol: string; color: string } {
  switch (trend) {
    case 'improving': return { symbol: '\u2191', color: '#22c55e' }
    case 'declining': return { symbol: '\u2193', color: '#ef4444' }
    default: return { symbol: '=', color: 'var(--text-muted)' }
  }
}

/* ------------------------------------------------------------------ */
/*  Department label mapping                                           */
/* ------------------------------------------------------------------ */

const DEPT_LABELS: Record<string, { label: string; color: string }> = {
  executive: { label: 'Executive', color: '#ec4899' },
  management: { label: 'Executive', color: '#ec4899' },
  planning: { label: 'Planning', color: '#3b82f6' },
  engineering: { label: 'Engineering', color: '#22c55e' },
  evaluation: { label: 'Evaluation', color: '#f97316' },
  qa: { label: 'QA', color: '#a855f7' },
}

function deptLabel(deptId: string): { label: string; color: string } {
  return DEPT_LABELS[deptId] ?? { label: deptId, color: '#6c757d' }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SummaryCards({ report }: { report: HRReport }) {
  const activeAgents = report.agents.filter(a => a.invocation_count > 0).length
  const alertAgents = report.agents.filter(a => a.grade === 'D' || a.grade === 'F').length

  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      <SummaryCard
        title="Agents"
        value={`${activeAgents} / ${report.agents.length}`}
        subtitle="active / total"
        accent="var(--text-primary)"
      />
      <SummaryCard
        title="Success Rate"
        value={`${(report.summary.overall_success_rate * 100).toFixed(1)}%`}
        subtitle="overall average"
        accent={report.summary.overall_success_rate >= 0.85 ? '#22c55e' : report.summary.overall_success_rate >= 0.7 ? '#eab308' : '#ef4444'}
      />
      <SummaryCard
        title="Invocations"
        value={String(report.summary.total_invocations)}
        subtitle="this period"
        accent="var(--text-primary)"
      />
      <SummaryCard
        title="Attention Needed"
        value={String(alertAgents)}
        subtitle="D/F grade agents"
        accent={alertAgents > 0 ? '#ef4444' : '#22c55e'}
      />
    </div>
  )
}

function SummaryCard({ title, value, subtitle, accent }: {
  title: string
  value: string
  subtitle: string
  accent: string
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: '8px',
      padding: '14px 16px',
      minWidth: '170px',
      flex: '1 1 170px',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
        {title}
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: accent, marginBottom: '2px' }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        {subtitle}
      </div>
    </div>
  )
}

function DeptTable({ departments }: { departments: HRDepartment[] }) {
  if (departments.length === 0) return null
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '20px',
    }}>
      <div style={{
        padding: '12px 16px',
        fontSize: '13px',
        fontWeight: 600,
        borderBottom: '1px solid var(--border-light)',
        background: 'var(--bg-secondary)',
      }}>
        Department Summary
      </div>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 80px 100px 100px',
        gap: '8px',
        padding: '10px 16px',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        borderBottom: '1px solid var(--border-light)',
      }}>
        <div>Department</div>
        <div style={{ textAlign: 'right' }}>Agents</div>
        <div style={{ textAlign: 'right' }}>Avg Success</div>
        <div style={{ textAlign: 'right' }}>Invocations</div>
      </div>
      {/* Rows */}
      {departments.map(dept => {
        const info = deptLabel(dept.department_id)
        return (
          <div
            key={dept.department_id}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 80px 100px 100px',
              gap: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              borderBottom: '1px solid var(--border-light)',
            }}
          >
            <div style={{ fontWeight: 600, color: info.color, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: info.color, flexShrink: 0 }} />
              {info.label}
            </div>
            <div style={{ textAlign: 'right' }}>{dept.agent_count}</div>
            <div style={{
              textAlign: 'right',
              color: dept.avg_success_rate >= 0.85 ? '#22c55e' : dept.avg_success_rate >= 0.7 ? '#eab308' : '#ef4444',
              fontWeight: 600,
            }}>
              {(dept.avg_success_rate * 100).toFixed(1)}%
            </div>
            <div style={{ textAlign: 'right' }}>{dept.total_invocations}</div>
          </div>
        )
      })}
    </div>
  )
}

function AgentTable({ agents }: { agents: HRAgent[] }) {
  if (agents.length === 0) return null

  const formatDuration = (ms: number): string => {
    if (ms === 0) return '-'
    if (ms < 1000) return `${ms}ms`
    const s = Math.round(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const rem = s % 60
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '20px',
    }}>
      <div style={{
        padding: '12px 16px',
        fontSize: '13px',
        fontWeight: 600,
        borderBottom: '1px solid var(--border-light)',
        background: 'var(--bg-secondary)',
      }}>
        Agent Performance
      </div>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 60px 80px 90px 80px 70px 60px',
        gap: '8px',
        padding: '10px 16px',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        borderBottom: '1px solid var(--border-light)',
      }}>
        <div>Agent</div>
        <div>Department</div>
        <div style={{ textAlign: 'center' }}>Grade</div>
        <div style={{ textAlign: 'right' }}>Calls</div>
        <div style={{ textAlign: 'right' }}>Success</div>
        <div style={{ textAlign: 'right' }}>Avg Time</div>
        <div style={{ textAlign: 'right' }}>Retries</div>
        <div style={{ textAlign: 'center' }}>Trend</div>
      </div>
      {/* Rows */}
      {agents.map(agent => {
        const info = deptLabel(agent.department)
        const gc = gradeColor(agent.grade)
        const t = trendSymbol(agent.trend)
        const hasActivity = agent.invocation_count > 0
        return (
          <div
            key={agent.agent_id}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 60px 80px 90px 80px 70px 60px',
              gap: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              borderBottom: '1px solid var(--border-light)',
              opacity: hasActivity ? 1 : 0.5,
            }}
          >
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: hasActivity ? info.color : '#6c757d', flexShrink: 0,
              }} />
              {agent.agent_id}
            </div>
            <div style={{ color: info.color, fontSize: '12px', display: 'flex', alignItems: 'center' }}>
              {info.label}
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#fff',
                background: gc,
                minWidth: '24px',
              }}>
                {agent.grade}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              {agent.invocation_count > 0 ? agent.invocation_count : '-'}
            </div>
            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
              <div style={{
                width: '40px', height: '6px', borderRadius: '3px',
                background: 'var(--border-light)', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${Math.min(agent.success_rate * 100, 100)}%`,
                  height: '100%',
                  borderRadius: '3px',
                  background: agent.success_rate >= 0.85 ? '#22c55e' : agent.success_rate >= 0.7 ? '#eab308' : '#ef4444',
                }} />
              </div>
              <span style={{ fontSize: '12px' }}>
                {hasActivity ? `${(agent.success_rate * 100).toFixed(0)}%` : '-'}
              </span>
            </div>
            <div style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
              {formatDuration(agent.avg_duration_ms)}
            </div>
            <div style={{ textAlign: 'right', color: agent.retry_count > 0 ? '#f97316' : 'var(--text-secondary)' }}>
              {hasActivity ? agent.retry_count : '-'}
            </div>
            <div style={{ textAlign: 'center', fontWeight: 600, color: t.color, fontSize: '14px' }}>
              {hasActivity ? t.symbol : '-'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AlertSection({ agents }: { agents: HRAgent[] }) {
  const alertAgents = agents.filter(a => a.grade === 'D' || a.grade === 'F')
  if (alertAgents.length === 0) return null

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: '8px',
      overflow: 'hidden',
      borderLeft: '3px solid #ef4444',
    }}>
      <div style={{
        padding: '12px 16px',
        fontSize: '13px',
        fontWeight: 600,
        borderBottom: '1px solid var(--border-light)',
        background: 'var(--bg-secondary)',
        color: '#ef4444',
      }}>
        Attention Needed (D/F Grade)
      </div>
      {alertAgents.map(agent => {
        const gc = gradeColor(agent.grade)
        const issues: string[] = []
        if (agent.success_rate < 0.5) issues.push(`Very low success rate (${(agent.success_rate * 100).toFixed(0)}%)`)
        else if (agent.success_rate < 0.7) issues.push(`Low success rate (${(agent.success_rate * 100).toFixed(0)}%)`)
        if (agent.retry_count > 3) issues.push(`High retry count (${agent.retry_count})`)
        if (agent.escalation_count > 0) issues.push(`${agent.escalation_count} escalation(s)`)
        if (issues.length === 0) issues.push('Performance below threshold')

        return (
          <div
            key={agent.agent_id}
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-light)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                fontSize: '11px', fontWeight: 700, color: '#fff', background: gc,
              }}>
                {agent.grade}
              </span>
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{agent.agent_id}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                ({deptLabel(agent.department).label})
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {issues.map((issue, i) => (
                <li key={i} style={{ marginBottom: '2px' }}>{issue}</li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main HRTab component                                               */
/* ------------------------------------------------------------------ */

export function HRTab() {
  const { data: reportList, isLoading: isListLoading } = usePolling<HRReportListItem[]>('/api/hr/reports', 10000)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Determine which report URL to poll
  const reportUrl = selectedDate
    ? null  // For specific dates we would need /api/hr/reports/[date], use latest for now
    : '/api/hr/reports/latest'

  const { data: report, error, isLoading: isReportLoading } = usePolling<HRReport>(reportUrl, 10000)

  const isLoading = isListLoading || isReportLoading

  // Sort agents: D/F first, then by invocation count descending
  const sortedAgents = useMemo(() => {
    if (!report?.agents) return []
    return [...report.agents].sort((a, b) => {
      const gradeOrder: Record<string, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 }
      const ga = gradeOrder[a.grade] ?? 5
      const gb = gradeOrder[b.grade] ?? 5
      if (ga !== gb) return ga - gb
      return b.invocation_count - a.invocation_count
    })
  }, [report])

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading HR reports...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'var(--status-fail)' }}>
        Error loading HR data: {error.message}
      </div>
    )
  }

  const hasData = report && report.report_date !== null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        fontSize: '13px',
        color: 'var(--text-secondary)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600 }}>HR Performance Report</span>
        {report?.period?.start && report?.period?.end && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {report.period.start} ~ {report.period.end}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* Report date selector */}
        {reportList && reportList.length > 0 && (
          <select
            value={selectedDate ?? ''}
            onChange={e => setSelectedDate(e.target.value || null)}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">Latest Report</option>
            {reportList.map(r => (
              <option key={r.date} value={r.date}>
                {r.report_date} ({r.agent_count} agents)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {!hasData ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
            color: 'var(--text-muted)',
            gap: '12px',
          }}>
            <div style={{ fontSize: '32px' }}>&#128203;</div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>No HR Reports Available</div>
            <div style={{ fontSize: '12px', textAlign: 'center', maxWidth: '400px', lineHeight: '1.5' }}>
              HR Agent has not generated any weekly performance reports yet.
              Reports appear here after the hr-agent runs its weekly performance check pipeline.
            </div>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ marginBottom: '20px' }}>
              <SummaryCards report={report} />
            </div>

            {/* Department summary */}
            <DeptTable departments={report.departments} />

            {/* Agent performance table */}
            <AgentTable agents={sortedAgents} />

            {/* Attention needed section */}
            <AlertSection agents={report.agents} />

            {/* Recommendations */}
            {report.recommendations && report.recommendations.length > 0 && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                overflow: 'hidden',
                marginTop: '20px',
                borderLeft: '3px solid #3b82f6',
              }}>
                <div style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderBottom: '1px solid var(--border-light)',
                  background: 'var(--bg-secondary)',
                  color: '#3b82f6',
                }}>
                  Recommendations
                </div>
                <ul style={{
                  margin: 0,
                  padding: '12px 16px 12px 36px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6',
                }}>
                  {report.recommendations.map((rec, i) => (
                    <li key={i} style={{ marginBottom: '4px' }}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
