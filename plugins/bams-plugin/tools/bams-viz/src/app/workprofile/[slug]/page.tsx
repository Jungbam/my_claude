'use client'

import { useCallback, useMemo } from 'react'
import {
  useParams,
  useRouter,
  useSearchParams,
} from 'next/navigation'
import useSWR from 'swr'
import { AppHeader } from '@/components/shared/AppHeader'
import { workProfilesApi } from '@/lib/workprofiles-api'
import type { WorkProfileDetail } from '@/lib/workprofiles-api'
import { WorkProfileDetailHeader } from '@/components/workprofile-detail/WorkProfileDetailHeader'
import {
  WorkProfileDetailTabs,
  type WorkProfileTab,
} from '@/components/workprofile-detail/WorkProfileDetailTabs'
import { WorkProfileOverviewPanel } from '@/components/workprofile-detail/WorkProfileOverviewPanel'
import { SystemPromptEditor } from '@/components/workprofile-detail/SystemPromptEditor'
import { WorkProfileMemoryPanel } from '@/components/workprofile-detail/WorkProfileMemoryPanel'

const ALLOWED_TABS: readonly WorkProfileTab[] = [
  'overview',
  'system-prompt',
  'memory',
] as const

/**
 * /workprofile/[slug] — Stack Profile 상세 (design-fe.md §5-4).
 *
 * 3탭 (URL query ?tab=):
 *   - overview      : stack tags + usage + memory summary + auto_retro toggle
 *   - system-prompt : Markdown 편집 + preview
 *   - memory        : alive 목록 + promote 후보 + 수동 추가
 *
 * OQ-1: 코드 심볼 WorkProfile, UI 라벨 "Stack Profile".
 */
export default function WorkProfileDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = params.slug as string

  const activeTab: WorkProfileTab = useMemo(() => {
    const raw = searchParams.get('tab')
    return (ALLOWED_TABS as readonly string[]).includes(raw ?? '')
      ? (raw as WorkProfileTab)
      : 'overview'
  }, [searchParams])

  const setActiveTab = useCallback(
    (next: WorkProfileTab) => {
      const sp = new URLSearchParams(searchParams.toString())
      sp.set('tab', next)
      router.replace(`?${sp.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const handleBack = useCallback(() => router.push('/'), [router])

  const { data, error, isLoading, mutate } = useSWR<{
    workprofile: WorkProfileDetail
  }>(
    slug ? ['workprofile-detail', slug] : null,
    () => workProfilesApi.get(slug),
    { refreshInterval: 10_000, revalidateOnFocus: true }
  )

  const workprofile = data?.workprofile
  const onPatched = useCallback(() => {
    mutate()
  }, [mutate])

  if (isLoading && !data) {
    return (
      <PageShell>
        <div style={loadingStyle}>Loading…</div>
      </PageShell>
    )
  }

  // 404 처리: bams-server 프록시가 NOT_FOUND를 반환하거나 workprofile이 undefined인 경우.
  const isNotFound =
    error &&
    ((error as { status?: number }).status === 404 ||
      /404|NOT_FOUND/i.test((error as Error).message ?? ''))

  if (isNotFound || (!isLoading && !workprofile)) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div
            style={{
              color: 'var(--status-fail)',
              marginBottom: '12px',
              fontSize: '13px',
            }}
          >
            Stack Profile "{slug}" not found.
          </div>
          <button onClick={handleBack} style={secondaryButtonStyle}>
            Back to list
          </button>
        </div>
      </PageShell>
    )
  }

  if (error || !workprofile) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div
            style={{
              color: 'var(--status-fail)',
              marginBottom: '12px',
              fontSize: '13px',
            }}
          >
            {(error as Error)?.message || 'Failed to load Stack Profile.'}
          </div>
          <button onClick={handleBack} style={secondaryButtonStyle}>
            Back to list
          </button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <WorkProfileDetailHeader workprofile={workprofile} onBack={handleBack} />
      <WorkProfileDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === 'overview' && (
        <WorkProfileOverviewPanel
          workprofile={workprofile}
          onPatched={onPatched}
        />
      )}
      {activeTab === 'system-prompt' && (
        <SystemPromptEditor
          workprofile={workprofile}
          onPatched={onPatched}
        />
      )}
      {activeTab === 'memory' && (
        <WorkProfileMemoryPanel workprofile={workprofile} />
      )}
    </PageShell>
  )
}

// ── shell ───────────────────────────────────────────────────────────────────
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: 'var(--bg-secondary)',
      }}
    >
      <AppHeader />
      <main
        style={{
          padding: '24px',
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
          flex: 1,
        }}
      >
        {children}
      </main>
    </div>
  )
}

const loadingStyle: React.CSSProperties = {
  padding: '40px',
  textAlign: 'center',
  color: 'var(--text-muted)',
  fontSize: '13px',
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  fontSize: '12px',
  cursor: 'pointer',
}
