/**
 * bams-viz/src/lib/workprofiles-api.ts
 *
 * WorkProfiles REST API client — design-be.md §2 계약 대응.
 * UI 라벨은 "Stack Profile"이나 코드 심볼은 WorkProfile 유지 (OQ-1).
 */

import type { WorkProfilesListResponse, WorkProfile } from './projects-types'

// ── Detail / Memory 타입 확장 (design-be §2-2, §2-3) ───────────────────────
// projects-types.ts는 목록 표시용 최소 필드만 정의 — 상세/메모리 타입은 여기에 인접 배치.

export type WorkProfileMemoryKind = 'learned_pattern' | 'gotcha' | 'gold_snippet'

export interface WorkProfileMemorySummary {
  learned_pattern?: number
  gotcha?: number
  gold_snippet?: number
}

export interface WorkProfileDetail extends WorkProfile {
  system_prompt_md?: string | null
  memory_summary?: WorkProfileMemorySummary
  auto_retro_enabled?: boolean
  is_preset?: boolean
  usage_count?: number
}

export interface WorkProfileMemory {
  id: number
  work_profile_slug: string
  kind: WorkProfileMemoryKind
  body_md: string
  source?: string | null
  created_at: string
  decayed_at?: string | null
  sanitizer_warnings?: string[] | null
}

export interface WorkProfileMemoryListResponse {
  memories: WorkProfileMemory[]
  promote_candidates?: PromoteCandidate[]
}

export interface PromoteCandidate {
  source: string
  kind: WorkProfileMemoryKind
  body_md: string
  origin?: string
}

export interface WorkProfilePatch {
  system_prompt_md?: string
  auto_retro_enabled?: boolean
  name?: string
}

export interface PatchResponse {
  workprofile: WorkProfileDetail
  sanitizer_warnings?: string[]
}

export interface MemoryCreateInput {
  kind: WorkProfileMemoryKind
  body_md: string
  source?: string
}

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
    const err = new Error(
      `workprofiles-api: ${res.status} ${res.statusText} — ${body}`
    ) as Error & { status?: number; body?: string }
    err.status = res.status
    err.body = body
    throw err
  }
  return res.json() as Promise<T>
}

const wpBase = (slug: string) =>
  `/api/workprofiles/${encodeURIComponent(slug)}`

export const workProfilesApi = {
  list(): Promise<WorkProfilesListResponse> {
    return apiFetch<WorkProfilesListResponse>('/api/workprofiles')
  },

  get(slug: string): Promise<{ workprofile: WorkProfileDetail }> {
    return apiFetch<{ workprofile: WorkProfileDetail }>(wpBase(slug))
  },

  patch(slug: string, patch: WorkProfilePatch): Promise<PatchResponse> {
    return apiFetch<PatchResponse>(wpBase(slug), {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  memory: {
    list(
      slug: string,
      opts?: { kind?: WorkProfileMemoryKind; activeOnly?: boolean }
    ): Promise<WorkProfileMemoryListResponse> {
      const sp = new URLSearchParams()
      if (opts?.kind) sp.set('kind', opts.kind)
      if (opts?.activeOnly) sp.set('alive', 'true')
      const qs = sp.toString() ? `?${sp.toString()}` : ''
      return apiFetch<WorkProfileMemoryListResponse>(
        `${wpBase(slug)}/memories${qs}`
      )
    },
    create(
      slug: string,
      input: MemoryCreateInput
    ): Promise<{ memory: WorkProfileMemory; sanitizer_warnings?: string[] }> {
      return apiFetch(`${wpBase(slug)}/memories`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    patch(
      slug: string,
      id: number,
      patch: Partial<MemoryCreateInput> & { decayed_at?: string | null }
    ): Promise<{ memory: WorkProfileMemory }> {
      return apiFetch(`${wpBase(slug)}/memories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },
    /**
     * Soft-delete via POST /memories/:id/decay — 서버 규약(design-be §2-3).
     * 이전 구현은 PATCH { decayed_at } 였으나 서버 PATCH는 kind/title/body_md만 수용.
     */
    decay(slug: string, id: number): Promise<{ memory: WorkProfileMemory }> {
      return apiFetch(`${wpBase(slug)}/memories/${id}/decay`, {
        method: 'POST',
      })
    },
    delete(slug: string, id: number): Promise<void> {
      return apiFetch(`${wpBase(slug)}/memories/${id}`, { method: 'DELETE' })
    },
    /**
     * promote-candidates endpoint — design-be에 명시되지 않음(OC-FE-4).
     * 서버가 404를 반환하면 빈 목록으로 우아하게 처리.
     */
    async candidates(slug: string): Promise<PromoteCandidate[]> {
      try {
        const res = await apiFetch<{ candidates: PromoteCandidate[] }>(
          `${wpBase(slug)}/memory-candidates`
        )
        return res.candidates ?? []
      } catch (err) {
        const status = (err as { status?: number }).status
        if (status === 404 || status === undefined) return []
        throw err
      }
    },
  },
}
