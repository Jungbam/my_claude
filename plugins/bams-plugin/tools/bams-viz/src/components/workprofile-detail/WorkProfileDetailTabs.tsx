'use client'

import { useCallback } from 'react'

export type WorkProfileTab = 'overview' | 'system-prompt' | 'memory'

const TABS: { id: WorkProfileTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'system-prompt', label: 'System Prompt' },
  { id: 'memory', label: 'Memory' },
]

interface WorkProfileDetailTabsProps {
  activeTab: WorkProfileTab
  onTabChange: (tab: WorkProfileTab) => void
}

/**
 * design-fe.md §5-4 — WorkProfile 상세 3탭 네비게이션.
 *
 * 접근성 (design-fe.md §8):
 *   - role="tablist" + tab 요소들에 role="tab"
 *   - ←/→/Home/End 화살표 키 순환 (WorkDetailTabs 미구현 → 신규만 추가)
 */
export function WorkProfileDetailTabs({
  activeTab,
  onTabChange,
}: WorkProfileDetailTabsProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const idx = TABS.findIndex((t) => t.id === activeTab)
      if (idx < 0) return
      let nextIdx = idx
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % TABS.length
      else if (e.key === 'ArrowLeft')
        nextIdx = (idx - 1 + TABS.length) % TABS.length
      else if (e.key === 'Home') nextIdx = 0
      else if (e.key === 'End') nextIdx = TABS.length - 1
      else return
      e.preventDefault()
      onTabChange(TABS[nextIdx].id)
    },
    [activeTab, onTabChange]
  )

  return (
    <div
      role="tablist"
      aria-label="Stack Profile sections"
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--border)',
        marginBottom: '16px',
      }}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`workprofile-panel-${tab.id}`}
            id={`workprofile-tab-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${
                isActive ? 'var(--accent)' : 'transparent'
              }`,
              color: isActive
                ? 'var(--accent)'
                : 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
