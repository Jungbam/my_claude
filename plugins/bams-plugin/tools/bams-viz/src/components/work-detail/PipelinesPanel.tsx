'use client'

import { PipelineAccordion } from './PipelineAccordion'
import type { WorkUnitPipeline, PipelineEvent } from '@/lib/types'

interface PipelinesPanelProps {
  pipelines: WorkUnitPipeline[]
  wuSlug: string
  selectedSlug?: string
  onSelect?: (slug: string) => void
  // M-4: 부모가 이미 폴링 중인 events를 주입. selected 파이프라인의 accordion에만 전달된다.
  selectedEvents?: PipelineEvent[] | null
}

export function PipelinesPanel({ pipelines, wuSlug, selectedSlug, onSelect, selectedEvents }: PipelinesPanelProps) {
  if (pipelines.length === 0) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '13px',
      }}>
        No pipelines linked to this work unit
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
          selected={p.slug === selectedSlug}
          onSelect={onSelect}
          events={p.slug === selectedSlug ? selectedEvents ?? null : null}
        />
      ))}
    </div>
  )
}
