/**
 * bams-viz/src/lib/project-detail-api.ts
 *
 * Project detail 하위 리소스(rules / pipelines / retros)의 REST 클라이언트.
 * design-be.md §2 계약 대응. `projects-api.ts`(list/get/create/validate)와
 * 파일을 분리한 이유는 병렬 개발 중 공유 파일 편집 충돌을 최소화하기 위함.
 *
 * BE endpoint 미완성 상태에서도 안전 처리:
 *   - 404 / 501 등 미제공 응답은 명확한 Error로 던지고 컴포넌트가 empty 렌더링.
 *   - 응답 스키마의 모든 필드는 optional로 취급한다 (project-detail-types.ts 참조).
 */

import type {
  ProjectRulesListResponse,
  ProjectRuleInput,
  ProjectRule,
  ProjectPipelinesListResponse,
  ProjectRetrosListResponse,
} from './project-detail-types'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // 상위 컴포넌트가 status 코드에 따라 분기하도록 code를 message에 포함
    const err = new Error(`project-detail-api: ${res.status} ${res.statusText} — ${body}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  // 204 No Content 대응
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export const projectDetailApi = {
  pipelines(slug: string): Promise<ProjectPipelinesListResponse> {
    return apiFetch<ProjectPipelinesListResponse>(
      `/api/projects/${encodeURIComponent(slug)}/pipelines`,
    )
  },

  retros(slug: string): Promise<ProjectRetrosListResponse> {
    return apiFetch<ProjectRetrosListResponse>(
      `/api/projects/${encodeURIComponent(slug)}/retros`,
    )
  },

  rules: {
    list(slug: string, kind?: string): Promise<ProjectRulesListResponse> {
      const qs = kind ? `?kind=${encodeURIComponent(kind)}` : ''
      return apiFetch<ProjectRulesListResponse>(
        `/api/projects/${encodeURIComponent(slug)}/rules${qs}`,
      )
    },
    create(slug: string, input: ProjectRuleInput): Promise<{ rule: ProjectRule }> {
      return apiFetch<{ rule: ProjectRule }>(
        `/api/projects/${encodeURIComponent(slug)}/rules`,
        { method: 'POST', body: JSON.stringify(input) },
      )
    },
    patch(
      slug: string,
      id: number,
      patch: Partial<ProjectRuleInput> & { display_order?: number },
    ): Promise<{ rule: ProjectRule }> {
      return apiFetch<{ rule: ProjectRule }>(
        `/api/projects/${encodeURIComponent(slug)}/rules/${id}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
      )
    },
    delete(slug: string, id: number): Promise<void> {
      return apiFetch<void>(
        `/api/projects/${encodeURIComponent(slug)}/rules/${id}`,
        { method: 'DELETE' },
      )
    },
  },
}
