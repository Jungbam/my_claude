'use client'

import type { PipelineSubTab } from '@/lib/types'

const SUB_TABS: { id: PipelineSubTab; label: string }[] = [
  { id: 'agent', label: 'Agent' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'dag', label: 'DAG' },
  { id: 'logs', label: 'Logs' },
]

interface PipelineSubTabsProps {
  activeSubTab: PipelineSubTab
  onSubTabChange: (tab: PipelineSubTab) => void
}

export function PipelineSubTabs({ activeSubTab, onSubTabChange }: PipelineSubTabsProps) {
  return (
    <nav style={{
      display: 'flex',
      gap: 0,
      borderBottom: '1px solid var(--border)',
      marginTop: '16px',
      marginBottom: '12px',
    }}>
      {SUB_TABS.map(tab => {
        const isActive = activeSubTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onSubTabChange(tab.id)}
            style={{
              padding: '6px 14px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${isActive ? 'var(--text-secondary)' : 'transparent'}`,
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
