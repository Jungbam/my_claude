'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { usePolling } from '@/hooks/usePolling'
import { useTabParam } from '@/hooks/useTabParam'
import { AppHeader } from '@/components/shared/AppHeader'
import { PipelinesPanel } from '@/components/work-detail/PipelinesPanel'
import { ProjectDetailHeader } from '@/components/project-detail/ProjectDetailHeader'
import {
  ProjectDetailTabs,
  PROJECT_DETAIL_TABS,
} from '@/components/project-detail/ProjectDetailTabs'
import type { ProjectDetailTab } from '@/components/project-detail/ProjectDetailTabs'
import { ProjectOverviewPanel } from '@/components/project-detail/ProjectOverviewPanel'
import { ProjectRulesPanel } from '@/components/project-detail/ProjectRulesPanel'
import { ProjectRetroPanel } from '@/components/project-detail/ProjectRetroPanel'
import type { ProjectDetail } from '@/lib/projects-types'
import type {
  ProjectPipeline,
  ProjectPipelinesListResponse,
} from '@/lib/project-detail-types'

/**
 * /project/[slug] 상세 페이지 (design-fe.md §5-3 / design-ui.md §3-3).
 *
 * 4 탭(overview / pipelines / rules / retro). ?tab= 쿼리를 SSOT로 사용
 * (useTabParam — design-fe §2-2).
 *
 * AppShell(layout.tsx)이 이 경로에서 ProjectSidebar를 렌더하므로
 * 페이지는 AppHeader + main 만 그리면 된다.
 */

export default function ProjectDetailPage() {
  return (
    // useSearchParams는 Suspense boundary 아래에서 사용해야 build 경고를 회피
    <Suspense
      fallback={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            background: 'var(--bg-secondary)',
          }}
        >
          <AppHeader />
          <main
            style={{
              padding: '24px',
              maxWidth: '1200px',
              margin: '0 auto',
              width: '100%',
            }}
          >
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading…
            </div>
          </main>
        </div>
      }
    >
      <ProjectDetailPageInner />
    </Suspense>
  )
}

function ProjectDetailPageInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawSlug = params?.slug as string | undefined
  const slug = rawSlug ? decodeURIComponent(rawSlug) : ''

  const [activeTab, setActiveTab] = useTabParam<ProjectDetailTab>(
    'tab',
    PROJECT_DETAIL_TABS,
    'overview',
  )

  // Selected pipeline (Pipelines 탭 내부 상태 — URL query로 승격, design-fe §2-1)
  const rawSelectedPipeline = searchParams?.get('pipeline') ?? null
  const [localSelectedPipeline, setLocalSelectedPipeline] = useState<string | null>(rawSelectedPipeline)

  // ── Project detail ─────────────────────────────────────
  const {
    data: projectData,
    error: projectError,
    isLoading: projectLoading,
  } = usePolling<{ project: ProjectDetail } | ProjectDetail>(
    slug ? `/api/projects/${encodeURIComponent(slug)}` : null,
    3000,
  )

  // 서버 응답이 { project: {...} } 또는 flat {...} 양쪽 모두일 수 있으므로 방어
  const project = useMemo<ProjectDetail | null>(() => {
    if (!projectData) return null
    if (typeof projectData === 'object' && 'project' in projectData && projectData.project) {
      return projectData.project as ProjectDetail
    }
    if (typeof projectData === 'object' && 'slug' in projectData) {
      return projectData as ProjectDetail
    }
    return null
  }, [projectData])

  // ── Pipelines (Pipelines/Overview 탭에서 공용) ─────────
  const {
    data: pipelinesData,
    error: pipelinesError,
  } = usePolling<ProjectPipelinesListResponse>(
    slug ? `/api/projects/${encodeURIComponent(slug)}/pipelines` : null,
    3000,
  )
  const pipelines: ProjectPipeline[] = pipelinesData?.pipelines ?? []
  void pipelinesError

  const unassignedCount = useMemo(
    () => pipelines.filter(p => p.unassigned === true || !p.wu_slug).length,
    [pipelines],
  )

  const handleBack = useCallback(() => {
    router.push('/')
  }, [router])

  const handleSelectPipeline = useCallback((pipelineSlug: string) => {
    setLocalSelectedPipeline(pipelineSlug)
    // ?pipeline= 쿼리 반영 (딥링크 유지)
    const sp = new URLSearchParams(searchParams?.toString() ?? '')
    sp.set('pipeline', pipelineSlug)
    router.replace(`/project/${encodeURIComponent(slug)}?${sp.toString()}`, { scroll: false })
  }, [slug, searchParams, router])

  // ── Loading state ───────────────────────────────────────
  if (projectLoading && !projectData && !projectError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          background: 'var(--bg-secondary)',
        }}
      >
        <AppHeader />
        <main
          style={{
            padding: '24px',
            maxWidth: '1200px',
            margin: '0 auto',
            width: '100%',
          }}
        >
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading project…
          </div>
        </main>
      </div>
    )
  }

  // ── 404 처리 ────────────────────────────────────────────
  if (projectError || !project) {
    // usePolling error 메시지에 404를 포함시켰다면 그대로 404 UI.
    const notFound = projectError?.message?.includes('404')
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          background: 'var(--bg-secondary)',
        }}
      >
        <AppHeader />
        <main
          style={{
            padding: '24px',
            maxWidth: '1200px',
            margin: '0 auto',
            width: '100%',
          }}
        >
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ color: 'var(--status-fail)', marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>
              {notFound ? 'Project not found' : 'Failed to load project'}
            </div>
            {!notFound && projectError && (
              <div
                style={{
                  color: 'var(--text-muted)',
                  marginBottom: '12px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              >
                {projectError.message}
              </div>
            )}
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
              Back to projects
            </button>
          </div>
        </main>
      </div>
    )
  }

  const isArchived = project.archived_at != null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: 'var(--bg-secondary)',
      }}
    >
      <AppHeader />
      <main
        role="main"
        style={{
          padding: '24px',
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
          flex: 1,
        }}
      >
        {isArchived && (
          <div
            role="status"
            style={{
              padding: '10px 14px',
              marginBottom: '12px',
              background: 'color-mix(in srgb, var(--priority-medium) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--priority-medium) 40%, transparent)',
              borderRadius: '6px',
              color: 'var(--priority-medium)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span aria-hidden>⚠</span>
            <span>
              <strong>Archived.</strong> This project is read-only. Run and rule
              editing are disabled.
            </span>
          </div>
        )}

        <ProjectDetailHeader project={project} onBack={handleBack} />

        <ProjectDetailTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          badges={{
            pipelines: unassignedCount > 0 ? unassignedCount : undefined,
            rules:
              (project.rule_count_by_kind?.must_read ?? 0) > 0
                ? project.rule_count_by_kind?.must_read
                : undefined,
          }}
        />

        {activeTab === 'overview' && (
          <ProjectOverviewPanel project={project} pipelines={pipelines} />
        )}

        {activeTab === 'pipelines' && (
          <div
            role="tabpanel"
            id="project-tabpanel-pipelines"
            aria-labelledby="project-tab-pipelines"
          >
            {unassignedCount > 0 && (
              <div
                style={{
                  marginBottom: '10px',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}
              >
                {unassignedCount} of {pipelines.length} pipeline{pipelines.length !== 1 ? 's' : ''} not linked to any Work Unit
              </div>
            )}
            <PipelinesPanel
              pipelines={pipelines}
              projectSlug={slug}
              selectedSlug={localSelectedPipeline ?? undefined}
              onSelect={handleSelectPipeline}
              selectedEvents={null}
            />
          </div>
        )}

        {activeTab === 'rules' && (
          <ProjectRulesPanel projectSlug={slug} archived={isArchived} />
        )}

        {activeTab === 'retro' && <ProjectRetroPanel projectSlug={slug} />}
      </main>
    </div>
  )
}
