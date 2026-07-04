/**
 * Project detail 하위 리소스(rules / pipelines / retros)의 도메인 타입.
 *
 * design-be.md §2-2 응답 스키마 대응. BE 미완성 상태에서도 FE가 크래시하지
 * 않도록 모든 필드는 nullable/optional 처리.
 */

import type { WorkUnitPipeline } from './types'

// ── Rules ─────────────────────────────────────────────────────────

export type ProjectRuleKind = 'must-read' | 'pref' | 'style'

export interface ProjectRule {
  id: number
  project_slug: string
  kind: ProjectRuleKind
  title: string
  body_md: string
  display_order?: number | null
  sanitizer_warnings?: string[]
  created_at: string
  updated_at: string
}

export interface ProjectRuleInput {
  kind: ProjectRuleKind
  title: string
  body_md: string
}

export interface ProjectRulesListResponse {
  rules: ProjectRule[]
}

// ── Pipelines (project-scoped) ────────────────────────────────────

/**
 * Project 스코프 파이프라인.
 * 기존 WorkUnitPipeline 대비 wu 링크 여부(unassigned) 표기가 추가된다.
 */
export interface ProjectPipeline extends WorkUnitPipeline {
  wu_slug?: string | null
  unassigned?: boolean
}

export interface ProjectPipelinesListResponse {
  project_slug: string
  pipelines: ProjectPipeline[]
}

// ── Retros ────────────────────────────────────────────────────────

export interface ProjectRetro {
  retro_slug: string
  pipeline_slug?: string | null
  status?: string | null
  date?: string | null
  keep_count?: number
  problem_count?: number
  try_count?: number
}

export interface ProjectRetrosListResponse {
  project_slug: string
  retros: ProjectRetro[]
}
