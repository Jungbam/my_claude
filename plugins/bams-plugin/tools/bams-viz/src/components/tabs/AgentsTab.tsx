'use client'

import { useMemo } from 'react'
import { formatDuration } from '@/lib/utils'
import { AGENT_DEPT_MAP, DEPT_INFO } from '@/lib/agents-config'
import type { PipelineEvent } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentCall {
  call_id: string
  agent_type: string
  department: string
  model: string
  status: 'running' | 'success' | 'error'
  duration_ms: number | null
  description: string
  started_at: string
  is_error: boolean
}

interface AgentStat {
  agent_type: string
  department: string
  call_count: number
  error_count: number
  avg_duration_ms: number | null
}

interface AgentsTabProps {
  pipelineSlug: string
  events: PipelineEvent[] | null
  eventsLoading: boolean
  eventsError: Error | null
  wuSlug?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildAgentCalls(events: PipelineEvent[]): AgentCall[] {
  const starts = events.filter(e => e.type === 'agent_start') as Array<PipelineEvent & {
    call_id?: string; agent_type?: string; department?: string; model?: string; description?: string
  }>
  const ends = events.filter(e => e.type === 'agent_end') as Array<PipelineEvent & {
    call_id?: string; agent_type?: string; is_error?: boolean; status?: string; duration_ms?: number
  }>
  const endMap = new Map(ends.map(e => [e.call_id, e]))
  const pipelineEnded = events.some(e => e.type === 'pipeline_end')

  return starts.map(s => {
    const end = endMap.get(s.call_id)
    const isOrphan = !end && pipelineEnded
    return {
      call_id: s.call_id ?? '',
      agent_type: s.agent_type ?? 'unknown',
      department: s.department ?? AGENT_DEPT_MAP[s.agent_type ?? ''] ?? '',
      model: (s.model as string) ?? '',
      status: end
        ? (end.is_error || end.status === 'error' ? 'error' : 'success')
        : (isOrphan ? 'error' : 'running'),
      duration_ms: end?.duration_ms ?? null,
      description: (s.description as string) ?? '',
      started_at: s.ts,
      is_error: end ? (end.is_error === true || end.status === 'error') : false,
    } satisfies AgentCall
  })
}

function buildAgentStats(calls: AgentCall[]): AgentStat[] {
  const map = new Map<string, { calls: number; errors: number; totalMs: number; count: number; dept: string }>()
  for (const c of calls) {
    if (!map.has(c.agent_type)) map.set(c.agent_type, { calls: 0, errors: 0, totalMs: 0, count: 0, dept: c.department })
    const stat = map.get(c.agent_type)!
    stat.calls++
    if (c.is_error || c.status === 'error') stat.errors++
    if (c.duration_ms != null) { stat.totalMs += c.duration_ms; stat.count++ }
  }
  return Array.from(map.entries()).map(([agent_type, s]) => ({
    agent_type,
    department: s.dept,
    call_count: s.calls,
    error_count: s.errors,
    avg_duration_ms: s.count > 0 ? s.totalMs / s.count : null,
  }))
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  running: { bg: 'rgba(59,130,246,0.12)', color: 'var(--status-running, #3b82f6)' },
  success: { bg: 'rgba(34,197,94,0.12)', color: 'var(--status-done, #22c55e)' },
  error:   { bg: 'rgba(239,68,68,0.12)', color: 'var(--status-fail, #ef4444)' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.success
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: '8px',
      fontSize: '10px',
      fontWeight: 600,
      background: s.bg,
      color: s.color,
    }}>
      {status}
    </span>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function AgentsTab({ events, eventsLoading, eventsError }: AgentsTabProps) {
  const calls = useMemo(() => {
    if (!events || !Array.isArray(events)) return []
    return buildAgentCalls(events)
  }, [events])

  const stats = useMemo(() => buildAgentStats(calls), [calls])
  const activeCalls = useMemo(() => calls.filter(c => c.status === 'running'), [calls])

  if (eventsLoading && !events) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading agents...</div>
  }
  if (eventsError) {
    return <div style={{ padding: '20px', color: 'var(--status-fail)' }}>Error loading agents: {eventsError.message}</div>
  }
  if (calls.length === 0) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No agent calls recorded</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Summary stats */}
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        fontSize: '12px',
        color: 'var(--text-secondary)',
      }}>
        <span>Total Calls: <strong style={{ color: 'var(--text-primary)' }}>{calls.length}</strong></span>
        <span>Agents: <strong style={{ color: 'var(--text-primary)' }}>{stats.length}</strong></span>
        {activeCalls.length > 0 && (
          <span>Running: <strong style={{ color: 'var(--status-running, #3b82f6)' }}>{activeCalls.length}</strong></span>
        )}
        <span>Errors: <strong style={{ color: calls.filter(c => c.is_error).length > 0 ? 'var(--status-fail)' : 'var(--text-primary)' }}>
          {calls.filter(c => c.is_error).length}
        </strong></span>
      </div>

      {/* Active agents */}
      {activeCalls.length > 0 && (
        <div>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Active ({activeCalls.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {activeCalls.map(a => (
              <div key={a.call_id} style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.2)',
                fontSize: '11px',
                color: 'var(--text-primary)',
              }}>
                <span style={{ fontWeight: 600 }}>{a.agent_type}</span>
                {a.model && <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>{a.model}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent call history table */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 100px 80px 90px 80px 2fr',
          gap: '8px',
          padding: '8px 12px',
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          borderBottom: '1px solid var(--border-light)',
          background: 'var(--bg-secondary)',
        }}>
          <div>Agent</div>
          <div>Call ID</div>
          <div>Model</div>
          <div style={{ textAlign: 'right' }}>Duration</div>
          <div style={{ textAlign: 'center' }}>Status</div>
          <div>Description</div>
        </div>

        {/* Rows */}
        {calls.map((call, i) => {
          const deptInfo = DEPT_INFO[call.department] || { color: '#6c757d', label: call.department }
          return (
            <div
              key={`${call.call_id}-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 100px 80px 90px 80px 2fr',
                gap: '8px',
                padding: '7px 12px',
                fontSize: '11px',
                borderBottom: '1px solid var(--border-light)',
                background: call.is_error ? 'rgba(239,68,68,0.04)' : 'transparent',
              }}
            >
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: deptInfo.color, flexShrink: 0,
                }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {call.agent_type}
                </span>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {call.call_id ? call.call_id.slice(-12) : '-'}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                {call.model || '-'}
              </div>
              <div style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                {call.duration_ms != null ? formatDuration(call.duration_ms) : '-'}
              </div>
              <div style={{ textAlign: 'center' }}>
                <StatusBadge status={call.status} />
              </div>
              <div style={{
                color: 'var(--text-muted)', fontSize: '11px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {call.description || '-'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Per-agent summary */}
      {stats.length > 1 && (
        <div>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Summary by Agent
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', fontWeight: 500 }}>Agent</th>
                <th style={{ padding: '8px 12px', fontWeight: 500 }}>Calls</th>
                <th style={{ padding: '8px 12px', fontWeight: 500 }}>Errors</th>
                <th style={{ padding: '8px 12px', fontWeight: 500 }}>Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.agent_type} style={{ borderTop: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '6px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>{s.agent_type}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--text-secondary)' }}>{s.call_count}</td>
                  <td style={{ padding: '6px 12px', color: s.error_count > 0 ? 'var(--status-fail)' : 'var(--text-muted)' }}>{s.error_count}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--text-muted)' }}>
                    {s.avg_duration_ms != null ? formatDuration(s.avg_duration_ms) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
