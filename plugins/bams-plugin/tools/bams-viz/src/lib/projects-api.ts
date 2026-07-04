/**
 * bams-viz/src/lib/projects-api.ts
 *
 * Projects REST API client — design-be.md §2 계약 대응.
 * bams-server가 아직 endpoint를 미제공하는 경우에도 호출부는 catch하여
 * 빈 목록/에러 상태로 우아하게 처리한다.
 */

import type {
  Project,
  ProjectDetail,
  ProjectsListResponse,
  CreateProjectInput,
  ValidatePathResponse,
} from './projects-types'

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
    throw new Error(`projects-api: ${res.status} ${res.statusText} — ${body}`)
  }
  return res.json() as Promise<T>
}

export const projectsApi = {
  list(): Promise<ProjectsListResponse> {
    return apiFetch<ProjectsListResponse>('/api/projects')
  },

  get(slug: string): Promise<{ project: ProjectDetail }> {
    return apiFetch<{ project: ProjectDetail }>(
      `/api/projects/${encodeURIComponent(slug)}`
    )
  },

  create(input: CreateProjectInput): Promise<{ project: Project }> {
    return apiFetch<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  validate(path: string): Promise<ValidatePathResponse> {
    const qs = new URLSearchParams({ path })
    return apiFetch<ValidatePathResponse>(
      `/api/projects/validate?${qs.toString()}`
    )
  },
}
