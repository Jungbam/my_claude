'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import useSWR from 'swr'
import { workProfilesApi } from '@/lib/workprofiles-api'
import type {
  WorkProfileDetail,
  WorkProfileMemoryKind,
  WorkProfileMemoryListResponse,
  PromoteCandidate,
} from '@/lib/workprofiles-api'
import { MemoryList } from './MemoryList'
import { PromoteCandidatesSection } from './PromoteCandidatesSection'

interface WorkProfileMemoryPanelProps {
  workprofile: WorkProfileDetail
}

const KIND_OPTIONS: { id: WorkProfileMemoryKind; label: string }[] = [
  { id: 'learned_pattern', label: 'Learned' },
  { id: 'gotcha', label: 'Gotcha' },
  { id: 'gold_snippet', label: 'Snippet' },
]

/**
 * design-fe.md §5-4 — Memory 탭.
 *   - Filter chips (kind × 3, all) + 검색 인풋(로컬 필터)
 *   - PromoteCandidatesSection (배너)
 *   - MemoryList (alive 목록, decayed_at IS NULL)
 *   - 수동 추가 폼 (kind select + body textarea)
 *
 * fetcher는 workProfilesApi.memory.list — 404 시 useSWR 에러 상태 → EmptyState.
 * PromoteCandidates는 candidates() 자체가 404를 흡수 → 항상 배열 반환.
 */
export function WorkProfileMemoryPanel({
  workprofile,
}: WorkProfileMemoryPanelProps) {
  const slug = workprofile.slug

  const {
    data: memRes,
    error: memError,
    mutate: mutateMemories,
    isLoading: memLoading,
  } = useSWR<WorkProfileMemoryListResponse>(
    slug ? ['workprofile-memory', slug] : null,
    () => workProfilesApi.memory.list(slug, { activeOnly: true }),
    { refreshInterval: 10_000, revalidateOnFocus: true }
  )

  const {
    data: candidates,
    mutate: mutateCandidates,
  } = useSWR<PromoteCandidate[]>(
    slug ? ['workprofile-memory-candidates', slug] : null,
    () => workProfilesApi.memory.candidates(slug),
    { refreshInterval: 30_000, revalidateOnFocus: false }
  )

  const [kindFilter, setKindFilter] = useState<
    WorkProfileMemoryKind | 'all'
  >('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setKindFilter('all')
    setSearch('')
  }, [slug])

  const memories = memRes?.memories ?? []
  const promoteCandidates =
    candidates ?? memRes?.promote_candidates ?? []

  const filteredMemories = useMemo(() => {
    let list = memories
    if (kindFilter !== 'all') {
      list = list.filter((m) => m.kind === kindFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (m) =>
          m.body_md.toLowerCase().includes(q) ||
          (m.source ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [memories, kindFilter, search])

  const refresh = useCallback(() => {
    mutateMemories()
    mutateCandidates()
  }, [mutateMemories, mutateCandidates])

  return (
    <div
      id="workprofile-panel-memory"
      role="tabpanel"
      aria-labelledby="workprofile-tab-memory"
      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      <PromoteCandidatesSection
        slug={slug}
        candidates={promoteCandidates}
        onPromoted={refresh}
      />

      {/* Filter row */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div
          role="radiogroup"
          aria-label="Filter by kind"
          style={{ display: 'flex', gap: '4px' }}
        >
          <ChipButton
            active={kindFilter === 'all'}
            onClick={() => setKindFilter('all')}
            label={`All (${memories.length})`}
          />
          {KIND_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.id}
              active={kindFilter === opt.id}
              onClick={() => setKindFilter(opt.id)}
              label={`${opt.label} (${memories.filter((m) => m.kind === opt.id).length})`}
            />
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memories…"
          aria-label="Search memories"
          style={{
            flex: 1,
            minWidth: '160px',
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '12px',
          }}
        />
      </div>

      {/* Memory list / states */}
      {memError && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            background: 'var(--bg-card)',
            color: 'var(--text-muted)',
            fontSize: '12px',
          }}
        >
          Could not load memories. The server may not yet expose this endpoint.
        </div>
      )}
      {memLoading && !memRes && !memError && (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}
        >
          Loading memories…
        </div>
      )}
      {!memLoading && !memError && (
        <MemoryList
          slug={slug}
          memories={filteredMemories}
          onMutated={refresh}
        />
      )}

      {/* Manual add form */}
      <AddMemoryForm slug={slug} onCreated={refresh} />
    </div>
  )
}

function AddMemoryForm({
  slug,
  onCreated,
}: {
  slug: string
  onCreated: () => void
}) {
  const [kind, setKind] =
    useState<WorkProfileMemoryKind>('learned_pattern')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = body.trim()
      if (!trimmed) return
      setSubmitting(true)
      setError(null)
      setWarnings([])
      try {
        const res = await workProfilesApi.memory.create(slug, {
          kind,
          body_md: trimmed,
          source: 'manual',
        })
        setBody('')
        setWarnings(res.sanitizer_warnings ?? [])
        onCreated()
      } catch (err) {
        const status = (err as { status?: number }).status
        if (status === 400) {
          setError('Rejected: content flagged as unsafe (prompt injection).')
        } else {
          setError((err as Error).message || 'Create failed')
        }
      } finally {
        setSubmitting(false)
      }
    },
    [slug, kind, body, onCreated]
  )

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginTop: '8px',
        padding: '12px',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        background: 'var(--bg-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
      aria-label="Add memory manually"
    >
      <h3
        style={{
          fontSize: '13px',
          fontWeight: 600,
          margin: 0,
          color: 'var(--text-primary)',
        }}
      >
        Add memory
      </h3>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Kind
        </label>
        <select
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as WorkProfileMemoryKind)
          }
          disabled={submitting}
          style={{
            padding: '6px 8px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '12px',
          }}
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={submitting}
        placeholder="Body (Markdown supported)…"
        aria-label="Memory body"
        rows={4}
        style={{
          padding: '8px',
          borderRadius: '4px',
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '12px',
          resize: 'vertical',
        }}
      />
      {error && (
        <div
          role="alert"
          style={{ fontSize: '11px', color: 'var(--status-fail)' }}
        >
          {error}
        </div>
      )}
      {warnings.length > 0 && (
        <div
          role="status"
          style={{
            fontSize: '11px',
            color: 'var(--priority-medium, #d4a017)',
          }}
        >
          Saved with sanitizer warnings: {warnings.join('; ')}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--accent)',
            color: 'white',
            cursor:
              submitting || !body.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            opacity: submitting || !body.trim() ? 0.6 : 1,
          }}
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  )
}

function ChipButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      role="radio"
      aria-checked={active}
      style={{
        padding: '4px 10px',
        fontSize: '11px',
        borderRadius: '14px',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent)' : 'var(--bg-card)',
        color: active ? 'white' : 'var(--text-primary)',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  )
}
