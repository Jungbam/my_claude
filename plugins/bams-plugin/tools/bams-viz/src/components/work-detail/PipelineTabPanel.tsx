'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { PipelinesPanel } from './PipelinesPanel'
import { PipelineSubTabs } from './PipelineSubTabs'
import { TimelineTab } from '@/components/tabs/TimelineTab'
import { formatDuration } from '@/lib/utils'
import { AGENT_DEPT_MAP, DEPT_INFO } from '@/lib/agents-config'
import type { WorkUnitPipeline, PipelineSubTab, PipelineEvent } from '@/lib/types'

// ── Event type styles ─────────────────────────────────────────────────────────
const EVENT_TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pipeline_start: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'pipeline' },
  pipeline_end:   { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'pipeline' },
  step_start:     { bg: 'rgba(34,197,94,0.1)',  color: '#22c55e', label: 'step' },
  step_end:       { bg: 'rgba(34,197,94,0.1)',  color: '#22c55e', label: 'step' },
  agent_start:    { bg: 'rgba(168,85,247,0.1)', color: '#a855f7', label: 'agent' },
  agent_end:      { bg: 'rgba(168,85,247,0.1)', color: '#a855f7', label: 'agent' },
  error:          { bg: 'rgba(239,68,68,0.1)',  color: '#ef4444', label: 'error' },
}

const DEFAULT_EVENT_STYLE = { bg: 'rgba(156,163,175,0.1)', color: '#9ca3af', label: 'event' }

function getEventStyle(type: string) {
  return EVENT_TYPE_STYLES[type] ?? DEFAULT_EVENT_STYLE
}

function getAgentColor(agentType: string): string | undefined {
  const dept = AGENT_DEPT_MAP[agentType]
  return dept ? DEPT_INFO[dept]?.color : undefined
}

function sanitizeSvgId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_')
}

function getEventDetails(event: PipelineEvent): string {
  const ev = event as Record<string, unknown>
  switch (event.type) {
    case 'pipeline_start':
      return `command: ${ev.command ?? '-'}`
    case 'pipeline_end':
      return `status: ${ev.status}${ev.duration_ms ? `, ${formatDuration(ev.duration_ms as number)}` : ''}`
    case 'step_start':
      return `step ${ev.step_number}: ${ev.step_name} (phase: ${ev.phase})`
    case 'step_end':
      return `step ${ev.step_number} ${ev.status}${ev.duration_ms ? `, ${formatDuration(ev.duration_ms as number)}` : ''}`
    case 'agent_start':
      return `${ev.agent_type}${ev.description ? ` — ${ev.description}` : ''}`
    case 'agent_end':
      return `${ev.agent_type} ${ev.is_error ? 'FAILED' : 'OK'}${ev.duration_ms ? `, ${formatDuration(ev.duration_ms as number)}` : ''}`
    case 'error':
      return (ev.message as string) ?? ''
    default:
      return JSON.stringify(
        Object.fromEntries(
          Object.entries(ev).filter(([k]) => !['type', 'ts', 'pipeline_slug'].includes(k))
        )
      )
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface PipelineTabPanelProps {
  pipelines: WorkUnitPipeline[]
  wuSlug: string
  selectedPipelineSlug: string | null
  onSelectPipeline: (slug: string) => void
  activePipelineSubTab: PipelineSubTab
  onSubTabChange: (tab: PipelineSubTab) => void
}

// ── AgentsPanel ───────────────────────────────────────────────────────────────
function AgentsPanel({ pipelineSlug }: { pipelineSlug: string }) {
  const { data, isLoading, error } = usePolling<PipelineEvent[]>(
    `/api/events/raw/${encodeURIComponent(pipelineSlug)}`,
    5000
  )

  const { stats, activeAgents } = useMemo(() => {
    if (!data || !Array.isArray(data)) return { stats: [], activeAgents: [] }

    const starts = data.filter(e => e.type === 'agent_start') as Array<PipelineEvent & {
      call_id?: string
      agent_type?: string
    }>
    const ends = data.filter(e => e.type === 'agent_end') as Array<PipelineEvent & {
      call_id?: string
      agent_type?: string
      is_error?: boolean
      status?: string
      duration_ms?: number
    }>
    const endMap = new Map(ends.map(e => [e.call_id, e]))

    // Active = start without matching end
    const active = starts
      .filter(s => !endMap.has(s.call_id))
      .map(s => ({
        call_id: s.call_id ?? '',
        agent_type: s.agent_type ?? 'unknown',
        pipeline_slug: (s as Record<string, unknown>).pipeline_slug as string ?? pipelineSlug,
        started_at: s.ts,
      }))

    // Stats per agent_type
    const agentMap = new Map<string, { calls: number; errors: number; totalMs: number; count: number }>()
    for (const s of starts) {
      const at = s.agent_type ?? 'unknown'
      if (!agentMap.has(at)) agentMap.set(at, { calls: 0, errors: 0, totalMs: 0, count: 0 })
      const stat = agentMap.get(at)!
      stat.calls++
      const end = endMap.get(s.call_id)
      if (end) {
        if (end.status === 'error' || end.is_error) stat.errors++
        if (end.duration_ms) { stat.totalMs += end.duration_ms; stat.count++ }
      }
    }

    const computedStats = Array.from(agentMap.entries()).map(([agent_type, s]) => ({
      agent_type,
      call_count: s.calls,
      error_count: s.errors,
      avg_duration_ms: s.count > 0 ? s.totalMs / s.count : null,
    }))

    return { stats: computedStats, activeAgents: active }
  }, [data, pipelineSlug])

  if (isLoading && !data) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading agents...</div>
  }
  if (error) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--status-fail)', fontSize: '12px' }}>Failed to load agents</div>
  }

  return (
    <div>
      {activeAgents.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Active ({activeAgents.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {activeAgents.map(a => (
              <div key={a.call_id} style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.2)',
                fontSize: '11px',
                color: 'var(--text-primary)',
              }}>
                <span style={{ fontWeight: 600 }}>{a.agent_type}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>{a.pipeline_slug}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.length > 0 ? (
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
                  {s.avg_duration_ms != null ? `${Math.round(s.avg_duration_ms / 1000)}s` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          No agent data available
        </div>
      )}
    </div>
  )
}

// ── DagPanel ──────────────────────────────────────────────────────────────────
function DagPanel({ pipelineSlug }: { pipelineSlug: string }) {
  const { data, isLoading, error } = usePolling<PipelineEvent[]>(
    `/api/events/raw/${encodeURIComponent(pipelineSlug)}`,
    5000
  )

  const graphData = useMemo(() => {
    if (!data || !Array.isArray(data)) return null

    const starts = data.filter(e => e.type === 'agent_start') as Array<PipelineEvent & {
      agent_type?: string
      call_id?: string
      pipeline_slug?: string
    }>
    const ends = data.filter(e => e.type === 'agent_end') as Array<PipelineEvent & {
      agent_type?: string
      call_id?: string
      is_error?: boolean
      pipeline_slug?: string
    }>

    if (starts.length === 0) return null

    // Build: pipeline -> agents (ordered)
    const pipelines = new Map<string, string[]>()
    for (const s of starts) {
      const pSlug = s.pipeline_slug ?? pipelineSlug
      const agent = s.agent_type ?? 'unknown'
      if (!pipelines.has(pSlug)) pipelines.set(pSlug, [])
      const agents = pipelines.get(pSlug)!
      if (!agents.includes(agent)) agents.push(agent)
    }

    // Error agents
    const errorAgents = new Set<string>()
    for (const e of ends) {
      if (e.is_error && e.agent_type) errorAgents.add(e.agent_type)
    }

    // Mermaid code (for copy button)
    const lines: string[] = ['graph TD']
    for (const [pSlug, agents] of pipelines) {
      const pId = sanitizeSvgId(pSlug)
      lines.push(`  ${pId}["${pSlug}"]`)
      lines.push(`  style ${pId} fill:#1e3a5f,stroke:#3b82f6,color:#fff`)
      for (let i = 0; i < agents.length; i++) {
        const aId = sanitizeSvgId(`${pSlug}_${agents[i]}`)
        lines.push(`  ${pId} --> ${aId}["${agents[i]}"]`)
        if (errorAgents.has(agents[i])) {
          lines.push(`  style ${aId} fill:#5f1e1e,stroke:#ef4444,color:#fff`)
        }
        if (i > 0) {
          const prevId = sanitizeSvgId(`${pSlug}_${agents[i - 1]}`)
          lines.push(`  ${prevId} -.-> ${aId}`)
        }
      }
    }
    const mermaidCode = lines.join('\n')

    return { pipelines, errorAgents, mermaidCode }
  }, [data, pipelineSlug])

  if (isLoading && !data) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading DAG...</div>
  }
  if (error) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--status-fail)', fontSize: '12px' }}>Failed to load DAG data</div>
  }
  if (!graphData) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No agent call data available for DAG</div>
  }

  const { pipelines, errorAgents, mermaidCode } = graphData

  // ── SVG layout constants ──
  const PIPELINE_NODE_W = 160
  const PIPELINE_NODE_H = 36
  const AGENT_NODE_W = 140
  const AGENT_NODE_H = 30
  const H_GAP = 24
  const PIPELINE_Y = 20
  const AGENT_Y_START = 100
  const AGENT_ROW_H = 50

  // Collect all unique agents globally
  const allAgents: string[] = []
  for (const agents of pipelines.values()) {
    for (const a of agents) {
      if (!allAgents.includes(a)) allAgents.push(a)
    }
  }

  const pipelineList = Array.from(pipelines.keys())
  const numPipelines = pipelineList.length
  const numAgents = allAgents.length

  const svgWidth = Math.max(
    numPipelines * (PIPELINE_NODE_W + H_GAP) + H_GAP,
    numAgents * (AGENT_NODE_W + H_GAP) + H_GAP,
    400
  )
  const svgHeight = AGENT_Y_START + numAgents * AGENT_ROW_H + 40

  const pipelineXMap: Record<string, number> = {}
  pipelineList.forEach((pSlug, i) => {
    pipelineXMap[pSlug] = H_GAP + i * (PIPELINE_NODE_W + H_GAP) + PIPELINE_NODE_W / 2
  })

  const agentYMap: Record<string, number> = {}
  allAgents.forEach((a, i) => {
    agentYMap[a] = AGENT_Y_START + i * AGENT_ROW_H + AGENT_NODE_H / 2
  })

  const agentsColumnX = svgWidth / 2

  return (
    <div>
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Agent Call DAG</h3>
        <button
          onClick={() => { navigator.clipboard.writeText(mermaidCode) }}
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          Copy Mermaid
        </button>
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '16px',
        overflow: 'auto',
        marginBottom: '16px',
      }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: '100%', minWidth: `${Math.min(svgWidth, 800)}px`, height: 'auto', display: 'block' }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
            </marker>
            <marker id="arrowhead-dash" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#6b7280" />
            </marker>
          </defs>

          {/* Pipeline nodes */}
          {pipelineList.map(pSlug => {
            const cx = pipelineXMap[pSlug]
            const x = cx - PIPELINE_NODE_W / 2
            const agents = pipelines.get(pSlug) ?? []

            return (
              <g key={pSlug}>
                <rect
                  x={x}
                  y={PIPELINE_Y}
                  width={PIPELINE_NODE_W}
                  height={PIPELINE_NODE_H}
                  rx={6}
                  fill="#1e3a5f"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                />
                <text
                  x={cx}
                  y={PIPELINE_Y + PIPELINE_NODE_H / 2 + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="#93c5fd"
                >
                  {pSlug.length > 22 ? pSlug.slice(0, 20) + '..' : pSlug}
                </text>

                {/* Edges: pipeline -> each agent */}
                {agents.map(agent => {
                  const ay = agentYMap[agent]
                  return (
                    <line
                      key={`${pSlug}-${agent}`}
                      x1={cx}
                      y1={PIPELINE_Y + PIPELINE_NODE_H}
                      x2={agentsColumnX}
                      y2={ay - AGENT_NODE_H / 2}
                      stroke="#3b82f6"
                      strokeWidth={1}
                      strokeOpacity={0.5}
                      markerEnd="url(#arrowhead)"
                    />
                  )
                })}

                {/* Sequence edges: agent[i-1] -> agent[i] (dashed) */}
                {agents.map((agent, i) => {
                  if (i === 0) return null
                  const prevAgent = agents[i - 1]
                  const y1 = agentYMap[prevAgent] + AGENT_NODE_H / 2
                  const y2 = agentYMap[agent] - AGENT_NODE_H / 2
                  return (
                    <line
                      key={`seq-${pSlug}-${i}`}
                      x1={agentsColumnX + AGENT_NODE_W / 2 + 8}
                      y1={y1}
                      x2={agentsColumnX + AGENT_NODE_W / 2 + 8}
                      y2={y2}
                      stroke="#6b7280"
                      strokeWidth={1}
                      strokeDasharray="4 3"
                      strokeOpacity={0.6}
                      markerEnd="url(#arrowhead-dash)"
                    />
                  )
                })}
              </g>
            )
          })}

          {/* Agent nodes */}
          {allAgents.map(agent => {
            const cy = agentYMap[agent]
            const isError = errorAgents.has(agent)
            const agentColor = getAgentColor(agent)
            const fillColor = isError ? 'rgba(239,68,68,0.15)' : agentColor ? `${agentColor}22` : 'rgba(59,130,246,0.12)'
            const borderColor = isError ? '#ef4444' : agentColor ?? '#3b82f6'
            const textColor = isError ? '#fca5a5' : agentColor ?? '#93c5fd'
            const ax = agentsColumnX - AGENT_NODE_W / 2

            return (
              <g key={agent}>
                <rect
                  x={ax}
                  y={cy - AGENT_NODE_H / 2}
                  width={AGENT_NODE_W}
                  height={AGENT_NODE_H}
                  rx={5}
                  fill={fillColor}
                  stroke={borderColor}
                  strokeWidth={1}
                  strokeOpacity={0.6}
                />
                <text
                  x={agentsColumnX}
                  y={cy + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill={textColor}
                >
                  {agent.length > 20 ? agent.slice(0, 18) + '..' : agent}
                </text>
                {isError && (
                  <circle cx={ax + AGENT_NODE_W - 8} cy={cy} r={5} fill="#ef4444" opacity={0.8} />
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <details style={{ marginTop: '8px' }}>
        <summary style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
          Mermaid source
        </summary>
        <pre style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '11px',
          fontFamily: 'monospace',
          color: 'var(--text-primary)',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
          marginTop: '8px',
        }}>
          {mermaidCode}
        </pre>
      </details>
    </div>
  )
}

// ── LogRow ────────────────────────────────────────────────────────────────────
function LogRow({ event, index }: { event: PipelineEvent; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const ev = event as Record<string, unknown>
  const style = getEventStyle(event.type)
  const isError = event.type === 'error' || ev.is_error === true
  const agentType = ev.agent_type as string | undefined
  const agentColor = agentType ? getAgentColor(agentType) : undefined
  const inputText = ev.input as string | undefined
  const outputText = ev.output as string | undefined

  const time = new Date(event.ts).toLocaleTimeString('ko-KR', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const details = getEventDetails(event)
  const rawJson = JSON.stringify(event, null, 2)

  return (
    <div style={{
      borderBottom: '1px solid var(--border-light)',
      background: isError ? 'rgba(239,68,68,0.04)' : index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
    }}>
      {/* Main row */}
      <div
        onClick={() => setExpanded(p => !p)}
        style={{
          display: 'grid',
          gridTemplateColumns: '70px 90px 1fr 1fr auto',
          gap: '8px',
          alignItems: 'center',
          padding: '6px 10px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {time}
        </span>
        <span style={{
          display: 'inline-block',
          padding: '2px 7px',
          borderRadius: '10px',
          fontSize: '10px',
          fontWeight: 600,
          background: style.bg,
          color: style.color,
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}>
          {style.label}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.pipeline_slug ?? '-'}
        </span>
        <span style={{
          fontSize: '11px',
          color: agentColor ?? 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: agentType ? 500 : 400,
        }}>
          {agentType ?? details.slice(0, 40)}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : 'none' }}>
          ▼
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '0 10px 10px 10px' }}>
          {agentType && (
            <div style={{ fontSize: '11px', color: agentColor ?? 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
              {event.type} — {agentType}
            </div>
          )}
          {inputText && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Input</div>
              <pre style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)',
                borderRadius: '4px',
                padding: '8px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                maxHeight: '120px',
                margin: 0,
              }}>
                {inputText.length > 800 ? inputText.slice(0, 800) + '\n...[truncated]' : inputText}
              </pre>
            </div>
          )}
          {outputText && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Output</div>
              <pre style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)',
                borderRadius: '4px',
                padding: '8px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                maxHeight: '120px',
                margin: 0,
              }}>
                {outputText.length > 800 ? outputText.slice(0, 800) + '\n...[truncated]' : outputText}
              </pre>
            </div>
          )}
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Raw JSON</div>
            <pre style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              color: 'var(--text-muted)',
              background: 'var(--bg-secondary)',
              borderRadius: '4px',
              padding: '8px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              maxHeight: '200px',
              margin: 0,
            }}>
              {rawJson}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── LogsPanel ─────────────────────────────────────────────────────────────────
function LogsPanel({ pipelineSlug }: { pipelineSlug: string }) {
  const [filter, setFilter] = useState('')
  const [autoScroll, setAutoScroll] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, error } = usePolling<PipelineEvent[]>(
    `/api/events/raw/${encodeURIComponent(pipelineSlug)}`,
    3000
  )

  const events = useMemo(() => {
    if (!data || !Array.isArray(data)) return []
    if (!filter) return data
    const lower = filter.toLowerCase()
    return data.filter(e =>
      e.type.toLowerCase().includes(lower) ||
      (e.pipeline_slug && String(e.pipeline_slug).toLowerCase().includes(lower)) ||
      JSON.stringify(e).toLowerCase().includes(lower)
    )
  }, [data, filter])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events, autoScroll])

  if (isLoading && !data) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading logs...</div>
  }
  if (error) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--status-fail)', fontSize: '12px' }}>Failed to load logs</div>
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter events (type, pipeline, agent...)"
          style={{
            flex: 1,
            padding: '7px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setAutoScroll(p => !p)}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: `1px solid ${autoScroll ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
            background: autoScroll ? 'rgba(59,130,246,0.1)' : 'var(--bg-card)',
            color: autoScroll ? '#3b82f6' : 'var(--text-secondary)',
            fontSize: '11px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Auto-scroll {autoScroll ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Events list */}
      {events.length > 0 ? (
        <div
          ref={scrollRef}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            overflow: 'auto',
            maxHeight: '600px',
          }}
        >
          {events.map((event, i) => (
            <LogRow key={`${event.ts}-${i}`} event={event} index={i} />
          ))}
        </div>
      ) : (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          No events found
        </div>
      )}
    </div>
  )
}

// ── PipelineTabPanel (main export) ────────────────────────────────────────────
export function PipelineTabPanel({
  pipelines,
  wuSlug,
  selectedPipelineSlug,
  onSelectPipeline,
  activePipelineSubTab,
  onSubTabChange,
}: PipelineTabPanelProps) {
  if (pipelines.length === 0) {
    return <PipelinesPanel pipelines={[]} wuSlug={wuSlug} />
  }

  return (
    <div>
      <PipelinesPanel
        pipelines={pipelines}
        wuSlug={wuSlug}
        selectedSlug={selectedPipelineSlug ?? undefined}
        onSelect={onSelectPipeline}
      />
      {selectedPipelineSlug && (
        <>
          <PipelineSubTabs
            activeSubTab={activePipelineSubTab}
            onSubTabChange={onSubTabChange}
          />
          {activePipelineSubTab === 'agent' && (
            <AgentsPanel pipelineSlug={selectedPipelineSlug} />
          )}
          {activePipelineSubTab === 'timeline' && (
            <TimelineTab
              pipelineSlug={selectedPipelineSlug}
              onNavigateToLogs={() => onSubTabChange('logs')}
            />
          )}
          {activePipelineSubTab === 'dag' && (
            <DagPanel pipelineSlug={selectedPipelineSlug} />
          )}
          {activePipelineSubTab === 'logs' && (
            <LogsPanel pipelineSlug={selectedPipelineSlug} />
          )}
        </>
      )}
    </div>
  )
}
