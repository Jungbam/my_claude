'use client'

import { useEffect, useRef, useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { EmptyState } from '@/components/ui/EmptyState'

interface GanttResponse {
  gantt: string
}

interface PipelineListItem {
  slug: string
  type: string
  status: string
  startedAt: string | null
}

function GanttCard({ slug }: { slug: string }) {
  const { data } = usePolling<GanttResponse>(`/api/mermaid/${slug}`, 3000)
  const containerRef = useRef<HTMLDivElement>(null)
  const mermaidRef = useRef<typeof import('mermaid') | null>(null)
  const prevCodeRef = useRef<string>('')

  const renderMermaid = useCallback(async (code: string) => {
    if (!containerRef.current || code === prevCodeRef.current) return
    prevCodeRef.current = code
    if (!mermaidRef.current) {
      mermaidRef.current = await import('mermaid')
      mermaidRef.current.default.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'strict',
        gantt: { useMaxWidth: false },
      })
    }
    try {
      const id = `gantt-${slug}-${Date.now()}`
      const { svg } = await mermaidRef.current.default.render(id, code)
      containerRef.current.innerHTML = svg
    } catch (err) {
      console.error('Mermaid gantt render error:', err)
      if (containerRef.current) {
        const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        containerRef.current.innerHTML = `<pre style="color:var(--status-fail);padding:20px;font-size:12px;white-space:pre-wrap">${escaped}</pre>`
      }
    }
  }, [slug])

  useEffect(() => {
    if (data?.gantt) renderMermaid(data.gantt)
  }, [data?.gantt, renderMermaid])

  if (!data?.gantt) return null

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '24px',
      boxShadow: '0 2px 8px var(--shadow)',
      marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ fontSize: '16px' }}>📊</span>
        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{slug}</span>
      </div>
      <div ref={containerRef} style={{ minWidth: '1200px', minHeight: '200px', overflow: 'auto' }} />
    </div>
  )
}

export function GanttTab({ pipelineSlug }: { pipelineSlug: string | null }) {
  const { data: pipelines } = usePolling<PipelineListItem[]>('/api/pipelines', 3000)

  // Single pipeline mode
  if (pipelineSlug) {
    return (
      <div style={{ padding: '20px', overflow: 'auto', height: '100%' }}>
        <GanttCard slug={pipelineSlug} />
      </div>
    )
  }

  // All pipelines mode
  if (!pipelines || pipelines.length === 0) {
    return <EmptyState icon="📊" title="No pipelines" description="Run a pipeline to see Gantt charts" />
  }

  return (
    <div style={{ padding: '20px', overflow: 'auto', height: '100%' }}>
      {pipelines.map(p => (
        <GanttCard key={p.slug} slug={p.slug} />
      ))}
    </div>
  )
}
