'use client'

import { useCallback, useMemo, useState } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { projectDetailApi } from '@/lib/project-detail-api'
import { RulesList } from './RulesList'
import { RuleFormInline } from './RuleFormInline'
import type {
  ProjectRule,
  ProjectRuleInput,
  ProjectRuleKind,
  ProjectRulesListResponse,
} from '@/lib/project-detail-types'

/**
 * /project/[slug] Rules 탭 (design-ui.md §3-3 / design-fe.md §5-3).
 *
 * 3 섹션(must-read / pref / style)을 하나의 요청으로 로드 후 kind별로 분배.
 * (kind 필터 endpoint는 지원되나 목록에서는 통합 요청이 왕복이 적음.)
 *
 * 실패 모드:
 *   - BE 미구현 시 usePolling가 error 세팅 → 상단 무해한 warning + empty rules.
 *   - CRUD 실패 시 폼 내부 인라인 에러 표시.
 */

interface ProjectRulesPanelProps {
  projectSlug: string
  archived?: boolean
}

const SECTION_META: Array<{ kind: ProjectRuleKind; title: string; hint: string }> = [
  {
    kind: 'must-read',
    title: 'Must Read',
    hint: 'Highest priority — injected first, no cap',
  },
  {
    kind: 'pref',
    title: 'Preferences',
    hint: 'Team conventions — 20 most recent shown',
  },
  {
    kind: 'style',
    title: 'Style',
    hint: 'Formatting/coding style — sorted alphabetically',
  },
]

export function ProjectRulesPanel({ projectSlug, archived }: ProjectRulesPanelProps) {
  const { data, error, isLoading, mutate } = usePolling<ProjectRulesListResponse>(
    projectSlug ? `/api/projects/${encodeURIComponent(projectSlug)}/rules` : null,
    10_000,
  )

  const rules = data?.rules ?? []

  // 각 섹션 별 form 상태 (개별 관리)
  const [openForm, setOpenForm] = useState<{ kind: ProjectRuleKind; editing: ProjectRule | null } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const byKind = useMemo(() => {
    const buckets: Record<ProjectRuleKind, ProjectRule[]> = {
      'must-read': [],
      pref: [],
      style: [],
    }
    for (const r of rules) {
      const k = r.kind as ProjectRuleKind
      if (k in buckets) buckets[k].push(r)
    }
    return buckets
  }, [rules])

  const handleOpenCreate = useCallback((kind: ProjectRuleKind) => {
    setFormError(null)
    setOpenForm({ kind, editing: null })
  }, [])

  const handleOpenEdit = useCallback((rule: ProjectRule) => {
    setFormError(null)
    setOpenForm({ kind: rule.kind, editing: rule })
  }, [])

  const handleCancelForm = useCallback(() => {
    setOpenForm(null)
    setFormError(null)
  }, [])

  const handleSubmit = useCallback(async (input: ProjectRuleInput) => {
    setSubmitting(true)
    setFormError(null)
    try {
      if (openForm?.editing) {
        await projectDetailApi.rules.patch(projectSlug, openForm.editing.id, input)
      } else {
        await projectDetailApi.rules.create(projectSlug, input)
      }
      await mutate()
      setOpenForm(null)
    } catch (e) {
      const msg = (e as Error)?.message ?? 'Failed to save rule'
      setFormError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [openForm, projectSlug, mutate])

  const handleDelete = useCallback(async (rule: ProjectRule) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete "${rule.title}"?`)
      if (!ok) return
    }
    try {
      await projectDetailApi.rules.delete(projectSlug, rule.id)
      await mutate()
    } catch (e) {
      console.error('rule delete failed', e)
    }
  }, [projectSlug, mutate])

  const handleReorder = useCallback(async (rule: ProjectRule, direction: 'up' | 'down') => {
    const siblings = byKind['must-read']
    const idx = siblings.findIndex(r => r.id === rule.id)
    if (idx < 0) return
    const target = direction === 'up' ? siblings[idx - 1] : siblings[idx + 1]
    if (!target) return
    const currentOrder = rule.display_order ?? idx
    const targetOrder = target.display_order ?? (direction === 'up' ? idx - 1 : idx + 1)
    try {
      await Promise.all([
        projectDetailApi.rules.patch(projectSlug, rule.id, { display_order: targetOrder }),
        projectDetailApi.rules.patch(projectSlug, target.id, { display_order: currentOrder }),
      ])
      await mutate()
    } catch (e) {
      console.error('rule reorder failed', e)
    }
  }, [byKind, projectSlug, mutate])

  return (
    <div
      role="tabpanel"
      id="project-tabpanel-rules"
      aria-labelledby="project-tab-rules"
    >
      {error && (
        <div
          role="status"
          style={{
            padding: '10px 12px',
            marginBottom: '12px',
            background: 'var(--error-bg)',
            border: '1px solid color-mix(in srgb, var(--status-fail) 30%, transparent)',
            borderRadius: '6px',
            color: 'var(--status-fail)',
            fontSize: '11px',
          }}
        >
          Rules endpoint unavailable — showing empty state. Server may not yet expose /api/projects/:slug/rules.
        </div>
      )}
      {isLoading && !data && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          Loading rules…
        </div>
      )}

      {SECTION_META.map(section => (
        <section key={section.kind} style={{ marginBottom: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                {section.title}
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    marginLeft: '6px',
                  }}
                >
                  ({byKind[section.kind].length})
                </span>
              </h3>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {section.hint}
              </div>
            </div>
            <button
              onClick={() => handleOpenCreate(section.kind)}
              disabled={archived}
              aria-label={`Add ${section.title} rule`}
              style={{
                padding: '4px 10px',
                border: '1px dashed var(--border)',
                borderRadius: '6px',
                background: 'none',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                cursor: archived ? 'not-allowed' : 'pointer',
                opacity: archived ? 0.4 : 1,
              }}
            >
              + Add
            </button>
          </div>

          {openForm?.kind === section.kind && (
            <div style={{ marginBottom: '8px' }}>
              <RuleFormInline
                kind={section.kind}
                initialRule={openForm.editing}
                submitting={submitting}
                errorMessage={formError}
                onSubmit={handleSubmit}
                onCancel={handleCancelForm}
              />
            </div>
          )}

          <RulesList
            kind={section.kind}
            rules={byKind[section.kind]}
            onEdit={archived ? undefined : handleOpenEdit}
            onDelete={archived ? undefined : handleDelete}
            onReorder={
              section.kind === 'must-read' && !archived ? handleReorder : undefined
            }
          />
        </section>
      ))}
    </div>
  )
}
