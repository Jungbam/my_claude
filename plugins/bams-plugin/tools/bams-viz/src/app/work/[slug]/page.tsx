'use client'

import { useState, useCallback, useEffect } from 'react'
import { mutate as globalMutate } from 'swr'
import { useParams, useRouter } from 'next/navigation'
import { usePolling } from '@/hooks/usePolling'
import { AppHeader } from '@/components/shared/AppHeader'
import { WorkDetailHeader } from '@/components/work-detail/WorkDetailHeader'
import { WorkDetailTabs } from '@/components/work-detail/WorkDetailTabs'
import { PipelineTabPanel } from '@/components/work-detail/PipelineTabPanel'
import { OverviewPanel } from '@/components/work-detail/OverviewPanel'
import { bamsApi } from '@/lib/bams-api'
import { formatDuration } from '@/lib/utils'
import type { DetailTab, PipelineSubTab, WorkUnitDetailResponse } from '@/lib/types'

export default function WorkDetailPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [selectedPipelineSlug, setSelectedPipelineSlug] = useState<string | null>(null)
  const [activePipelineSubTab, setActivePipelineSubTab] = useState<PipelineSubTab>('agent')

  const { data, error, isLoading, mutate } = usePolling<WorkUnitDetailResponse>(
    slug ? `/api/workunits/${encodeURIComponent(slug)}` : null,
    3000
  )

  const workunit = data?.workunit
  // pipelines는 응답 root에 위치 (WorkUnitDetailResponse contract).
  // workunit.pipelines는 목록 API(getWorkUnits)에서만 채워지므로 여기서는 사용하지 않는다.
  const pipelines = data?.pipelines ?? []

  // M-2: WU 전환(slug 변경) 시 이전 WU의 pipeline 선택 상태를 초기화
  useEffect(() => {
    setSelectedPipelineSlug(null)
  }, [slug])

  // 파이프라인 목록이 로드되면 첫 번째를 자동 선택
  useEffect(() => {
    if (pipelines.length > 0 && selectedPipelineSlug === null) {
      setSelectedPipelineSlug(pipelines[0].slug ?? null)
    }
  }, [pipelines, selectedPipelineSlug])

  const handleBack = useCallback(() => {
    router.push('/')
  }, [router])

  const handleAction = useCallback(async (action: 'complete' | 'abandon' | 'delete') => {
    if (!slug) return
    try {
      if (action === 'delete') {
        if (!confirm('Are you sure you want to delete this work unit?')) return
        await bamsApi.deleteWorkUnit(slug)
        await globalMutate('/api/workunits')  // 홈 목록 즉시 갱신
        router.push('/')
        return
      }
      const status = action === 'complete' ? 'completed' : 'abandoned'
      await bamsApi.patchWorkUnit(slug, { status })
      mutate()  // 현재 페이지 즉시 갱신
      await globalMutate('/api/workunits')  // 홈 목록도 즉시 갱신
    } catch (err) {
      console.error('Action failed:', err)
    }
  }, [slug, router, mutate])

  if (isLoading && !data) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: 'var(--bg-secondary)',
      }}>
        <AppHeader />
        <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading...
          </div>
        </main>
      </div>
    )
  }

  if (error || !workunit) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: 'var(--bg-secondary)',
      }}>
        <AppHeader />
        <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ color: 'var(--status-fail)', marginBottom: '12px' }}>
              {error ? `Error: ${error.message}` : 'Work unit not found'}
            </div>
            <button
              onClick={handleBack}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Back to list
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: 'var(--bg-secondary)',
    }}>
      <AppHeader />
      <main style={{
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
        flex: 1,
      }}>
        <WorkDetailHeader
          workunit={workunit}
          pipelines={pipelines}
          onBack={handleBack}
          onAction={handleAction}
        />
        <WorkDetailTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {activeTab === 'overview' && (
          <OverviewPanel workunit={workunit} pipelines={pipelines} />
        )}
        {activeTab === 'pipelines' && (
          <PipelineTabPanel
            pipelines={pipelines}
            wuSlug={slug}
            selectedPipelineSlug={selectedPipelineSlug}
            onSelectPipeline={setSelectedPipelineSlug}
            activePipelineSubTab={activePipelineSubTab}
            onSubTabChange={setActivePipelineSubTab}
          />
        )}
        {activeTab === 'retro' && (
          <RetroPanel wuSlug={slug} />
        )}
      </main>
    </div>
  )
}

// ── Retro Panel ───────────────────────────────────────────────────────────────
function RetroPanel({ wuSlug }: { wuSlug: string }) {
  const { data, isLoading, error } = usePolling<{
    work_unit_slug: string
    auto_summary: {
      total_pipelines: number
      completed_pipelines: number
      failed_pipelines: number
      active_pipelines: number
      total_agents: number
      total_agent_calls: number
      agent_errors: number
      total_duration_ms: number
      pipelines: Array<{
        slug: string
        type: string
        status: string
        duration_ms: number | null
        agent_calls: number
        agent_errors: number
      }>
      top_agents: Array<{
        agent_type: string
        call_count: number
        error_count: number
      }>
    } | null
  }>(
    `/api/workunits/${encodeURIComponent(wuSlug)}/retro`,
    5000
  )

  if (isLoading && !data) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading timeline...</div>
  }
  if (error) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--status-fail)', fontSize: '12px' }}>Failed to load timeline</div>
  }

  const summary = data?.auto_summary
  if (!summary) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No summary data available</div>
  }

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '12px',
        marginBottom: '20px',
      }}>
        <SummaryCard label="Pipelines" value={summary.total_pipelines.toString()} />
        <SummaryCard label="Completed" value={summary.completed_pipelines.toString()} color="var(--status-done)" />
        <SummaryCard label="Failed" value={summary.failed_pipelines.toString()} color={summary.failed_pipelines > 0 ? 'var(--status-fail)' : undefined} />
        <SummaryCard label="Agent Calls" value={summary.total_agent_calls.toString()} />
        <SummaryCard label="Errors" value={summary.agent_errors.toString()} color={summary.agent_errors > 0 ? 'var(--status-fail)' : undefined} />
        <SummaryCard label="Total Time" value={formatDuration(summary.total_duration_ms)} />
      </div>

      {summary.pipelines.length > 0 && (
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Pipeline Breakdown</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '6px 12px', fontWeight: 500 }}>Pipeline</th>
                <th style={{ padding: '6px 12px', fontWeight: 500 }}>Type</th>
                <th style={{ padding: '6px 12px', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '6px 12px', fontWeight: 500 }}>Duration</th>
                <th style={{ padding: '6px 12px', fontWeight: 500 }}>Agents</th>
              </tr>
            </thead>
            <tbody>
              {summary.pipelines.map(p => (
                <tr key={p.slug} style={{ borderTop: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '6px 12px', fontWeight: 500, color: 'var(--text-primary)' }}>{p.slug}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--text-secondary)' }}>{p.type}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--text-secondary)' }}>{p.status}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--text-muted)' }}>{p.duration_ms != null ? formatDuration(p.duration_ms) : '-'}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--text-muted)' }}>{p.agent_calls}{p.agent_errors > 0 ? ` (${p.agent_errors} err)` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '12px',
    }}>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
