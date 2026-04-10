import { fmtRate, gradeColor, deptLabel } from './helpers'
import type { HRAgent } from './types'

export function AlertSection({ agents }: { agents: HRAgent[] }) {
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
        if (agent.success_rate !== null && agent.success_rate < 0.5) issues.push(`Very low success rate (${fmtRate(agent.success_rate, 0)})`)
        else if (agent.success_rate !== null && agent.success_rate < 0.7) issues.push(`Low success rate (${fmtRate(agent.success_rate, 0)})`)
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
