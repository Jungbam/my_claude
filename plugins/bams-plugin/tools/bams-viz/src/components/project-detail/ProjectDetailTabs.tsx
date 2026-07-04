'use client'

import type { KeyboardEvent } from 'react'
import { useRef } from 'react'

/**
 * /project/[slug] 상세 4탭 네비게이션 (design-ui.md §3-3 / design-fe.md §5-3).
 * WorkDetailTabs 패턴을 복사한다 (임의 이탈 금지 — design-fe.md §5-3).
 *
 * 접근성 (design-fe.md §8):
 *   - role="tablist" / role="tab" / aria-selected / aria-controls
 *   - ←/→/Home/End 키보드 순환
 */

export const PROJECT_DETAIL_TABS = ['overview', 'pipelines', 'rules', 'retro'] as const
export type ProjectDetailTab = (typeof PROJECT_DETAIL_TABS)[number]

const TAB_LABELS: Record<ProjectDetailTab, string> = {
  overview: 'Overview',
  pipelines: 'Pipelines',
  rules: 'Rules',
  retro: 'Retro',
}

interface ProjectDetailTabsProps {
  activeTab: ProjectDetailTab
  onTabChange: (tab: ProjectDetailTab) => void
  /** 각 탭의 우측에 노출할 카운트 배지 (unassigned pipelines / rules 등) */
  badges?: Partial<Record<ProjectDetailTab, number>>
}

export function ProjectDetailTabs({ activeTab, onTabChange, badges }: ProjectDetailTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = PROJECT_DETAIL_TABS.indexOf(activeTab)
    let nextIndex = currentIndex
    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % PROJECT_DETAIL_TABS.length
        break
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + PROJECT_DETAIL_TABS.length) % PROJECT_DETAIL_TABS.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = PROJECT_DETAIL_TABS.length - 1
        break
      default:
        return
    }
    e.preventDefault()
    const nextTab = PROJECT_DETAIL_TABS[nextIndex]
    onTabChange(nextTab)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Project detail tabs"
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--border)',
        marginBottom: '16px',
      }}
    >
      {PROJECT_DETAIL_TABS.map((tab, i) => {
        const isActive = activeTab === tab
        const badgeCount = badges?.[tab]
        return (
          <button
            key={tab}
            ref={el => { tabRefs.current[i] = el }}
            role="tab"
            id={`project-tab-${tab}`}
            aria-selected={isActive}
            aria-controls={`project-tabpanel-${tab}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab)}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {TAB_LABELS[tab]}
            {badgeCount != null && badgeCount > 0 && (
              <span
                aria-label={`${badgeCount} items`}
                style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: isActive ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: isActive ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                {badgeCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
