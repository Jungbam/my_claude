'use client'

import { memo } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import type { Project } from '@/lib/projects-types'

interface ProjectCardProps {
  project: Project
  onClick: () => void
}

/**
 * Projects 그리드의 개별 카드 (design-ui §3-1, design-fe.md §5-1).
 *
 * 표시:
 *   - 상단: 이름 + 활성 실행 카운트 배지
 *   - 중단: repo_path, work_profile_slug, last_pipeline 상대시간
 *   - 좌측 stripe: has_uncommitted_changes=true 시 노란 3px border
 *
 * `<article>` + aria-labelledby (design-fe.md §8) — SR에 카드를 개별 landmark로 노출.
 */
export const ProjectCard = memo(function ProjectCard({
  project,
  onClick,
}: ProjectCardProps) {
  const titleId = `project-card-title-${project.slug}`
  const activeCount = project.active_execution_count ?? 0
  const hasDirty = project.has_uncommitted_changes === true
  const lastTs = project.last_pipeline_ts

  return (
    <article
      aria-labelledby={titleId}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: hasDirty
          ? '3px solid var(--priority-medium)'
          : '1px solid var(--border)',
        borderRadius: '10px',
        padding: '16px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          '0 0 0 1px var(--accent)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none'
      }}
    >
      {/* Top: name + active badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
          gap: '8px',
        }}
      >
        <span
          id={titleId}
          style={{
            fontWeight: 600,
            fontSize: '13px',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
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
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'var(--accent-dim, rgba(59,130,246,0.15))',
              color: 'var(--status-running)',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            <span
              aria-hidden
              className="agent-blink"
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--status-running)',
              }}
            />
            {activeCount} running
          </span>
        )}
      </div>

      {/* Path (monospace) */}
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: '8px',
        }}
        title={project.repo_path}
      >
        {project.repo_path}
      </div>

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '10px',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            fontSize: '10px',
          }}
          aria-label={`Stack Profile: ${project.work_profile_slug}`}
          title={`Stack Profile: ${project.work_profile_slug}`}
        >
          {project.work_profile_slug}
        </span>
        {lastTs ? (
          <span>Last run {formatRelativeTime(lastTs)}</span>
        ) : (
          <span>No runs yet</span>
        )}
        {hasDirty && (
          <span
            title="Uncommitted changes"
            style={{
              color: 'var(--priority-medium)',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            ● Uncommitted
          </span>
        )}
      </div>
    </article>
  )
})
