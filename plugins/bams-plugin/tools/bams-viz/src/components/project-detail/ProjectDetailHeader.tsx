'use client'

import { useState, useCallback } from 'react'
import type { ProjectDetail } from '@/lib/projects-types'
import { ExecutionConsoleModal } from '@/components/modals/ExecutionConsoleModal'

/**
 * /project/[slug] 상단 헤더 (design-ui.md §3-3 / design-fe.md §5-3).
 *
 * 요소:
 *   - ProjectTitle (name)
 *   - repo_path 짧은 표시
 *   - WorkProfileBadge ("Stack Profile: {name}")
 *   - GitStatusBadge (v1 — placeholder, has_uncommitted_changes 진위값만 반영)
 *   - RunButton — TASK-124 ExecutionConsoleModal 오픈
 *   - archived 상태면 Run 비활성
 */

interface ProjectDetailHeaderProps {
  project: ProjectDetail
  onBack: () => void
  onRun?: () => void
}

export function ProjectDetailHeader({ project, onBack, onRun }: ProjectDetailHeaderProps) {
  const [consoleOpen, setConsoleOpen] = useState(false)
  const isArchived = project.archived_at != null
  const isDirty = project.has_uncommitted_changes === true
  const activeCount = project.active_execution_count ?? 0

  const handleRunClick = useCallback(() => {
    if (onRun) {
      onRun()
      return
    }
    setConsoleOpen(true)
  }, [onRun])

  return (
    <div style={{ marginBottom: '20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '10px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={onBack}
          aria-label="Go back"
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: '14px',
            color: 'var(--text-secondary)',
            lineHeight: 1,
          }}
        >
          &larr;
        </button>

        <h1
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
          title={project.name || project.slug}
        >
          {project.name || project.slug}
        </h1>

        <WorkProfileBadge slug={project.work_profile_slug} />

        <GitStatusBadge isDirty={isDirty} />

        {activeCount > 0 && (
          <span
            aria-label={`${activeCount} active execution${activeCount !== 1 ? 's' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              color: 'var(--accent)',
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            <span
              aria-hidden
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--accent)',
              }}
            />
            {activeCount} running
          </span>
        )}

        <div style={{ position: 'relative' }}>
          <button
            onClick={handleRunClick}
            disabled={isArchived}
            aria-disabled={isArchived}
            title={
              isArchived
                ? 'Archived projects cannot be run'
                : 'Open execution console'
            }
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid var(--accent)',
              background: isArchived ? 'var(--bg-secondary)' : 'var(--accent)',
              color: isArchived ? 'var(--text-muted)' : '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isArchived ? 'not-allowed' : 'pointer',
              opacity: isArchived ? 0.55 : 1,
            }}
          >
            ▶ Run
          </button>
        </div>
      </div>

      {/* repo_path — 두 번째 줄 (긴 경로 대응) */}
      {project.repo_path && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={project.repo_path}
        >
          {project.repo_path}
        </div>
      )}

      <ExecutionConsoleModal
        open={consoleOpen}
        projectSlug={project.slug}
        onClose={() => setConsoleOpen(false)}
      />
    </div>
  )
}

function WorkProfileBadge({ slug }: { slug?: string | null }) {
  if (!slug) return null
  return (
    <a
      href={`/workprofile/${encodeURIComponent(slug)}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        background: 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
        fontWeight: 500,
        lineHeight: 1.4,
        textDecoration: 'none',
        border: '1px solid var(--border)',
      }}
      title={`Stack Profile: ${slug}`}
    >
      Stack: {slug}
    </a>
  )
}

/**
 * GitStatusBadge — v1 placeholder (F-S5 완성 P1).
 * has_uncommitted_changes가 null이면 non-visible. true면 노란 dot + "dirty".
 */
function GitStatusBadge({ isDirty }: { isDirty: boolean }) {
  if (!isDirty) return null
  return (
    <span
      aria-label="Uncommitted changes detected"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '10px',
        background: 'color-mix(in srgb, var(--priority-medium) 18%, transparent)',
        color: 'var(--priority-medium)',
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      <span
        aria-hidden
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: 'var(--priority-medium)',
        }}
      />
      uncommitted
    </span>
  )
}
