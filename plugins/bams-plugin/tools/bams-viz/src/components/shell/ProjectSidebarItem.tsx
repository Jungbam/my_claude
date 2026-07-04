'use client'

import { memo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { Project } from '@/lib/projects-types'

interface ProjectSidebarItemProps {
  project: Project
  collapsed: boolean
  isPinned: boolean
  onTogglePin: (slug: string) => void
}

/**
 * Sidebar 내 프로젝트 1행.
 * - collapsed=true: 이니셜 배지만 표시
 * - collapsed=false: 이름 + 활성 실행 카운트 배지 + uncommitted stripe
 * - 활성 실행 배지: active_execution_count > 0 시 우측 dot + count
 * - Uncommitted stripe: has_uncommitted_changes=true 시 좌측 3px 노란 border
 * - 우클릭(context menu는 P1) 대신 hover 시 핀 아이콘 노출
 */
export const ProjectSidebarItem = memo(function ProjectSidebarItem({
  project,
  collapsed,
  isPinned,
  onTogglePin,
}: ProjectSidebarItemProps) {
  const router = useRouter()
  const pathname = usePathname()
  const isActive = pathname?.startsWith(`/project/${project.slug}`) ?? false
  const activeCount = project.active_execution_count ?? 0
  const hasDirty = project.has_uncommitted_changes === true
  const initial = project.name.slice(0, 1).toUpperCase()

  const handleNavigate = () => {
    router.push(`/project/${encodeURIComponent(project.slug)}`)
  }

  const handlePinClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onTogglePin(project.slug)
  }

  return (
    <div
      onClick={handleNavigate}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleNavigate()
        }
      }}
      title={collapsed ? project.name : undefined}
      aria-label={project.name}
      aria-current={isActive ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : '8px',
        padding: collapsed ? '8px 0' : '6px 10px 6px 12px',
        borderRadius: '6px',
        cursor: 'pointer',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: isActive ? 'var(--bg-hover)' : 'transparent',
        borderLeft: hasDirty
          ? '3px solid var(--priority-medium)'
          : '3px solid transparent',
        fontSize: '12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          (e.currentTarget as HTMLDivElement).style.background =
            'var(--bg-hover)'
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent'
        }
      }}
    >
      {collapsed ? (
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            position: 'relative',
          }}
        >
          {initial}
          {activeCount > 0 && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--status-running)',
              }}
            />
          )}
        </div>
      ) : (
        <>
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: isActive ? 600 : 400,
            }}
          >
            {project.name}
          </span>
          {activeCount > 0 && (
            <span
              aria-label={`${activeCount} execution${activeCount === 1 ? '' : 's'} running`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--status-running)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--status-running)',
                }}
              />
              {activeCount}
            </span>
          )}
          <button
            onClick={handlePinClick}
            aria-label={isPinned ? 'Unpin project' : 'Pin project'}
            aria-pressed={isPinned}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              fontSize: '11px',
              lineHeight: 1,
              color: isPinned ? 'var(--accent)' : 'var(--text-muted)',
              opacity: isPinned ? 1 : 0.5,
            }}
          >
            {isPinned ? '★' : '☆'}
          </button>
        </>
      )}
    </div>
  )
})
