'use client'

import { memo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { WorkProfile } from '@/lib/projects-types'

interface WorkProfileSidebarItemProps {
  profile: WorkProfile
  collapsed: boolean
}

/**
 * Sidebar 내 Stack Profile 1행 (코드 심볼은 WorkProfile, UI 라벨은 Stack Profile — OQ-1).
 */
export const WorkProfileSidebarItem = memo(function WorkProfileSidebarItem({
  profile,
  collapsed,
}: WorkProfileSidebarItemProps) {
  const router = useRouter()
  const pathname = usePathname()
  const isActive = pathname?.startsWith(`/workprofile/${profile.slug}`) ?? false
  const initial = profile.name.slice(0, 1).toUpperCase()

  const handleNavigate = () => {
    router.push(`/workprofile/${encodeURIComponent(profile.slug)}`)
  }

  return (
    <div
      onClick={handleNavigate}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleNavigate()
        }
      }}
      title={collapsed ? profile.name : undefined}
      aria-label={`Stack Profile: ${profile.name}`}
      aria-current={isActive ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : '8px',
        padding: collapsed ? '8px 0' : '6px 10px 6px 12px',
        borderRadius: '6px',
        cursor: 'pointer',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: isActive ? 'var(--bg-hover)' : 'transparent',
        borderLeft: '3px solid transparent',
        fontSize: '12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          (e.currentTarget as HTMLDivElement).style.background =
            'var(--bg-hover)'
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent'
        }
      }}
    >
      {collapsed ? (
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {initial}
        </div>
      ) : (
        <>
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: isActive ? 600 : 400,
            }}
          >
            {profile.name}
          </span>
          {typeof profile.usage_count === 'number' && profile.usage_count > 0 && (
            <span
              aria-label={`${profile.usage_count} projects using`}
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                background: 'var(--bg-tertiary)',
                padding: '1px 6px',
                borderRadius: '10px',
              }}
            >
              {profile.usage_count}
            </span>
          )}
        </>
      )}
    </div>
  )
})
