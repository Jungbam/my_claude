'use client'

import { useMemo, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { usePolling } from '@/hooks/usePolling'
import { useSidebarState } from '@/hooks/useSidebarState'
import { usePinnedProjects } from '@/hooks/usePinnedProjects'
import { ProjectSidebarItem } from './ProjectSidebarItem'
import { WorkProfileSidebarItem } from './WorkProfileSidebarItem'
import type {
  ProjectsListResponse,
  WorkProfilesListResponse,
} from '@/lib/projects-types'

const WIDTH_EXPANDED = 280
const WIDTH_COLLAPSED = 64

/**
 * 좌측 전역 사이드바 (design-fe.md §5-2 / design-ui.md §3-2).
 *
 * 구조:
 *   - 상단: Collapse toggle 버튼
 *   - Projects 섹션: Pinned (상단) + Recent (하단), + Add Project CTA
 *   - Stack Profiles 섹션
 *   - 하단: HR nav 링크
 *
 * 데이터:
 *   - /api/projects (5s polling, GET failure → empty gracefully)
 *   - /api/workprofiles (30s polling)
 *
 * BE가 아직 endpoint 미제공 시 usePolling이 error 상태를 반환 —
 * 아래에서 data?? [] 패턴으로 크래시 없이 empty 렌더.
 */

interface ProjectSidebarProps {
  onAddProject?: () => void
}

export function ProjectSidebar({ onAddProject }: ProjectSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { collapsed, toggle, hydrated } = useSidebarState()
  const { isPinned, togglePin, pinned, hydrated: pinnedHydrated } =
    usePinnedProjects()

  // Endpoint가 없으면 fetch 실패 → data undefined + error 세팅 (usePolling)
  const { data: projectsData } = usePolling<ProjectsListResponse>(
    '/api/projects',
    5000
  )
  const { data: profilesData } = usePolling<WorkProfilesListResponse>(
    '/api/workprofiles',
    30000
  )

  const projects = projectsData?.projects ?? []
  const profiles = profilesData?.workprofiles ?? []

  // Sort: pinned (사용자 저장 순서) → recent (last_pipeline_ts DESC)
  const { pinnedProjects, recentProjects } = useMemo(() => {
    if (!pinnedHydrated) {
      return { pinnedProjects: [], recentProjects: projects.slice(0, 20) }
    }
    const pinnedMap = new Map(
      projects.filter(p => isPinned(p.slug)).map(p => [p.slug, p])
    )
    const pinnedInOrder = pinned
      .map(slug => pinnedMap.get(slug))
      .filter((p): p is NonNullable<typeof p> => p != null)

    const rest = projects.filter(p => !isPinned(p.slug))
    rest.sort((a, b) => {
      const at = a.last_pipeline_ts
        ? new Date(a.last_pipeline_ts).getTime()
        : 0
      const bt = b.last_pipeline_ts
        ? new Date(b.last_pipeline_ts).getTime()
        : 0
      return bt - at
    })
    return {
      pinnedProjects: pinnedInOrder,
      recentProjects: rest.slice(0, 20),
    }
  }, [projects, pinned, isPinned, pinnedHydrated])

  const isHR = pathname === '/hr'
  const isSidebarPathActive = !isHR

  const handleAddClick = useCallback(() => {
    if (onAddProject) {
      onAddProject()
    } else {
      // fallback: 이벤트를 window에 broadcast — 랜딩이 리스닝
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bams-viz:open-add-project'))
      }
      router.push('/')
    }
  }, [onAddProject, router])

  return (
    <nav
      aria-label="Primary navigation"
      style={{
        width: hydrated
          ? collapsed
            ? WIDTH_COLLAPSED
            : WIDTH_EXPANDED
          : WIDTH_EXPANDED,
        flexShrink: 0,
        background: 'var(--sidebar-bg, var(--bg-card))',
        borderRight: '1px solid var(--sidebar-border, var(--border))',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        transition: 'width 0.15s ease',
        overflow: 'hidden',
      }}
    >
      {/* Collapse toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: collapsed ? 'center' : 'flex-end',
          padding: '8px 8px 4px',
          borderBottom: '1px solid var(--border-light)',
        }}
      >
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar-content"
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            lineHeight: 1,
          }}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <div
        id="app-sidebar-content"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {/* Projects section */}
        <SidebarSection title="Projects" collapsed={collapsed}>
          {pinnedProjects.length === 0 &&
          recentProjects.length === 0 ? (
            <EmptyRow collapsed={collapsed} label="No projects" />
          ) : (
            <>
              {pinnedProjects.map(p => (
                <ProjectSidebarItem
                  key={p.slug}
                  project={p}
                  collapsed={collapsed}
                  isPinned
                  onTogglePin={togglePin}
                />
              ))}
              {pinnedProjects.length > 0 && recentProjects.length > 0 && (
                <div
                  aria-hidden
                  style={{
                    height: 1,
                    background: 'var(--border-light)',
                    margin: '4px 12px',
                  }}
                />
              )}
              {recentProjects.map(p => (
                <ProjectSidebarItem
                  key={p.slug}
                  project={p}
                  collapsed={collapsed}
                  isPinned={false}
                  onTogglePin={togglePin}
                />
              ))}
            </>
          )}

          <AddCTA
            collapsed={collapsed}
            label="+ Add Project"
            onClick={handleAddClick}
          />
        </SidebarSection>

        {/* Stack Profiles section */}
        <SidebarSection title="Stack Profiles" collapsed={collapsed}>
          {profiles.length === 0 ? (
            <EmptyRow collapsed={collapsed} label="No profiles" />
          ) : (
            profiles.map(p => (
              <WorkProfileSidebarItem
                key={p.slug}
                profile={p}
                collapsed={collapsed}
              />
            ))
          )}
        </SidebarSection>
      </div>

      {/* Footer nav: HR */}
      <div
        style={{
          borderTop: '1px solid var(--border-light)',
          padding: '8px',
        }}
      >
        <div
          onClick={() => router.push('/hr')}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              router.push('/hr')
            }
          }}
          aria-current={isHR ? 'page' : undefined}
          title={collapsed ? 'HR' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: collapsed ? 0 : '10px',
            padding: collapsed ? '8px 0' : '8px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            color: isHR ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: isHR ? 'var(--bg-hover)' : 'transparent',
            fontSize: '12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            fontWeight: isHR ? 600 : 400,
          }}
        >
          <span aria-hidden style={{ fontSize: '14px' }}>⚙</span>
          {!collapsed && <span>HR</span>}
        </div>
      </div>
    </nav>
  )

  // Keep sidebarPathActive referenced (avoid unused variable lint on future edits)
  void isSidebarPathActive
}

// ── Internal parts ─────────────────────────────────

function SidebarSection({
  title,
  collapsed,
  children,
}: {
  title: string
  collapsed: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {!collapsed && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--text-muted)',
            padding: '6px 12px 4px',
          }}
        >
          {title}
        </div>
      )}
      {collapsed && (
        <div
          aria-hidden
          style={{
            height: 1,
            background: 'var(--border-light)',
            margin: '4px 12px',
          }}
        />
      )}
      {children}
    </div>
  )
}

function AddCTA({
  collapsed,
  label,
  onClick,
}: {
  collapsed: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : '6px',
        padding: collapsed ? '8px 0' : '6px 12px',
        margin: '4px 0 0',
        borderRadius: '6px',
        background: 'none',
        border: '1px dashed var(--border)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: '12px',
        width: '100%',
      }}
    >
      {collapsed ? '+' : label}
    </button>
  )
}

function EmptyRow({
  collapsed,
  label,
}: {
  collapsed: boolean
  label: string
}) {
  if (collapsed) return null
  return (
    <div
      style={{
        padding: '8px 12px',
        fontSize: '11px',
        color: 'var(--text-muted)',
        fontStyle: 'italic',
      }}
    >
      {label}
    </div>
  )
}
