import { fmtRate, rateAccent, deptLabel } from './helpers'
import type { HRDepartment } from './types'

export function DeptTable({ departments }: { departments: HRDepartment[] | null | undefined }) {
  const list = departments ?? []
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
      {list.map(dept => {
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
              color: rateAccent(dept.avg_success_rate),
              fontWeight: 600,
            }}>
              {fmtRate(dept.avg_success_rate)}
            </div>
            <div style={{ textAlign: 'right' }}>{dept.total_invocations}</div>
          </div>
        )
      })}
    </div>
  )
}
