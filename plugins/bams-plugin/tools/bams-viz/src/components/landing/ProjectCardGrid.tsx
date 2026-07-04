'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { usePolling } from '@/hooks/usePolling'
import { ProjectCard } from './ProjectCard'
import { AddProjectDialog } from './AddProjectDialog'
import { AddProjectFAB } from './AddProjectFAB'
import type { ProjectsListResponse, Project } from '@/lib/projects-types'

type FilterKind = 'all' | 'active' | 'idle' | 'recent'

const FILTERS: readonly FilterKind[] = ['all', 'active', 'idle', 'recent'] as const
const FILTER_LABELS: Record<FilterKind, string> = {
  all: 'All',
  active: 'Active',
  idle: 'Idle',
  recent: 'Recent',
}

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000 // 최근 24시간

/**
 * 랜딩 Projects 그리드 — /api/projects 5s polling.
 *
 * 필터는 `?filter=` query로 SSOT (design-fe.md §2-1).
 *
 * 정렬 (design-fe.md §5-2 준용):
 *   - active_execution_count > 0 (활성) 먼저
 *   - 그다음 last_pipeline_ts DESC
 *
 * 빈 상태: "Register your first project" CTA — AddProjectDialog 오픈.
 *
 * 사이드바 Add Project CTA와 연동: `bams-viz:open-add-project` window 이벤트를
 * 리스닝하여 다이얼로그 오픈.
 */
export function ProjectCardGrid() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawFilter = searchParams.get('filter')
  const filter: FilterKind = (FILTERS as readonly string[]).includes(rawFilter ?? '')
    ? (rawFilter as FilterKind)
    : 'all'

  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, error, isLoading, mutate } = usePolling<ProjectsListResponse>(
    '/api/projects',
    5000
  )

  // 사이드바 CTA → 다이얼로그 open (custom event bridge)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setDialogOpen(true)
    window.addEventListener('bams-viz:open-add-project', handler)
    return () =>
      window.removeEventListener('bams-viz:open-add-project', handler)
  }, [])

  const setFilter = useCallback(
    (next: FilterKind) => {
      const sp = new URLSearchParams(searchParams.toString())
      if (next === 'all') {
        sp.delete('filter')
      } else {
        sp.set('filter', next)
      }
      const qs = sp.toString()
      router.replace(qs ? `?${qs}` : '?', { scroll: false })
    },
    [router, searchParams]
  )

  const filtered = useMemo(() => {
    const all: Project[] = data?.projects ?? []
    const now = Date.now()
    const list = all.filter(p => {
      if (p.archived_at) return false
      const active = (p.active_execution_count ?? 0) > 0
      const lastMs = p.last_pipeline_ts
        ? new Date(p.last_pipeline_ts).getTime()
        : 0
      switch (filter) {
        case 'active':
          return active
        case 'idle':
          return !active
        case 'recent':
          return lastMs > 0 && now - lastMs <= RECENT_WINDOW_MS
        case 'all':
        default:
          return true
      }
    })
    return list.sort((a, b) => {
      const aActive = (a.active_execution_count ?? 0) > 0 ? 0 : 1
      const bActive = (b.active_execution_count ?? 0) > 0 ? 0 : 1
      if (aActive !== bActive) return aActive - bActive
      const aTs = a.last_pipeline_ts
        ? new Date(a.last_pipeline_ts).getTime()
        : 0
      const bTs = b.last_pipeline_ts
        ? new Date(b.last_pipeline_ts).getTime()
        : 0
      return bTs - aTs
    })
  }, [data, filter])

  const totalAll = data?.projects?.length ?? 0

  const handleCardClick = useCallback(
    (slug: string) => {
      router.push(`/project/${encodeURIComponent(slug)}`)
    },
    [router]
  )

  const handleCreated = useCallback(() => {
    // 즉시 목록 재조회 (optimistic이 아니라 서버 정합성 우선)
    void mutate()
  }, [mutate])

  return (
    <>
      {/* Radio-group filter (design-fe.md §8) */}
      <div
        role="radiogroup"
        aria-label="Project filter"
        style={{
          display: 'flex',
          gap: '6px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        {FILTERS.map(f => {
          const isActive = filter === f
          return (
            <button
              key={f}
              role="radio"
              aria-checked={isActive}
              onClick={() => setFilter(f)}
              style={{
                padding: '5px 14px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                background: isActive ? 'var(--accent)' : 'var(--bg-secondary)',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {FILTER_LABELS[f]}
            </button>
          )
        })}
      </div>

      {/* Loading (첫 진입) */}
      {isLoading && !data && (
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          Loading…
        </div>
      )}

      {/* Error state — CTA는 여전히 렌더 */}
      {error && !data && (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
            border: '1px dashed var(--border)',
            borderRadius: '10px',
            marginBottom: '16px',
          }}
        >
          <div style={{ color: 'var(--status-fail)', marginBottom: '6px' }}>
            Could not load projects.
          </div>
          <div style={{ fontSize: '11px' }}>
            Backend endpoint may not be available yet. You can still register
            your first project.
          </div>
        </div>
      )}

      {/* Empty state — 랜딩 진입 시 등록 유도 */}
      {!isLoading && !error && totalAll === 0 && (
        <div
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            border: '1px dashed var(--border)',
            borderRadius: '12px',
          }}
        >
          <div style={{ fontSize: '28px', marginBottom: '12px', opacity: 0.5 }}>
            +
          </div>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}
          >
            Register your first project
          </div>
          <div style={{ fontSize: '12px', marginBottom: '16px' }}>
            Link a local repository to start orchestrating bams pipelines.
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            style={{
              padding: '8px 16px',
              borderRadius: '999px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Add Project
          </button>
        </div>
      )}

      {/* Filter empty (등록 프로젝트는 있으나 필터 결과 없음) */}
      {!isLoading && totalAll > 0 && filtered.length === 0 && (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}
        >
          No projects match the current filter.
          <div style={{ marginTop: '4px', fontSize: '11px' }}>
            Try changing the filter above.
          </div>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          {filtered.map(p => (
            <ProjectCard
              key={p.slug}
              project={p}
              onClick={() => handleCardClick(p.slug)}
            />
          ))}
        </div>
      )}

      {/* FAB — 등록 상태와 무관하게 언제나 접근 가능 */}
      {totalAll > 0 && (
        <AddProjectFAB onClick={() => setDialogOpen(true)} />
      )}

      <AddProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </>
  )
}
