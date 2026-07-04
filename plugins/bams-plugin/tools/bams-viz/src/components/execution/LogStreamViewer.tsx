'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { LogLine } from '@/lib/execution-events'

/**
 * LogStreamViewer — 실행 로그 스트림 렌더러 (design-fe.md §4-4 / NF-A11Y-2 / NF-3).
 *
 * 접근성 (design-ui §6-4):
 *   - `role="log"` + aria-live="polite" + aria-atomic="false" + aria-relevant="additions"
 *     → 신규 라인만 조용히 announce.
 *   - 별도 `role="status"` sr-only 요약("N new lines, running") — 5초마다 갱신.
 *   - <pre> 컨테이너에 tabIndex=0 로 키보드 focus 이동 지원.
 *
 * 성능 (NF-3):
 *   - 로그 배열은 부모(useExecutionStream)가 이미 rAF 100ms batch flush로 스로틀.
 *     여기서는 렌더 최적화만: max 2000 lines 이미 잘려 있음. auto-scroll은
 *     follow-tail toggle. 스크롤 위로 올리면 자동 OFF, "Follow tail" CTA로 재활성.
 *
 * follow-tail 상태:
 *   - useRef로 lastScrollTopRef 저장. onScroll에서 scrollTop < scrollHeight - clientHeight - 20
 *     이면 사용자가 위로 이동 → followTail=false. Follow tail 버튼 클릭 시 재활성 + 스크롤 bottom.
 */

interface LogStreamViewerProps {
  logs: readonly LogLine[]
  /** UI 상단 배지에 표시할 문자열 (queued/running/completed/failed/…) */
  status?: string | null
  /** true면 "connecting"/"reconnecting" 라벨 표시 */
  connectionStatus?: string | null
  /** 최대 라인 수. 기본 2000. 초과 시 부모가 이미 head drop한 상태. */
  maxLines?: number
  /** 추가 스타일 */
  style?: React.CSSProperties
}

export function LogStreamViewer({
  logs,
  status,
  connectionStatus,
  maxLines = 2000,
  style,
}: LogStreamViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [followTail, setFollowTail] = useState(true)
  const [summary, setSummary] = useState<string>('')
  const lineCountRef = useRef(0)
  const summaryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // follow-tail: logs 변경 시 자동 스크롤 bottom (사용자가 위로 안 올렸을 때만)
  useEffect(() => {
    if (!followTail) return
    const el = containerRef.current
    if (!el) return
    // rAF로 렌더 커밋 이후 스크롤
    const raf = typeof window !== 'undefined' && 'requestAnimationFrame' in window
      ? window.requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight
        })
      : null
    return () => {
      if (raf != null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(raf)
      }
    }
  }, [logs, followTail])

  // status role 요약 (SR 스팸 방지 — 5초마다 갱신)
  useEffect(() => {
    lineCountRef.current = logs.length
    if (summaryTimerRef.current == null) {
      const update = () => {
        setSummary(
          `${lineCountRef.current} line${lineCountRef.current === 1 ? '' : 's'} received${
            status ? `, ${status}` : ''
          }`,
        )
      }
      update()
      summaryTimerRef.current = setInterval(update, 5000)
    }
    return () => {
      if (summaryTimerRef.current) {
        clearInterval(summaryTimerRef.current)
        summaryTimerRef.current = null
      }
    }
  }, [logs.length, status])

  const onScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    if (!atBottom && followTail) setFollowTail(false)
  }

  const rendered = useMemo(() => {
    // 방어: 부모가 clip을 안 했더라도 여기서 tail drop
    const slice = logs.length > maxLines ? logs.slice(logs.length - maxLines) : logs
    return slice.map((l) => {
      const isErr = l.stream === 'stderr'
      return (
        <div
          key={l.seq}
          style={{
            color: isErr ? 'var(--status-fail, #dc2626)' : 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {l.line || ' '}
        </div>
      )
    })
  }, [logs, maxLines])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flex: 1,
        ...style,
      }}
    >
      {/* 상단 툴바 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderBottom: '1px solid var(--border-light, var(--border))',
          background: 'var(--bg-secondary)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span>Log stream</span>
          {status && (
            <span
              style={{
                padding: '1px 6px',
                borderRadius: '4px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                fontFamily: 'monospace',
              }}
            >
              {status}
            </span>
          )}
          {connectionStatus && connectionStatus !== 'connected' && (
            <span style={{ color: 'var(--priority-medium, #d97706)' }}>
              · {connectionStatus}
            </span>
          )}
          <span style={{ opacity: 0.7 }}>
            · {logs.length} line{logs.length === 1 ? '' : 's'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setFollowTail(true)
            const el = containerRef.current
            if (el) el.scrollTop = el.scrollHeight
          }}
          aria-pressed={followTail}
          disabled={followTail}
          style={{
            padding: '2px 8px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: followTail ? 'var(--accent)' : 'var(--bg-card)',
            color: followTail ? '#fff' : 'var(--text-primary)',
            fontSize: '10px',
            cursor: followTail ? 'default' : 'pointer',
            fontWeight: 600,
          }}
        >
          {followTail ? 'Following' : 'Follow tail'}
        </button>
      </div>

      {/* 로그 컨테이너 (role=log + aria-live=polite) */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions"
        aria-label="Execution log stream"
        tabIndex={0}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '8px 10px',
          background: 'var(--bg-primary, #000)',
          color: 'var(--text-primary, #fff)',
          fontFamily: 'monospace',
          fontSize: '11px',
          lineHeight: 1.5,
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
            Waiting for output…
          </div>
        ) : (
          rendered
        )}
      </div>

      {/* SR 전용 요약 (스팸 방지) */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {summary}
      </div>
    </div>
  )
}
