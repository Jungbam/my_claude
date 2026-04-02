'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { EmptyState } from '@/components/ui/EmptyState'
import { DEPT_INFO } from '@/lib/agents-config'
import type { PipelineEvent } from '@/lib/types'

interface LogsTabProps {
  pipelineSlug: string | null
  highlightTimestamp?: string | null
}

function JsonTreeNode({ label, value, depth = 0 }: { label: string; value: unknown; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1)
  const isObject = value !== null && typeof value === 'object'

  if (!isObject) {
    const color = typeof value === 'string' ? '#22c55e'
      : typeof value === 'number' ? '#3b82f6'
      : typeof value === 'boolean' ? '#f97316'
      : 'var(--text-muted)'
    return (
      <div style={{ paddingLeft: `${depth * 16}px`, fontSize: '12px', fontFamily: 'monospace', lineHeight: '20px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}: </span>
        <span style={{ color }}>{JSON.stringify(value)}</span>
      </div>
    )
  }

  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as object)

  return (
    <div style={{ paddingLeft: `${depth * 16}px` }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '12px',
          fontFamily: 'monospace',
          color: 'var(--text-primary)',
          padding: 0,
          lineHeight: '20px',
        }}
      >
        <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{expanded ? '▼' : '▶'}</span>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {!expanded && (
          <span style={{ color: 'var(--text-muted)' }}>
            {' '}{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
          </span>
        )}
      </button>
      {expanded && entries.map(([k, v]) => (
        <JsonTreeNode key={k} label={k} value={v} depth={depth + 1} />
      ))}
    </div>
  )
}

const EVENT_TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pipeline_start: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', label: 'PIPELINE START' },
  pipeline_end: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: 'PIPELINE END' },
  step_start: { bg: 'rgba(249,115,22,0.12)', color: '#f97316', label: 'STEP START' },
  step_end: { bg: 'rgba(249,115,22,0.12)', color: '#f97316', label: 'STEP END' },
  agent_start: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7', label: 'AGENT START' },
  agent_end: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7', label: 'AGENT END' },
  error: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'ERROR' },
}

function LogRow({
  event,
  index,
  searchTerm,
  isHighlighted,
}: {
  event: PipelineEvent
  index: number
  searchTerm: string
  isHighlighted: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const ev = event as Record<string, unknown>
  const typeStyle = EVENT_TYPE_STYLES[event.type] || { bg: 'transparent', color: 'var(--text-muted)', label: event.type }

  // Agent info
  const agentType = ev.agent_type as string | undefined
  const department = ev.department as string | undefined
  const deptInfo = department ? DEPT_INFO[department] : null
  const model = ev.model as string | undefined
  const callId = ev.call_id as string | undefined
  const description = ev.description as string | undefined
  const promptSummary = ev.prompt_summary as string | undefined
  const input = ev.input as string | undefined
  const output = ev.output as string | undefined
  const resultSummary = ev.result_summary as string | undefined
  const parentSpanId = ev.parent_span_id as string | undefined
  const isError = ev.is_error as boolean | undefined
  const errorMessage = ev.error_message as string | undefined
  const durationMs = ev.duration_ms as number | undefined
  const stepName = ev.step_name as string | undefined
  const stepNumber = ev.step_number as number | undefined
  const phase = ev.phase as string | undefined
  const status = ev.status as string | undefined

  // Build summary line
  let summaryLine = ''
  if (event.type === 'agent_start') {
    summaryLine = description || promptSummary || ''
  } else if (event.type === 'agent_end') {
    summaryLine = resultSummary || (isError ? (errorMessage || 'Error') : 'Completed')
  } else if (event.type === 'step_start' || event.type === 'step_end') {
    summaryLine = stepName || ''
  } else if (event.type === 'pipeline_start') {
    summaryLine = (ev.pipeline_type as string) || ''
  } else if (event.type === 'error') {
    summaryLine = ev.message as string || ''
  }

  const raw = JSON.stringify(event)
  const hasMatch = searchTerm && raw.toLowerCase().includes(searchTerm.toLowerCase())

  const ts = event.ts ? new Date(event.ts).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border-light)',
        background: isHighlighted ? 'rgba(59,130,246,0.08)' : hasMatch ? 'rgba(245,158,11,0.06)' : 'transparent',
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          gap: '8px',
          padding: '8px 16px',
          cursor: 'pointer',
          fontSize: '12px',
          lineHeight: '18px',
          alignItems: 'center',
        }}
      >
        <span style={{ color: 'var(--text-muted)', minWidth: '28px', textAlign: 'right', flexShrink: 0, userSelect: 'none', fontSize: '10px' }}>
          {index + 1}
        </span>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '11px', fontFamily: 'monospace', minWidth: '60px' }}>
          {ts}
        </span>
        {/* Event type badge */}
        <span style={{
          fontSize: '9px',
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: '3px',
          background: typeStyle.bg,
          color: typeStyle.color,
          minWidth: '90px',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          {typeStyle.label}
        </span>
        {/* Agent type with department color */}
        {agentType && (
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            color: deptInfo?.color || 'var(--text-secondary)',
            flexShrink: 0,
            minWidth: '140px',
          }}>
            {agentType}
          </span>
        )}
        {/* Model badge */}
        {model && (
          <span style={{
            fontSize: '9px',
            color: 'var(--text-muted)',
            background: 'var(--bg-tertiary)',
            padding: '1px 5px',
            borderRadius: '3px',
            flexShrink: 0,
          }}>
            {model}
          </span>
        )}
        {/* Collaboration indicator */}
        {parentSpanId && (
          <span style={{
            fontSize: '9px',
            color: '#3b82f6',
            background: 'rgba(59,130,246,0.1)',
            padding: '1px 5px',
            borderRadius: '3px',
            flexShrink: 0,
          }}>
            delegated
          </span>
        )}
        {/* Summary */}
        <span style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: isError ? 'var(--status-fail)' : 'var(--text-secondary)',
        }}>
          {summaryLine}
        </span>
        {/* Duration */}
        {durationMs != null && (
          <span style={{ color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0 }}>
            {durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`}
          </span>
        )}
        {/* Status */}
        {status && (
          <span style={{
            fontSize: '9px',
            fontWeight: 600,
            color: status === 'done' || status === 'completed' || status === 'success' ? 'var(--status-done)'
              : status === 'fail' || status === 'failed' || status === 'error' ? 'var(--status-fail)'
              : 'var(--text-muted)',
          }}>
            {status}
          </span>
        )}
        <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '10px' }}>{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div style={{
          padding: '10px 16px 12px 110px',
          background: 'var(--code-bg)',
          borderTop: '1px solid var(--border-light)',
          fontSize: '12px',
        }}>
          {/* Structured view for agent events */}
          {(event.type === 'agent_start' || event.type === 'agent_end') && (
            <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {callId && (
                <div><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Call ID: </span><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{callId}</span></div>
              )}
              {parentSpanId && (
                <div style={{ color: '#3b82f6' }}>
                  <span style={{ fontWeight: 600 }}>Delegated from: </span>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{parentSpanId}</span>
                </div>
              )}
              {(stepName || stepNumber != null) && (
                <div><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Step: </span>{stepName || `#${stepNumber}`}{phase ? ` (${phase})` : ''}</div>
              )}
              {input && (
                <div style={{ marginTop: '4px' }}>
                  <div style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>Input:</div>
                  <div style={{
                    background: 'var(--bg-secondary)',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.5',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    color: 'var(--text-primary)',
                  }}>
                    {input}
                  </div>
                </div>
              )}
              {output && (
                <div style={{ marginTop: '4px' }}>
                  <div style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>Output:</div>
                  <div style={{
                    background: 'var(--bg-secondary)',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.5',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    color: 'var(--text-primary)',
                  }}>
                    {output}
                  </div>
                </div>
              )}
              {errorMessage && (
                <div style={{ marginTop: '4px', color: 'var(--status-fail)' }}>
                  <span style={{ fontWeight: 600 }}>Error: </span>{errorMessage}
                </div>
              )}
            </div>
          )}
          {/* Raw JSON tree */}
          <details style={{ marginTop: '4px' }}>
            <summary style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}>Raw JSON</summary>
            <div style={{ marginTop: '6px' }}>
              <JsonTreeNode label="root" value={event} />
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

export function LogsTab({ pipelineSlug, highlightTimestamp }: LogsTabProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevLengthRef = useRef(0)

  const apiUrl = pipelineSlug ? `/api/events/raw/${pipelineSlug}` : '/api/events/raw/all'
  const { data, error, isLoading } = usePolling<PipelineEvent[]>(apiUrl, 1000)

  const PAGE_SIZE = 500
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    if (!data || !Array.isArray(data)) return []
    if (!searchTerm) return data
    const term = searchTerm.toLowerCase()
    // Search key fields first, then fallback to stringify only if needed
    return data.filter(e => {
      const ev = e as Record<string, unknown>
      const quickFields = [ev.type, ev.agent_type, ev.status, ev.step_name, ev.pipeline_slug, ev.call_id, ev.message]
        .filter(Boolean).join(' ').toLowerCase()
      if (quickFields.includes(term)) return true
      return JSON.stringify(e).toLowerCase().includes(term)
    })
  }, [data, searchTerm])

  // Reset display limit when search changes
  useEffect(() => { setDisplayLimit(PAGE_SIZE) }, [searchTerm])

  const displayedEvents = useMemo(() => filtered.slice(0, displayLimit), [filtered, displayLimit])

  // Auto scroll on new data
  useEffect(() => {
    if (autoScroll && scrollRef.current && filtered.length > prevLengthRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    prevLengthRef.current = filtered.length
  }, [filtered.length, autoScroll])

  // Scroll to highlighted timestamp
  const highlightIndex = useMemo(() => {
    if (!highlightTimestamp || !filtered) return -1
    return filtered.findIndex(e => e.ts === highlightTimestamp)
  }, [filtered, highlightTimestamp])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }, [])

  if (isLoading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading logs...</div>
  }
  if (error) {
    return <div style={{ padding: '20px', color: 'var(--status-fail)' }}>Error: {error.message}</div>
  }
  if (!data || data.length === 0) {
    return <EmptyState icon="📋" title="No logs" description="No event logs for this pipeline" />
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        gap: '10px',
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {filtered.length}/{data.length} events
        </span>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid',
            borderColor: autoScroll ? 'var(--accent)' : 'var(--border)',
            background: autoScroll ? 'rgba(59,130,246,0.1)' : 'transparent',
            color: autoScroll ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          Auto-scroll {autoScroll ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Log list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto' }}
      >
        {displayedEvents.map((event, i) => (
          <LogRow
            key={`${event.ts}-${i}`}
            event={event}
            index={i}
            searchTerm={searchTerm}
            isHighlighted={i === highlightIndex}
          />
        ))}
        {displayLimit < filtered.length && (
          <button
            onClick={() => setDisplayLimit(prev => prev + PAGE_SIZE)}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: '12px',
              margin: '8px 0',
            }}
          >
            Load more ({filtered.length - displayLimit} remaining)
          </button>
        )}
      </div>
    </div>
  )
}
