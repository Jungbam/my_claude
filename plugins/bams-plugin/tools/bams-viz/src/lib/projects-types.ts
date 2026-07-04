/**
 * Project / WorkProfile 도메인 타입 — design-be.md §2-2 응답 스키마 대응
 *
 * BE 미완성 상태에서도 FE가 안전하게 렌더할 수 있도록 모든 필드는
 * nullable 또는 default 처리한다. 서버 응답이 부분적으로 오더라도
 * ProjectCard/Sidebar가 크래시하지 않게 하는 것이 목적.
 */

export interface Project {
  slug: string
  name: string
  repo_path: string
  work_profile_slug: string
  default_branch: string
  archived_at: string | null
  active_execution_count?: number
  last_pipeline_ts?: string | null
  has_uncommitted_changes?: boolean | null
}

export interface ProjectDetail extends Project {
  rule_count_by_kind?: {
    must_read?: number
    pref?: number
    style?: number
  }
  pipeline_count?: number
  recent_executions?: unknown[]
}

export interface ProjectsListResponse {
  projects: Project[]
}

export interface CreateProjectInput {
  slug: string
  name: string
  repo_path: string
  work_profile_slug: string
  default_branch?: string
}

export interface ValidatePathResponse {
  ok: boolean
  reason?: 'not_found' | 'not_git' | 'not_absolute' | 'not_in_home' | 'duplicate'
  suggestion?: string
}

export interface WorkProfile {
  slug: string
  name: string
  stack_tags?: string[]
  usage_count?: number
}

export interface WorkProfilesListResponse {
  workprofiles: WorkProfile[]
}
