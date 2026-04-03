'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { DEPT_INFO } from '@/lib/agents-config'
import { formatDuration, formatRelativeTime } from '@/lib/utils'
import type { Pipeline, PipelineStep, AgentCall } from '@/lib/types'

type BadgeVariant = 'success' | 'error' | 'running' | 'pending' | 'info'

interface PipelineListItem {
  slug: string
  type: string
  status: string
  startedAt: string | null
}

function statusToVariant(status: string): BadgeVariant {
  switch (status) {
    case 'done': case 'success': case 'completed': return 'success'
    case 'fail': case 'failed': case 'error': return 'error'
    case 'running': case 'in_progress': return 'running'
    case 'pending': case 'queued': case 'waiting': return 'pending'
    default: return 'info'
  }
}

function statusToColor(status: string): string {
  switch (status) {
    case 'done': case 'success': case 'completed': return 'var(--status-done)'
    case 'fail': case 'failed': case 'error': return 'var(--status-fail)'
    case 'running': case 'in_progress': return 'var(--status-running)'
    case 'skipped': return 'var(--status-skipped)'
    default: return 'var(--status-pending)'
  }
}

function agentColor(agentType: string): string {
  const dept = agentType.includes('frontend') || agentType.includes('backend') || agentType.includes('platform') || agentType.includes('data-integration')
    ? 'engineering'
    : agentType.includes('product-strategy') || agentType.includes('business-analysis') || agentType.includes('ux-research') || agentType.includes('project-governance')
    ? 'planning'
    : agentType.includes('qa') || agentType.includes('automation') || agentType.includes('defect') || agentType.includes('release')
    ? 'qa'
    : agentType.includes('analytics') || agentType.includes('experiment') || agentType.includes('performance') || agentType.includes('kpi')
    ? 'evaluation'
    : 'management'
  return DEPT_INFO[dept]?.color || '#6b7280'
}

async function deletePipeline(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/pipelines?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' })
    return res.ok
  } catch { return false }
}

async function deleteAllPipelines(): Promise<boolean> {
  try {
    const res = await fetch('/api/pipelines', { method: 'DELETE' })
    return res.ok
  } catch { return false }
}

/* ── Pipeline Card (list view) ── */
function PipelineCard({ pipeline, onClick, onDelete }: { pipeline: PipelineListItem; onClick: () => void; onDelete: () => void }) {
  const variant = statusToVariant(pipeline.status)
  return (
    <div
      onClick={onClick}
      style={{
        padding: '16px 20px',
        borderRadius: '10px',
        border: '1px solid var(--border-light)',
        background: 'var(--bg-card)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        boxShadow: '0 1px 3px var(--shadow)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent)'
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.boxShadow = '0 4px 12px var(--shadow-lg)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border-light)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 1px 3px var(--shadow)'
      }}
    >
      {/* Status indicator */}
      <div style={{
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: statusToColor(pipeline.status),
        flexShrink: 0,
        boxShadow: pipeline.status === 'running' ? `0 0 8px ${statusToColor(pipeline.status)}` : 'none',
      }} />
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono, monospace)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {pipeline.slug}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {pipeline.type}
          {pipeline.startedAt && ` · ${formatRelativeTime(pipeline.startedAt)}`}
        </div>
      </div>
      {/* Status badge */}
      <Badge variant={variant} pulse={pipeline.status === 'running' || pipeline.status === 'in_progress'}>
        {pipeline.status}
      </Badge>
      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        title="Delete pipeline"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: '14px',
          padding: '4px',
          borderRadius: '4px',
          lineHeight: 1,
          opacity: 0.5,
          transition: 'opacity 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--status-fail)' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        ✕
      </button>
      <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>›</span>
    </div>
  )
}

/* ── Step Node (SVG) ── */
function StepNode({
  step,
  agents,
  x,
  y,
  width,
  isLast,
  onAgentClick,
}: {
  step: PipelineStep
  agents: AgentCall[]
  x: number
  y: number
  width: number
  isLast: boolean
  onAgentClick: (a: AgentCall) => void
}) {
  const color = statusToColor(step.status)
  const nodeH = Math.max(70, 50 + agents.length * 28)
  const isRunning = step.status === 'running' || step.status === 'in_progress'

  return (
    <g>
      {/* Node background */}
      <rect
        x={x}
        y={y}
        width={width}
        height={nodeH}
        rx={10}
        fill="var(--bg-card)"
        stroke={color}
        strokeWidth={isRunning ? 2 : 1.5}
        strokeOpacity={isRunning ? 1 : 0.6}
      />
      {/* Status bar top */}
      <rect
        x={x}
        y={y}
        width={width}
        height={4}
        rx={2}
        fill={color}
      />
      {/* Step header */}
      <text
        x={x + 12}
        y={y + 22}
        fontSize={12}
        fontWeight={600}
        fill="var(--text-primary)"
      >
        {step.name.length > 22 ? step.name.slice(0, 20) + '..' : step.name}
      </text>
      {/* Duration */}
      {step.durationMs != null && (
        <text
          x={x + width - 8}
          y={y + 22}
          fontSize={10}
          fill="var(--text-muted)"
          textAnchor="end"
        >
          {formatDuration(step.durationMs)}
        </text>
      )}
      {/* Agent pills */}
      {agents.map((a, i) => {
        const ay = y + 36 + i * 28
        const aColor = agentColor(a.agentType)
        const aStatus = a.isError ? 'error' : a.endedAt ? 'done' : 'running'
        return (
          <g
            key={a.callId || i}
            onClick={(e) => { e.stopPropagation(); onAgentClick(a) }}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={x + 8}
              y={ay}
              width={width - 16}
              height={22}
              rx={4}
              fill={aColor}
              opacity={0.12}
              stroke={aColor}
              strokeWidth={0.5}
              strokeOpacity={0.3}
            />
            {/* Status dot */}
            <circle
              cx={x + 18}
              cy={ay + 11}
              r={3}
              fill={statusToColor(aStatus)}
            />
            {/* Agent name */}
            <text x={x + 26} y={ay + 15} fontSize={10} fill={aColor} fontWeight={500}>
              {a.agentType.length > 18 ? a.agentType.slice(0, 16) + '..' : a.agentType}
            </text>
            {/* Model + duration */}
            <text x={x + width - 14} y={ay + 15} fontSize={9} fill="var(--text-muted)" textAnchor="end">
              {a.model}{a.durationMs != null ? ` · ${formatDuration(a.durationMs)}` : ''}
            </text>
          </g>
        )
      })}
      {isRunning && (
        <rect
          x={x}
          y={y}
          width={width}
          height={nodeH}
          rx={10}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0.4}
          style={{ animation: 'pulse 2s infinite' }}
        />
      )}
    </g>
  )
}

/* ── Custom DAG View ── */
function DagView({ pipeline, onAgentClick }: { pipeline: Pipeline; onAgentClick: (a: AgentCall) => void }) {
  const nodeW = 240
  const nodeGap = 32
  const paddingX = 24
  const paddingY = 24

  // Group steps by phase
  const phases = useMemo(() => {
    const map = new Map<string, PipelineStep[]>()
    for (const step of pipeline.steps) {
      const phase = step.phase || 'Default'
      if (!map.has(phase)) map.set(phase, [])
      map.get(phase)!.push(step)
    }
    return Array.from(map.entries())
  }, [pipeline.steps])

  // Calculate positions
  const stepPositions = useMemo(() => {
    const positions: Array<{ step: PipelineStep; agents: AgentCall[]; x: number; y: number; h: number }> = []
    let curX = paddingX

    for (const [_, steps] of phases) {
      let maxH = 0
      for (const step of steps) {
        const agents = pipeline.agents.filter(a => a.stepNumber === step.number)
        const h = Math.max(70, 50 + agents.length * 28)
        positions.push({ step, agents, x: curX, y: paddingY + 30, h })
        curX += nodeW + nodeGap
        maxH = Math.max(maxH, h)
      }
    }
    return positions
  }, [pipeline, phases])

  const svgW = stepPositions.length > 0
    ? stepPositions[stepPositions.length - 1].x + nodeW + paddingX
    : 400
  const maxH = stepPositions.reduce((m, p) => Math.max(m, p.h), 70)
  const svgH = maxH + paddingY * 2 + 40

  // Summary stats
  const completedSteps = pipeline.steps.filter(s => s.status === 'done' || s.status === 'success' || s.status === 'completed').length
  const skippedSteps = pipeline.steps.filter(s => s.status === 'skipped').length
  const totalAgents = pipeline.agents.length
  const failedAgents = pipeline.agents.filter(a => a.isError).length

  return (
    <div>
      {/* Pipeline header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '14px 20px',
        background: 'var(--bg-card)',
        borderRadius: '10px',
        marginBottom: '16px',
        border: '1px solid var(--border-light)',
        boxShadow: '0 1px 3px var(--shadow)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {pipeline.slug}
            </span>
            <Badge variant={statusToVariant(pipeline.status)} pulse={pipeline.status === 'running'}>
              {pipeline.status}
            </Badge>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px' }}>
              {pipeline.type}
            </span>
          </div>
          {pipeline.startedAt && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Started {formatRelativeTime(pipeline.startedAt)}
              {pipeline.durationMs != null && ` · Total ${formatDuration(pipeline.durationMs)}`}
            </div>
          )}
        </div>
        {/* Stats */}
        <div style={{ display: 'flex', gap: '20px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{completedSteps}/{pipeline.steps.length}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Steps</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{totalAgents}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Agents</div>
          </div>
          {skippedSteps > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-skipped, #9ca3af)' }}>{skippedSteps}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Skipped</div>
            </div>
          )}
          {failedAgents > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-fail)' }}>{failedAgents}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Failed</div>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        height: '4px',
        background: 'var(--bg-tertiary)',
        borderRadius: '2px',
        marginBottom: '16px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pipeline.steps.length > 0 ? (completedSteps / pipeline.steps.length) * 100 : 0}%`,
          background: pipeline.status === 'failed' ? 'var(--status-fail)' : 'var(--status-done)',
          borderRadius: '2px',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* SVG DAG */}
      <div style={{
        overflowX: 'auto',
        background: 'var(--bg-card)',
        borderRadius: '10px',
        border: '1px solid var(--border-light)',
        padding: '8px',
      }}>
        <svg
          width={svgW}
          height={svgH}
          style={{ display: 'block', minWidth: '100%' }}
        >
          {/* Phase labels */}
          {(() => {
            let idx = 0
            return phases.map(([phaseName, steps]) => {
              const startX = stepPositions[idx]?.x ?? 0
              const endX = stepPositions[idx + steps.length - 1]?.x ?? startX
              idx += steps.length
              return (
                <text
                  key={phaseName}
                  x={(startX + endX + nodeW) / 2}
                  y={paddingY + 18}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--text-muted)"
                  opacity={0.7}
                >
                  {phaseName}
                </text>
              )
            })
          })()}

          {/* Edges between steps */}
          {stepPositions.map((pos, i) => {
            if (i === 0) return null
            const prev = stepPositions[i - 1]
            const fromX = prev.x + nodeW
            const toX = pos.x
            const midY = pos.y + Math.max(pos.h, prev.h) / 2
            return (
              <path
                key={`edge-${i}`}
                d={`M ${fromX} ${midY} C ${fromX + nodeGap / 2} ${midY}, ${toX - nodeGap / 2} ${midY}, ${toX} ${midY}`}
                fill="none"
                stroke="var(--border)"
                strokeWidth={2}
                strokeDasharray={pos.step.status === 'pending' || pos.step.status === 'skipped' ? '4 4' : 'none'}
                markerEnd="url(#arrowhead)"
              />
            )
          })}

          {/* Arrow marker */}
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="var(--border)" />
            </marker>
          </defs>

          {/* Step nodes */}
          {stepPositions.map((pos, i) => (
            <StepNode
              key={pos.step.number}
              step={pos.step}
              agents={pos.agents}
              x={pos.x}
              y={pos.y}
              width={nodeW}
              isLast={i === stepPositions.length - 1}
              onAgentClick={onAgentClick}
            />
          ))}
        </svg>
      </div>
    </div>
  )
}

/* ── Agent Detail Panel ── */
function AgentDetail({ agent, onClose }: { agent: AgentCall; onClose: () => void }) {
  const color = agentColor(agent.agentType)
  return (
    <div style={{
      position: 'fixed',
      right: '20px',
      top: '120px',
      width: '360px',
      maxHeight: 'calc(100vh - 160px)',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      boxShadow: '0 8px 32px var(--shadow-lg)',
      zIndex: 100,
      overflow: 'auto',
    }}>
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
              {agent.agentType}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)', padding: '4px' }}>
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
          <Badge variant={agent.isError ? 'error' : agent.endedAt ? 'success' : 'running'}>
            {agent.isError ? 'ERROR' : agent.endedAt ? 'DONE' : 'RUNNING'}
          </Badge>
          {agent.model && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px' }}>
              {agent.model}
            </span>
          )}
          {agent.durationMs != null && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px' }}>
              {formatDuration(agent.durationMs)}
            </span>
          )}
        </div>
      </div>
      <div style={{ padding: '16px', fontSize: '12px' }}>
        {agent.description && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}>Description</div>
            <div style={{ color: 'var(--text-primary)', lineHeight: '1.5' }}>{agent.description}</div>
          </div>
        )}
        {agent.input && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}>Input</div>
            <div style={{
              background: 'var(--bg-secondary)',
              padding: '8px 10px',
              borderRadius: '6px',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.5',
              maxHeight: '150px',
              overflowY: 'auto',
              color: 'var(--text-primary)',
            }}>
              {agent.input.length > 500 ? agent.input.slice(0, 500) + '...' : agent.input}
            </div>
          </div>
        )}
        {agent.output && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}>Output</div>
            <div style={{
              background: 'var(--bg-secondary)',
              padding: '8px 10px',
              borderRadius: '6px',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.5',
              maxHeight: '150px',
              overflowY: 'auto',
              color: 'var(--text-primary)',
            }}>
              {agent.output.length > 500 ? agent.output.slice(0, 500) + '...' : agent.output}
            </div>
          </div>
        )}
        {agent.resultSummary && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}>Result</div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>{agent.resultSummary}</div>
          </div>
        )}
        {agent.isError && agent.errorMessage && (
          <div style={{ color: 'var(--status-fail)', padding: '8px 10px', background: 'var(--error-bg)', borderRadius: '6px' }}>
            {agent.errorMessage}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main DagTab ── */
export function DagTab({ pipelineSlug: externalSlug }: { pipelineSlug: string | null }) {
  // showList: true = force list view even if externalSlug is set
  const [internalSlug, setInternalSlug] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<AgentCall | null>(null)
  const activeSlug = showList ? null : (internalSlug || externalSlug)

  const { data: pipelines, mutate: mutatePipelines } = usePolling<PipelineListItem[]>('/api/pipelines', 3000)
  const { data: pipelineData } = usePolling<Pipeline>(
    activeSlug ? `/api/events/${activeSlug}` : null,
    2000
  )

  // Reset showList when externalSlug changes (user picks a different pipeline in header)
  useEffect(() => {
    if (externalSlug) setShowList(false)
  }, [externalSlug])

  const handleDeletePipeline = useCallback(async (slug: string) => {
    if (!confirm(`"${slug}" 파이프라인 기록을 삭제할까요?`)) return
    const ok = await deletePipeline(slug)
    if (ok) { mutatePipelines(); if (slug === activeSlug) { setInternalSlug(null); setShowList(true) } }
  }, [mutatePipelines, activeSlug])

  const handleDeleteAll = useCallback(async () => {
    if (!confirm('모든 파이프라인 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return
    const ok = await deleteAllPipelines()
    if (ok) mutatePipelines()
  }, [mutatePipelines])

  // List view
  if (!activeSlug) {
    if (!pipelines || pipelines.length === 0) {
      return <EmptyState icon="🔀" title="No pipelines" description="Run a pipeline to see the DAG" />
    }
    return (
      <div style={{ padding: '20px', overflow: 'auto', height: '100%' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '16px',
        }}>
          <span style={{ fontSize: '16px' }}>🔀</span>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Pipeline DAGs</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{pipelines.length} pipeline(s)</span>
          <div style={{ flex: 1 }} />
          {pipelines.length > 1 && (
            <button
              onClick={handleDeleteAll}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '4px 12px',
                fontSize: '11px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--status-fail)'; e.currentTarget.style.borderColor = 'var(--status-fail)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              Clear all
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '600px' }}>
          {pipelines.map(p => (
            <PipelineCard
              key={p.slug}
              pipeline={p}
              onClick={() => { setInternalSlug(p.slug); setShowList(false) }}
              onDelete={() => handleDeletePipeline(p.slug)}
            />
          ))}
        </div>
      </div>
    )
  }

  // Detail view
  if (!pipelineData) {
    return (
      <div style={{ padding: '20px' }}>
        {!externalSlug && (
          <button
            onClick={() => { setInternalSlug(null); setShowList(true) }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '13px', padding: '0 0 12px 0' }}
          >
            ← Back to pipelines
          </button>
        )}
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading DAG...</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        {!externalSlug && (
          <button
            onClick={() => { setInternalSlug(null); setShowList(true); setSelectedAgent(null) }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '13px', padding: 0 }}
          >
            ← Back to pipelines
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={async () => {
            const slug = activeSlug!
            if (!confirm(`"${slug}" 파이프라인 기록을 삭제할까요?`)) return
            const ok = await deletePipeline(slug)
            if (ok) { setInternalSlug(null); setShowList(true); setSelectedAgent(null); mutatePipelines() }
          }}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '4px 12px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--status-fail)'; e.currentTarget.style.borderColor = 'var(--status-fail)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          Delete
        </button>
      </div>
      <DagView pipeline={pipelineData} onAgentClick={setSelectedAgent} />
      {selectedAgent && <AgentDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />}
    </div>
  )
}
