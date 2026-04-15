'use client'

import { useMemo } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { PipelinesPanel } from './PipelinesPanel'
import { PipelineSubTabs } from './PipelineSubTabs'
import { AgentsTab } from '@/components/tabs/AgentsTab'
import { TimelineTab } from '@/components/tabs/TimelineTab'
import type { WorkUnitPipeline, PipelineSubTab, PipelineEvent } from '@/lib/types'

// M-5: 클라이언트 측 limit — bams-server가 limit 쿼리를 무시하더라도
// 메모리/렌더 부하를 최근 N개로 제한한다. proxy에도 ?limit=N을 전달하여
// 향후 서버가 지원할 경우 네트워크 payload도 함께 줄인다.
const EVENT_LIMIT = 200

// ── Props ─────────────────────────────────────────────────────────────────────
interface PipelineTabPanelProps {
  pipelines: WorkUnitPipeline[]
  wuSlug: string
  selectedPipelineSlug: string | null
  onSelectPipeline: (slug: string) => void
  activePipelineSubTab: PipelineSubTab
  onSubTabChange: (tab: PipelineSubTab) => void
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
  // M-4: Single polling point for raw events — PipelineAccordion의 AgentSummarySection도 이 events를 재사용한다.
  // M-5: limit=200으로 최근 이벤트만 사용 (서버가 쿼리를 지원하지 않으면 클라이언트에서 slice).
  const { data: rawEventsFull, isLoading: eventsLoading, error: eventsError } = usePolling<PipelineEvent[]>(
    selectedPipelineSlug
      ? `/api/events/raw/${encodeURIComponent(selectedPipelineSlug)}?limit=${EVENT_LIMIT}`
      : null,
    3000
  )

  // M-5 (fallback): 서버가 limit을 무시할 경우에도 최근 EVENT_LIMIT개만 사용.
  const rawEvents = useMemo<PipelineEvent[] | null>(() => {
    if (!Array.isArray(rawEventsFull)) return null
    return rawEventsFull.length > EVENT_LIMIT
      ? rawEventsFull.slice(-EVENT_LIMIT)
      : rawEventsFull
  }, [rawEventsFull])

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
        selectedEvents={rawEvents}
      />
      {selectedPipelineSlug && (
        <>
          <PipelineSubTabs
            activeSubTab={activePipelineSubTab}
            onSubTabChange={onSubTabChange}
          />
          {activePipelineSubTab === 'agent' && (
            <AgentsTab
              pipelineSlug={selectedPipelineSlug}
              wuSlug={wuSlug}
              events={rawEvents ?? null}
              eventsLoading={eventsLoading}
              eventsError={eventsError}
            />
          )}
          {activePipelineSubTab === 'timeline' && (
            <TimelineTab
              pipelineSlug={selectedPipelineSlug}
              events={rawEvents ?? null}
              eventsLoading={eventsLoading}
              eventsError={eventsError}
            />
          )}
        </>
      )}
    </div>
  )
}
