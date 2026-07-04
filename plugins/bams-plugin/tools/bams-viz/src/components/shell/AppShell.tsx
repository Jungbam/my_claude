'use client'

import { usePathname } from 'next/navigation'
import { ProjectSidebar } from './ProjectSidebar'

interface AppShellProps {
  children: React.ReactNode
}

/**
 * 전역 셸 — skip-link + (조건부) ProjectSidebar + main.
 *
 * 사이드바 표시 규칙 (design-fe.md §2-3):
 *   - `/work/[slug]` 경로: 사이드바 숨김 (하위 호환, hard-coded max-width 1200px 회귀 방지)
 *   - 그 외 경로: 사이드바 표시
 *
 * AppHeader는 각 페이지가 자체 렌더 (기존 컨벤션 유지 — 회귀 방지).
 * 사이드바는 자체 collapse toggle을 최상단에 두어 header 대체.
 *
 * Skip link (design-fe.md §8): 첫 자식으로 `<a>` 배치 — Tab 최초 focus 시 나타남.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const showSidebar = !(pathname?.startsWith('/work/') ?? false)

  if (!showSidebar) {
    return (
      <>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <div id="main-content">{children}</div>
      </>
    )
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          minHeight: '100vh',
        }}
      >
        <ProjectSidebar />
        <div
          id="main-content"
          style={{
            flex: 1,
            minWidth: 0, // flex child overflow 방지
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </div>
      </div>
    </>
  )
}
