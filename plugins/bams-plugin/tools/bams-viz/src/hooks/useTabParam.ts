'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

/**
 * URL 쿼리 `?<key>=<value>` 를 컴포넌트 상태의 SSOT로 다루는 훅
 * (design-fe.md §2-2).
 *
 * - allowed 목록에 없는 값이 오면 fallback으로 정규화한다 (히스토리 오염 없음 — replace).
 * - `scroll: false`로 탭 전환 시 스크롤 리셋을 방지한다 (기존 /work/[slug] UX 계승).
 *
 * @example
 *   const [tab, setTab] = useTabParam('tab', ['overview','pipelines','rules','retro'] as const, 'overview')
 */
export function useTabParam<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const raw = searchParams?.get(key) ?? null
  const value = ((allowed as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback)

  const setValue = useCallback((next: T) => {
    const sp = new URLSearchParams(searchParams?.toString() ?? '')
    sp.set(key, next)
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : `${pathname}`, { scroll: false })
  }, [router, pathname, searchParams, key])

  return [value, setValue]
}
