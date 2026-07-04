'use client'

import { PipelineAccordion } from './PipelineAccordion'
import type { WorkUnitPipeline, PipelineEvent } from '@/lib/types'

// design-fe.md §5-3: 시그니처 union 확장. wuSlug 또는 projectSlug 중 하나가 요구된다.
// 기존 /work/[slug] 호출부는 wuSlug만 지정 — 무손상.
type PipelinesPanelProps = {
  pipelines: (WorkUnitPipeline & { wu_slug?: string | null; unassigned?: boolean })[]
  selectedSlug?: string
  onSelect?: (slug: string) => void
  // M-4: 부모가 이미 폴링 중인 events를 주입. selected 파이프라인의 accordion에만 전달된다.
  selectedEvents?: PipelineEvent[] | null
} & ({ wuSlug: string; projectSlug?: undefined } | { projectSlug: string; wuSlug?: undefined })

export function PipelinesPanel({ pipelines, wuSlug, projectSlug, selectedSlug, onSelect, selectedEvents }: PipelinesPanelProps) {
  if (pipelines.length === 0) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '13px',
      }}>
        {projectSlug
          ? 'No pipelines for this project yet'
          : 'No pipelines linked to this work unit'}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {pipelines.map(p => (
        <PipelineAccordion
          key={p.id ?? p.slug}
          pipeline={p}
          wuSlug={wuSlug}
          projectSlug={projectSlug}
          pipelineWuSlug={p.wu_slug ?? null}
          unassigned={p.unassigned === true || (projectSlug != null && !p.wu_slug)}
          selected={p.slug === selectedSlug}
          onSelect={onSelect}
          events={p.slug === selectedSlug ? selectedEvents ?? null : null}
        />
      ))}
    </div>
  )
}
