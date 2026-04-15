'use client'

import { useMemo, useState } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { gradeColor } from './helpers'
import type { RetroJournalEntry } from '@/lib/types'

/* ------------------------------------------------------------------ */
/*  RetroJournalCard                                                   */
/* ------------------------------------------------------------------ */

function RetroJournalCard({ entry, isExpanded, onToggle }: {
  entry: RetroJournalEntry
  isExpanded: boolean
  onToggle: () => void
}) {
  const meta = entry.retro_metadata ?? {
    analyzed_pipelines: 0,
    retro_date: entry.report_date ?? '',
    action_items: [],
    keep_count: 0,
    problem_count: 0,
    try_count: 0,
  }

  // Compute grade distribution from agents array if not in meta
  const gradeDist: Record<string, number> = { ...(meta.grade_distribution ?? {}) }
  const entryAgents = entry.agents ?? []
  if (Object.keys(gradeDist).length === 0 && entryAgents.length > 0) {
    for (const agent of entryAgents) {
      const g = (agent.grade ?? 'Unknown').toUpperCase()
      gradeDist[g] = (gradeDist[g] ?? 0) + 1
    }
  }
  const gradeEntries = Object.entries(gradeDist).sort(([a], [b]) => a.localeCompare(b))

  const displayActions = meta.action_items ?? []

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '10px',
      borderLeft: '3px solid #6366f1',
    }}>
      {/* Header -- always visible, clickable */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          cursor: 'pointer',
          background: isExpanded ? 'var(--bg-secondary)' : 'transparent',
          borderBottom: isExpanded ? '1px solid var(--border-light)' : 'none',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', minWidth: '90px' }}>
          {meta.retro_date}
        </span>
        <span style={{
          fontSize: '11px',
          color: '#6366f1',
          fontWeight: 600,
          background: 'rgba(99,102,241,0.08)',
          padding: '2px 7px',
          borderRadius: '4px',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {entry.retro_slug}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          파이프라인 {meta.analyzed_pipelines}개 분석
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          ▼
        </span>
      </div>

      {/* Body -- expanded only */}
      {isExpanded && (
        <div style={{ padding: '12px 16px' }}>
          {/* Grade distribution mini badges */}
          {gradeEntries.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '2px' }}>에이전트 등급:</span>
              {gradeEntries.map(([grade, count]) => (
                <span
                  key={grade}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#fff',
                    background: gradeColor(grade),
                  }}
                >
                  {grade}
                  <span style={{ fontWeight: 400, opacity: 0.85 }}>{count}</span>
                </span>
              ))}
            </div>
          )}

          {/* Action items summary */}
          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              개선 사항 {meta.action_items?.length ?? 0}건
            </span>
            {displayActions.length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                {displayActions.map((item, i) => (
                  <li key={i} style={{ marginBottom: '2px' }}>{item}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Agent improvements */}
          {(() => {
            const improvements = meta.improvements
            if (!improvements || improvements.length === 0) return null
            return (
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>에이전트 개선 이력</span>
              {improvements.map((imp) => (
                <div key={imp.agent_id} style={{
                  marginTop: '6px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'rgba(99,102,241,0.06)',
                  border: '1px solid rgba(99,102,241,0.15)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{imp.agent_id}</span>
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      padding: '1px 6px', borderRadius: '3px',
                      background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                    }}>{imp.grade_before}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>→</span>
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      padding: '1px 6px', borderRadius: '3px',
                      background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                    }}>{imp.grade_target}</span>
                  </div>
                  <ul style={{ margin: '0', paddingLeft: '16px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    {(imp.changes ?? []).map((c: string, i: number) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            )
          })()}

          {/* KPT summary */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              padding: '3px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
              background: 'rgba(34,197,94,0.12)', color: '#22c55e',
            }}>
              Keep {meta.keep_count}
            </span>
            <span style={{
              padding: '3px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
              background: 'rgba(239,68,68,0.12)', color: '#ef4444',
            }}>
              Problem {meta.problem_count}
            </span>
            <span style={{
              padding: '3px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
              background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
            }}>
              Try {meta.try_count}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  RetroJournalSection                                                */
/* ------------------------------------------------------------------ */

export function RetroJournalSection({ selectedRetroSlug }: { selectedRetroSlug?: string | null }) {
  const url = selectedRetroSlug
    ? `/api/hr/retro-journal?slug=${encodeURIComponent(selectedRetroSlug)}`
    : '/api/hr/retro-journal'
  const { data: entries, isLoading } = usePolling<RetroJournalEntry[]>(url, 10000)
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)

  const toggle = (slug: string) => {
    setExpandedSlug(prev => (prev === slug ? null : slug))
  }

  // Sort by report_date descending (already sorted by API, but ensure it)
  const sorted = useMemo(() => {
    if (!entries || !Array.isArray(entries)) return []
    return [...entries].sort((a, b) => (b.report_date ?? '').localeCompare(a.report_date ?? ''))
  }, [entries])

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Section header */}
      <div style={{
        padding: '12px 16px',
        fontSize: '13px',
        fontWeight: 600,
        borderBottom: '1px solid var(--border-light)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{ width: '3px', height: '14px', background: '#6366f1', borderRadius: '2px', display: 'inline-block' }} />
        회고 일지
        {sorted.length > 0 && (
          <span style={{
            fontSize: '11px',
            fontWeight: 400,
            color: 'var(--text-muted)',
            background: 'var(--border-light)',
            padding: '1px 6px',
            borderRadius: '10px',
          }}>
            {sorted.length}건
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px' }}>
        {isLoading ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
            로딩 중...
          </div>
        ) : sorted.length === 0 ? (
          <div style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '24px 0',
          }}>
            회고 이력이 없습니다
          </div>
        ) : (
          sorted.map(entry => (
            <RetroJournalCard
              key={entry.retro_slug}
              entry={entry}
              isExpanded={expandedSlug === entry.retro_slug}
              onToggle={() => toggle(entry.retro_slug)}
            />
          ))
        )}
      </div>
    </div>
  )
}
