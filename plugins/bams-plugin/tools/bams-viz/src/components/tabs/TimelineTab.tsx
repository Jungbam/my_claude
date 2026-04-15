'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import { formatDuration } from '@/lib/utils'
import { AGENT_DEPT_MAP, DEPT_INFO } from '@/lib/agents-config'
import type { PipelineEvent } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────────────────

interface StepEntry {
  step_number: number
  step_name: string
  phase: string
  status: 'running' | 'done' | 'fail' | 'skipped'
  duration_ms: number | null
  started_at: string
  agents: AgentEntry[]
}

interface AgentEntry {
  call_id: string
  agent_type: string
  department: string
  status: 'running' | 'success' | 'error'
  duration_ms: number | null
  description: string
  started_at: string
}

interface TimelineTabProps {
  pipelineSlug: string | null
  events: PipelineEvent[] | null
  eventsLoading: boolean
  eventsError: Error | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTimeline(events: PipelineEvent[]): { steps: StepEntry[]; pipelineStatus: string | null; pipelineDuration: number | null } {
  const stepStarts = events.filter(e => e.type === 'step_start') as Array<PipelineEvent & {
    step_number?: number; step_name?: string; phase?: string
  }>
  const stepEnds = events.filter(e => e.type === 'step_end') as Array<PipelineEvent & {
    step_number?: number; status?: string; duration_ms?: number
  }>
  const agentStarts = events.filter(e => e.type === 'agent_start') as Array<PipelineEvent & {
    call_id?: string; agent_type?: string; department?: string; step_number?: number; description?: string
  }>
  const agentEnds = events.filter(e => e.type === 'agent_end') as Array<PipelineEvent & {
    call_id?: string; agent_type?: string; is_error?: boolean; status?: string; duration_ms?: number
  }>

  const pipelineEnd = events.find(e => e.type === 'pipeline_end') as (PipelineEvent & { status?: string; duration_ms?: number }) | undefined
  const pipelineEnded = !!pipelineEnd

  const stepEndMap = new Map(stepEnds.map(e => [e.step_number, e]))
  const agentEndMap = new Map(agentEnds.map(e => [e.call_id, e]))

  // Group agents by step_number. Agents without step_number get assigned to the closest preceding step by timestamp.
  const agentsByStep = new Map<number, typeof agentStarts>()
  for (const a of agentStarts) {
    let stepNum = a.step_number
    if (stepNum == null) {
      // Find the latest step_start before this agent's ts
      const aTime = new Date(a.ts).getTime()
      let bestStep: number | null = null
      let bestTime = -Infinity
      for (const ss of stepStarts) {
        const ssTime = new Date(ss.ts).getTime()
        if (ssTime <= aTime && ssTime > bestTime && ss.step_number != null) {
          bestTime = ssTime
          bestStep = ss.step_number
        }
      }
      stepNum = bestStep ?? -1
    }
    if (!agentsByStep.has(stepNum)) agentsByStep.set(stepNum, [])
    agentsByStep.get(stepNum)!.push(a)
  }

  const steps: StepEntry[] = stepStarts.map(ss => {
    const stepNum = ss.step_number ?? 0
    const end = stepEndMap.get(stepNum)
    const stepAgents = agentsByStep.get(stepNum) ?? []

    const agents: AgentEntry[] = stepAgents.map(a => {
      const aEnd = agentEndMap.get(a.call_id)
      const isOrphan = !aEnd && pipelineEnded
      return {
        call_id: a.call_id ?? '',
        agent_type: a.agent_type ?? 'unknown',
        department: a.department ?? AGENT_DEPT_MAP[a.agent_type ?? ''] ?? '',
        status: aEnd
          ? (aEnd.is_error || aEnd.status === 'error' ? 'error' : 'success')
          : (isOrphan ? 'error' : 'running'),
        duration_ms: aEnd?.duration_ms ?? null,
        description: (a.description as string) ?? '',
        started_at: a.ts,
      }
    })

    return {
      step_number: stepNum,
      step_name: (ss.step_name as string) ?? `Step ${stepNum}`,
      phase: (ss.phase as string) ?? '',
      status: end
        ? ((end.status as string) === 'done' ? 'done' : (end.status as string) === 'skipped' ? 'skipped' : 'fail')
        : (pipelineEnded ? 'fail' : 'running'),
      duration_ms: end?.duration_ms ?? null,
      started_at: ss.ts,
      agents,
    }
  })

  // Sort by step_number
  steps.sort((a, b) => a.step_number - b.step_number)

  return {
    steps,
    pipelineStatus: (pipelineEnd?.status as string) ?? null,
    pipelineDuration: pipelineEnd?.duration_ms ?? null,
  }
}

// ── Status styles ────────────────────────────────────────────────────────────

const STEP_STATUS_STYLES: Record<string, { bg: string; border: string; dot: string }> = {
  running: { bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.3)', dot: '#3b82f6' },
  done:    { bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.3)',  dot: '#22c55e' },
  fail:    { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.3)',  dot: '#ef4444' },
  skipped: { bg: 'rgba(156,163,175,0.06)', border: 'rgba(156,163,175,0.3)', dot: '#9ca3af' },
}

// ── Step Card ────────────────────────────────────────────────────────────────

function StepCard({ step }: { step: StepEntry }) {
  const style = STEP_STATUS_STYLES[step.status] ?? STEP_STATUS_STYLES.running
  const time = new Date(step.started_at).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      marginBottom: '2px',
    }}>
      {/* Timeline connector */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '20px', flexShrink: 0, paddingTop: '14px' }}>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%',
          background: style.dot, flexShrink: 0,
          boxShadow: step.status === 'running' ? `0 0 6px ${style.dot}` : 'none',
        }} />
        <div style={{ flex: 1, width: '1px', background: 'var(--border-light)', marginTop: '4px' }} />
      </div>

      {/* Step content */}
      <div style={{
        flex: 1,
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: '8px',
        padding: '10px 14px',
        marginBottom: '8px',
      }}>
        {/* Step header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: step.agents.length > 0 ? '10px' : 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Step {step.step_number}: {step.step_name}
          </span>
          {step.status === 'running' && <Badge variant="running" pulse>ACTIVE</Badge>}
          {step.status === 'fail' && <Badge variant="error">FAIL</Badge>}
          {step.status === 'skipped' && <Badge variant="pending">SKIPPED</Badge>}
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{time}</span>
        </div>

        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: step.agents.length > 0 ? '8px' : 0 }}>
          {step.phase && <span>Phase: {step.phase}</span>}
          {step.duration_ms != null && <span>Duration: {formatDuration(step.duration_ms)}</span>}
        </div>

        {/* Nested agent calls */}
        {step.agents.length > 0 && (
          <div style={{
            borderTop: '1px solid var(--border-light)',
            paddingTop: '8px',
          }}>
            {step.agents.map((agent, i) => {
              const deptInfo = DEPT_INFO[agent.department] || { color: '#6c757d', label: agent.department }
              return (
                <div key={`${agent.call_id}-${i}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 0',
                  paddingLeft: '12px',
                  borderLeft: `2px solid ${deptInfo.color}40`,
                  marginBottom: '4px',
                  fontSize: '11px',
                }}>
                  <span style={{
                    width: '5px', height: '5px', borderRadius: '50%',
                    background: agent.status === 'error' ? '#ef4444' : agent.status === 'running' ? '#3b82f6' : '#22c55e',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 600, color: deptInfo.color }}>{agent.agent_type}</span>
                  {agent.status === 'error' && <Badge variant="error">ERR</Badge>}
                  {agent.status === 'running' && <Badge variant="running" pulse>ACTIVE</Badge>}
                  {agent.duration_ms != null && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{formatDuration(agent.duration_ms)}</span>
                  )}
                  {agent.description && (
                    <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                      {agent.description}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function TimelineTab({ events, eventsLoading, eventsError }: TimelineTabProps) {
  const timeline = useMemo(() => {
    if (!events || !Array.isArray(events)) return null
    return buildTimeline(events)
  }, [events])

  if (eventsLoading && !events) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading timeline...</div>
  }
  if (eventsError) {
    return <div style={{ padding: '20px', color: 'var(--status-fail)' }}>Error: {eventsError.message}</div>
  }
  if (!timeline || timeline.steps.length === 0) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No steps recorded</div>
  }

  const { steps, pipelineStatus, pipelineDuration } = timeline

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {/* Pipeline summary bar */}
      <div style={{
        display: 'flex',
        gap: '16px',
        fontSize: '12px',
        color: 'var(--text-secondary)',
        marginBottom: '8px',
      }}>
        <span>Steps: <strong style={{ color: 'var(--text-primary)' }}>{steps.length}</strong></span>
        {pipelineStatus && (
          <span>Pipeline: <strong style={{
            color: pipelineStatus === 'completed' ? 'var(--status-done, #22c55e)' :
              pipelineStatus === 'failed' ? 'var(--status-fail, #ef4444)' : 'var(--text-primary)',
          }}>{pipelineStatus}</strong></span>
        )}
        {pipelineDuration != null && (
          <span>Total: <strong style={{ color: 'var(--text-primary)' }}>{formatDuration(pipelineDuration)}</strong></span>
        )}
      </div>

      {/* Step timeline */}
      {steps.map(step => (
        <StepCard key={step.step_number} step={step} />
      ))}
    </div>
  )
}
