import { fmtRate, rateAccent } from './helpers'
import type { HRReport } from './types'

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

export function SummaryCards({ report }: { report: HRReport }) {
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
        value={fmtRate(report.summary.overall_success_rate)}
        subtitle="overall average"
        accent={rateAccent(report.summary.overall_success_rate)}
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
