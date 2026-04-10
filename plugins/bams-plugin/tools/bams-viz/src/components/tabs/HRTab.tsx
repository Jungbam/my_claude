'use client'

import { useMemo, useState } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { SummaryCards } from '@/components/hr/SummaryCards'
import { DeptTable } from '@/components/hr/DeptTable'
import { AgentTable } from '@/components/hr/AgentTable'
import { AlertSection } from '@/components/hr/AlertSection'
import { RetroJournalSection } from '@/components/hr/RetroJournalSection'
import { SourceBadge } from '@/components/hr/SourceBadge'
import type { HRReport, HRReportListItem } from '@/components/hr/types'

/* ------------------------------------------------------------------ */
/*  Main HRTab component                                               */
/* ------------------------------------------------------------------ */

export function HRTab() {
  // API Contract: /api/hr/reports returns { reports: HRReportListItem[] }
  const { data: reportListData, isLoading: isListLoading } = usePolling<{ reports: HRReportListItem[] }>('/api/hr/reports', 10000)
  const reportList = reportListData?.reports ?? []
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)

  // Determine which report URL to poll
  const reportUrl = selectedFilename
    ? `/api/hr/reports/latest?filename=${encodeURIComponent(selectedFilename)}`
    : '/api/hr/reports/latest'

  const { data: report, error, isLoading: isReportLoading } = usePolling<HRReport>(reportUrl, 10000)

  const isLoading = isListLoading || isReportLoading

  // Sort agents: D/F first, then by invocation count descending
  const sortedAgents = useMemo(() => {
    if (!report?.agents) return []
    return [...report.agents].sort((a, b) => {
      const gradeOrder: Record<string, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 }
      const ga = gradeOrder[a.grade] ?? 5
      const gb = gradeOrder[b.grade] ?? 5
      if (ga !== gb) return ga - gb
      return b.invocation_count - a.invocation_count
    })
  }, [report])

  if (isLoading && !report) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading HR reports...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'var(--status-fail)' }}>
        Error loading HR data: {error.message}
      </div>
    )
  }

  const hasData = report && report.report_date !== null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        fontSize: '13px',
        color: 'var(--text-secondary)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600 }}>HR Performance Report</span>
        {report?.period?.start && report?.period?.end && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {report.period.start} ~ {report.period.end}
          </span>
        )}
        {/* Source badge for current report */}
        {report?.report_date && (
          <SourceBadge source={report.source} />
        )}
        <div style={{ flex: 1 }} />
        {/* Report date selector */}
        {reportList && reportList.length > 0 && (
          <select
            value={selectedFilename ?? ''}
            onChange={e => setSelectedFilename(e.target.value || null)}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">Latest Report</option>
            {reportList.map(r => (
              <option key={r.filename} value={r.filename}>
                {r.report_date} ({r.agent_count} agents){r.source === 'retro' && r.retro_slug ? ` — ${r.retro_slug}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {!hasData ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
            color: 'var(--text-muted)',
            gap: '12px',
          }}>
            <div style={{ fontSize: '32px' }}>&#128203;</div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>No HR Reports Available</div>
            <div style={{ fontSize: '12px', textAlign: 'center', maxWidth: '400px', lineHeight: '1.5' }}>
              HR Agent has not generated any weekly performance reports yet.
              Reports appear here after the hr-agent runs its weekly performance check pipeline.
            </div>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ marginBottom: '20px' }}>
              <SummaryCards report={report} />
            </div>

            {/* Department summary */}
            <DeptTable departments={report.departments} />

            {/* Agent performance table */}
            <AgentTable agents={sortedAgents} />

            {/* Attention needed section */}
            <AlertSection agents={report.agents} />

          </>
        )}

        {/* Retro Journal -- always visible regardless of hasData */}
        <div style={{ marginTop: '20px' }}>
          <RetroJournalSection selectedRetroSlug={report?.retro_slug ?? null} />
        </div>
      </div>
    </div>
  )
}
