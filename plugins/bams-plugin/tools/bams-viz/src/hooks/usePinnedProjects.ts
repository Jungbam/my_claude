'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'bams-viz-pinned-projects'

/**
 * Pinned 프로젝트 slug 배열 — localStorage 지속.
 * design-fe.md §5-2: v1은 localStorage, P1에서 서버 저장 승격 검토.
 */
export function usePinnedProjects() {
  const [pinned, setPinned] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setPinned(parsed.filter(x => typeof x === 'string'))
        }
      }
    } catch {
      /* ignore parse errors */
    }
    setHydrated(true)
  }, [])

  const persist = useCallback((next: string[]) => {
    setPinned(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const togglePin = useCallback((slug: string) => {
    setPinned(prev => {
      const next = prev.includes(slug)
        ? prev.filter(s => s !== slug)
        : [...prev, slug]
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const isPinned = useCallback((slug: string) => pinned.includes(slug), [pinned])

  return { pinned, isPinned, togglePin, setPinned: persist, hydrated }
}
