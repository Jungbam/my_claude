import { formatDuration } from '@/lib/utils'
import { fmtRate, rateAccent, gradeColor, trendSymbol, deptLabel } from './helpers'
import type { HRAgent } from './types'

export function AgentTable({ agents }: { agents: HRAgent[] | null | undefined }) {
  const list = agents ?? []
  if (list.length === 0) return null

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
      {list.map(agent => {
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
                  width: `${agent.success_rate !== null ? Math.min(agent.success_rate * 100, 100) : 0}%`,
                  height: '100%',
                  borderRadius: '3px',
                  background: rateAccent(agent.success_rate),
                }} />
              </div>
              <span style={{ fontSize: '12px' }}>
                {hasActivity ? fmtRate(agent.success_rate, 0) : '-'}
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
