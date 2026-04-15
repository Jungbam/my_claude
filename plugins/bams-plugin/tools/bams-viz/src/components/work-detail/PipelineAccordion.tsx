'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TaskTable } from './TaskTable'
import { formatDuration } from '@/lib/utils'
import { bamsApi } from '@/lib/bams-api'
import type { WorkUnitPipeline, PipelineEvent } from '@/lib/types'

interface PipelineAccordionProps {
  pipeline: WorkUnitPipeline
  wuSlug: string
  selected?: boolean
  onSelect?: (slug: string) => void
  // M-4: events는 부모(PipelineTabPanel)가 단일 폴링으로 가져온 것을 주입받는다.
  // selected 파이프라인에 한해 값이 전달되며, 그 외에는 null이다.
  events?: PipelineEvent[] | null
}

export function PipelineAccordion({ pipeline, wuSlug, selected, onSelect, events }: PipelineAccordionProps) {
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const totalSteps = pipeline.totalSteps || 0
  const completedSteps = pipeline.completedSteps || 0
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  async function handleStatusChange(status: 'completed' | 'failed' | 'paused') {
    try {
      await bamsApi.patchWorkUnitPipeline(wuSlug, pipeline.slug, { status })
    } catch (err) {
      console.error('Failed to update pipeline status:', err)
    }
    setMenuOpen(false)
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: selected ? '0 0 0 1px var(--accent)' : undefined,
    }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => {
          setOpen(prev => !prev)
          onSelect?.(pipeline.slug)
        }}
      >
        {/* Chevron */}
        <span style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          width: '14px',
          textAlign: 'center',
          flexShrink: 0,
          transition: 'transform 0.15s',
          transform: open ? 'rotate(90deg)' : 'none',
        }}>
          &#9654;
        </span>

        {/* Slug */}
        <span style={{
          fontWeight: 600,
          fontSize: '12px',
          color: selected ? 'var(--accent)' : 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {pipeline.slug}
        </span>

        {/* Type badge */}
        <span style={{
          fontSize: '10px',
          padding: '1px 6px',
          borderRadius: '4px',
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          fontWeight: 500,
          flexShrink: 0,
        }}>
          {pipeline.type}
        </span>

        {/* Status */}
        <StatusBadge status={pipeline.status ?? 'unknown'} size="sm" />

        {/* Progress bar (inline) */}
        {totalSteps > 0 && (
          <div style={{
            width: '60px',
            height: '4px',
            borderRadius: '2px',
            background: 'var(--bg-secondary)',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <div style={{
              height: '100%',
              width: `${progressPct}%`,
              background: pipeline.failedSteps > 0 ? 'var(--status-fail)' : 'var(--accent)',
              borderRadius: '2px',
              transition: 'width 0.3s',
            }} />
          </div>
        )}

        {/* Duration */}
        {pipeline.durationMs != null && (
          <span style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}>
            {formatDuration(pipeline.durationMs)}
          </span>
        )}

        {/* Actions menu */}
        <div
          ref={menuRef}
          style={{ position: 'relative', flexShrink: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setMenuOpen(prev => !prev)}
            aria-label="Pipeline actions"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              color: 'var(--text-muted)',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ...
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '4px 0',
              minWidth: '120px',
              zIndex: 100,
              boxShadow: '0 4px 12px var(--shadow)',
            }}>
              <PipelineMenuBtn label="Complete" onClick={() => handleStatusChange('completed')} />
              <PipelineMenuBtn label="Failed" onClick={() => handleStatusChange('failed')} />
              <PipelineMenuBtn label="Pause" onClick={() => handleStatusChange('paused')} />
            </div>
          )}
        </div>
      </div>

      {/* Expanded: Task table + Agent summary */}
      {open && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '0',
        }}>
          {/* M-4: 자체 폴링 제거. selected 파이프라인에 한해 부모가 주입한 events로 요약 렌더.
              non-selected 파이프라인이 open된 경우 summary는 생략 (클릭 시 자동 selected되므로 실무상 거의 발생 안 함). */}
          {selected && <AgentSummarySection events={events ?? null} />}
          <TaskTable pipelineSlug={pipeline.slug} />
        </div>
      )}
    </div>
  )
}

function AgentSummarySection({ events }: { events: PipelineEvent[] | null }) {
  const summary = useMemo(() => {
    if (!events || !Array.isArray(events)) return null
    let agentStarts = 0
    let agentEnds = 0
    let agentErrors = 0
    const agentTypes = new Set<string>()

    for (const ev of events) {
      if (ev.type === 'agent_start') {
        agentStarts++
        const at = (ev as Record<string, unknown>).agent_type
        if (typeof at === 'string') agentTypes.add(at)
      } else if (ev.type === 'agent_end') {
        agentEnds++
        if ((ev as Record<string, unknown>).is_error) agentErrors++
      }
    }
    return { agentStarts, agentEnds, agentErrors, uniqueAgents: agentTypes.size }
  }, [events])

  if (!summary || summary.agentStarts === 0) return null

  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      padding: '8px 14px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
      fontSize: '11px',
      color: 'var(--text-secondary)',
    }}>
      <span>Agents: <strong style={{ color: 'var(--text-primary)' }}>{summary.uniqueAgents}</strong></span>
      <span>Calls: <strong style={{ color: 'var(--text-primary)' }}>{summary.agentStarts}</strong></span>
      <span>Completed: <strong style={{ color: 'var(--text-primary)' }}>{summary.agentEnds}</strong></span>
      {summary.agentErrors > 0 && (
        <span>Errors: <strong style={{ color: 'var(--status-fail)' }}>{summary.agentErrors}</strong></span>
      )}
    </div>
  )
}

function PipelineMenuBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '6px 14px',
        background: 'none',
        border: 'none',
        textAlign: 'left',
        fontSize: '12px',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover, var(--bg-secondary))'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'none'
      }}
    >
      {label}
    </button>
  )
}
