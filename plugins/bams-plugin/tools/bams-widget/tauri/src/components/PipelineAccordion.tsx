/**
 * PipelineAccordion.tsx — bams-viz에서 이식 (compact 변형)
 * - 'use client' 제거
 * - bamsApi.patchWorkUnitPipeline 의존성 제거 (위젯은 read-only)
 * - next/* 의존성 없음
 * - CSS custom properties: --color-* (위젯 globals.css 기준)
 *
 * [이슈 2 수정] 아코디언 open 시 /api/pipelines/{slug}/tasks SWR lazy-load
 */

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, SWR_KEYS } from '../lib/api'
import { StatusBadge } from './StatusBadge'
import { formatDuration } from '../lib/utils'
import type { Pipeline, Task, PipelineTasksResponse } from '../lib/types'

interface PipelineAccordionProps {
  pipeline: Pipeline
  selected?: boolean
  onSelect?: (slug: string) => void
  compact?: boolean
}

export function PipelineAccordion({
  pipeline,
  selected,
  onSelect,
  compact = true,
}: PipelineAccordionProps) {
  const [open, setOpen] = useState(false)

  const rowPad = compact ? '8px 10px' : '10px 14px'
  const nameFontSize = compact ? '11px' : '12px'

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: '6px',
      overflow: 'hidden',
      boxShadow: selected ? '0 0 0 1px var(--color-accent)' : undefined,
    }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: rowPad,
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
          fontSize: '9px',
          color: 'var(--color-text-muted)',
          width: '12px',
          textAlign: 'center',
          flexShrink: 0,
          transition: 'transform 0.15s',
          transform: open ? 'rotate(90deg)' : 'none',
          display: 'inline-block',
        }}>
          &#9654;
        </span>

        {/* Slug */}
        <span style={{
          fontWeight: 600,
          fontSize: nameFontSize,
          color: selected ? 'var(--color-accent)' : 'var(--color-text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {pipeline.slug}
        </span>

        {/* Type badge */}
        <span style={{
          fontSize: '9px',
          padding: '1px 5px',
          borderRadius: '4px',
          background: 'var(--color-surface-3)',
          color: 'var(--color-text-muted)',
          fontWeight: 500,
          flexShrink: 0,
        }}>
          {pipeline.type}
        </span>

        {/* Status */}
        <StatusBadge status={pipeline.status ?? 'unknown'} size="xs" />

        {/* Duration */}
        {pipeline.durationMs != null && (
          <span style={{
            fontSize: '9px',
            color: 'var(--color-text-muted)',
            flexShrink: 0,
          }}>
            {formatDuration(pipeline.durationMs)}
          </span>
        )}
      </div>

      {/* Expanded: Tasks list (lazy-load) */}
      {open && (
        <TasksPanel slug={pipeline.slug} compact={compact} />
      )}
    </div>
  )
}

// ── TasksPanel — 아코디언 열릴 때만 mount되어 SWR fetch 실행 ──────

interface TasksPanelProps {
  slug: string
  compact?: boolean
}

function TasksPanel({ slug, compact }: TasksPanelProps) {
  const { data, isLoading, error } = useSWR<PipelineTasksResponse>(
    SWR_KEYS.pipelineTasks(slug),
    fetcher,
    { revalidateOnFocus: false }
  )

  if (isLoading) {
    return (
      <div style={{
        borderTop: '1px solid var(--color-border)',
        padding: '8px 10px',
        fontSize: '10px',
        color: 'var(--color-text-muted)',
        textAlign: 'center',
      }}>
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        borderTop: '1px solid var(--color-border)',
        padding: '8px 10px',
        fontSize: '10px',
        color: 'var(--color-text-muted)',
        textAlign: 'center',
      }}>
        Failed to load tasks
      </div>
    )
  }

  const tasks = data?.tasks ?? []

  if (tasks.length === 0) {
    return (
      <div style={{
        borderTop: '1px solid var(--color-border)',
        padding: '8px 10px',
        fontSize: '10px',
        color: 'var(--color-text-muted)',
        textAlign: 'center',
      }}>
        No tasks
      </div>
    )
  }

  return (
    <div style={{
      borderTop: '1px solid var(--color-border)',
      padding: '4px 0',
    }}>
      {tasks.map(task => (
        <TaskRow key={task.id} task={task} compact={compact} />
      ))}
    </div>
  )
}

// ── TaskRow ─────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task
  compact?: boolean
}

function TaskRow({ task, compact }: TaskRowProps) {
  const statusColor: Record<string, string> = {
    done: '#22c55e',
    in_progress: '#3b82f6',
    failed: '#ef4444',
    skipped: '#8e8ea0',
    pending: '#585870',
  }
  const color = statusColor[task.status] ?? '#585870'

  // "TASK-001: 제목" 형식에서 제목만 표시 (콜론 이후)
  const displayTitle = task.title.includes(': ')
    ? task.title.split(': ').slice(1).join(': ')
    : task.title

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: compact ? '3px 10px 3px 28px' : '4px 14px 4px 32px',
      fontSize: '10px',
    }}>
      {/* Status dot */}
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }} />

      {/* Title */}
      <span style={{
        flex: 1,
        color: 'var(--color-text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {displayTitle}
      </span>

      {/* Agent */}
      {task.assignee_agent && (
        <span style={{
          fontSize: '9px',
          color: 'var(--color-text-muted)',
          flexShrink: 0,
          fontFamily: 'var(--font-mono)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: compact ? '60px' : '80px',
        }}>
          {task.assignee_agent}
        </span>
      )}

      {/* Duration */}
      {task.duration_ms != null && (
        <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
          {formatDuration(task.duration_ms)}
        </span>
      )}
    </div>
  )
}
