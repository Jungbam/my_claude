'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'bams-viz-sidebar-collapsed'

/**
 * 사이드바 collapsed 상태를 localStorage에 지속.
 * SSR/hydration mismatch 방지를 위해 초기 렌더는 collapsed=false로 시작,
 * useEffect에서 localStorage 값으로 정정 (AppHeader theme 로직과 동일 패턴).
 */
export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      setCollapsed(saved === 'true')
    } catch {
      // localStorage 접근 실패(private mode 등) → 기본값 유지
    }
    setHydrated(true)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  return { collapsed, toggle, hydrated }
}
