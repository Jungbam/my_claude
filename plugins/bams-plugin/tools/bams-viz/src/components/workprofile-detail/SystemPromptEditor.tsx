'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { workProfilesApi } from '@/lib/workprofiles-api'
import type { WorkProfileDetail } from '@/lib/workprofiles-api'

interface SystemPromptEditorProps {
  workprofile: WorkProfileDetail
  onPatched: () => void
}

/**
 * design-fe.md §5-4 — System Prompt 편집기.
 *
 *   - textarea + Markdown 프리뷰 토글 (marked + DOMPurify — 신규 의존성 0).
 *   - 프리셋 (is_preset=true)는 read-only + fork 안내 배너.
 *   - 클라이언트 사전 스캔 SUSPECT_PATTERNS: 저장 전 injection 의심 문자열 경고.
 *   - 서버 응답 sanitizer_warnings 배열은 저장 후 인라인 배너로 표시.
 *   - 저장/취소는 SaveDiscardBar 인라인.
 */

// design-fe.md §5-4 SUSPECT_PATTERNS (서버 §7-2 서브셋)
const SUSPECT_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(your\s+)?system\s+prompt/i,
  /role\s*:\s*"?system"?/i,
  /<\|(im_start|im_end|system|assistant)\|>/i,
]

function detectClientSideInjection(text: string): string[] {
  const hits: string[] = []
  for (const rx of SUSPECT_PATTERNS) {
    if (rx.test(text)) {
      hits.push(rx.source)
    }
  }
  return hits
}

export function SystemPromptEditor({
  workprofile,
  onPatched,
}: SystemPromptEditorProps) {
  const original = workprofile.system_prompt_md ?? ''
  const [draft, setDraft] = useState(original)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverWarnings, setServerWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dismissedClientWarning, setDismissedClientWarning] = useState(false)

  const isPreset = workprofile.is_preset === true
  const isDirty = draft !== original

  // WorkProfile 전환 시 draft 재초기화
  useEffect(() => {
    setDraft(original)
    setServerWarnings([])
    setError(null)
    setDismissedClientWarning(false)
  }, [workprofile.slug, original])

  const clientHits = useMemo(() => detectClientSideInjection(draft), [draft])

  const previewHtml = useMemo(() => {
    if (!preview) return ''
    try {
      // marked v17: parse는 async 가능 — 동기 async: false 사용
      const raw = marked.parse(draft, { async: false }) as string
      return DOMPurify.sanitize(raw)
    } catch {
      return '<pre>Preview render failed</pre>'
    }
  }, [preview, draft])

  const handleSave = useCallback(async () => {
    if (isPreset) return
    if (clientHits.length > 0 && !dismissedClientWarning) {
      // 클라이언트 감지 시 dismiss 후에만 저장 진행
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await workProfilesApi.patch(workprofile.slug, {
        system_prompt_md: draft,
      })
      setServerWarnings(res.sanitizer_warnings ?? [])
      onPatched()
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 400) {
        setError(
          'Server rejected the update (prompt injection hard-block). Please revise and try again.'
        )
      } else {
        setError((err as Error).message || 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }, [
    isPreset,
    clientHits.length,
    dismissedClientWarning,
    workprofile.slug,
    draft,
    onPatched,
  ])

  const handleDiscard = useCallback(() => {
    setDraft(original)
    setServerWarnings([])
    setError(null)
    setDismissedClientWarning(false)
  }, [original])

  return (
    <div
      id="workprofile-panel-system-prompt"
      role="tabpanel"
      aria-labelledby="workprofile-tab-system-prompt"
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      {isPreset && (
        <div
          role="status"
          style={{
            padding: '10px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            fontSize: '12px',
          }}
        >
          This is a preset Stack Profile (read-only). Fork it to a custom
          profile to make edits.
        </div>
      )}

      {clientHits.length > 0 && !dismissedClientWarning && (
        <PromptInjectionWarning
          patterns={clientHits}
          onDismiss={() => setDismissedClientWarning(true)}
        />
      )}

      {serverWarnings.length > 0 && (
        <ServerSanitizerBanner warnings={serverWarnings} />
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            borderRadius: '6px',
            border: '1px solid var(--status-fail)',
            background: 'var(--bg-card)',
            color: 'var(--status-fail)',
            fontSize: '12px',
          }}
        >
          {error}
        </div>
      )}

      {/* Preview toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          {draft.length} chars {isDirty && '(unsaved)'}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <ToggleButton
            active={!preview}
            onClick={() => setPreview(false)}
            label="Edit"
          />
          <ToggleButton
            active={preview}
            onClick={() => setPreview(true)}
            label="Preview"
          />
        </div>
      </div>

      {/* Editor / Preview */}
      {preview ? (
        <div
          className="markdown-preview"
          style={{
            minHeight: '400px',
            padding: '16px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            lineHeight: 1.6,
            overflowY: 'auto',
            maxHeight: '600px',
          }}
          dangerouslySetInnerHTML={{ __html: previewHtml || '<em>(empty)</em>' }}
        />
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isPreset || saving}
          aria-label="System prompt (Markdown)"
          aria-describedby="system-prompt-help"
          spellCheck={false}
          style={{
            minHeight: '400px',
            width: '100%',
            padding: '12px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '12px',
            lineHeight: 1.6,
            resize: 'vertical',
          }}
        />
      )}
      <div
        id="system-prompt-help"
        style={{ fontSize: '11px', color: 'var(--text-muted)' }}
      >
        Markdown supported. Injected into every agent via
        <code style={{ margin: '0 4px' }}>--append-system-prompt</code>
        during execution.
      </div>

      {/* Save / Discard bar */}
      {!isPreset && isDirty && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-light)',
          }}
        >
          <button
            onClick={handleDiscard}
            disabled={saving}
            style={secondaryButtonStyle}
          >
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={
              saving ||
              (clientHits.length > 0 && !dismissedClientWarning)
            }
            style={{
              ...primaryButtonStyle,
              opacity:
                saving ||
                (clientHits.length > 0 && !dismissedClientWarning)
                  ? 0.6
                  : 1,
              cursor:
                saving ||
                (clientHits.length > 0 && !dismissedClientWarning)
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── inline subcomponents ──────────────────────────────────────────────────

function PromptInjectionWarning({
  patterns,
  onDismiss,
}: {
  patterns: string[]
  onDismiss: () => void
}) {
  return (
    <div
      role="alert"
      style={{
        padding: '10px 12px',
        borderRadius: '6px',
        border: '1px solid var(--priority-medium, #d4a017)',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        fontSize: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <strong>Prompt injection suspected</strong>
      <div>
        The draft matches {patterns.length} suspect pattern
        {patterns.length === 1 ? '' : 's'}. If this text is intentional,
        acknowledge to proceed with save.
      </div>
      <ul style={{ margin: 0, paddingLeft: '18px', fontFamily: 'monospace' }}>
        {patterns.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      <div>
        <button onClick={onDismiss} style={secondaryButtonStyle}>
          I know — allow save
        </button>
      </div>
    </div>
  )
}

function ServerSanitizerBanner({ warnings }: { warnings: string[] }) {
  return (
    <div
      role="status"
      style={{
        padding: '10px 12px',
        borderRadius: '6px',
        border: '1px solid var(--priority-medium, #d4a017)',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        fontSize: '12px',
      }}
    >
      <strong>Saved with warnings:</strong>
      <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px' }}>
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  )
}

function ToggleButton({
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
      aria-pressed={active}
      style={{
        padding: '4px 10px',
        fontSize: '11px',
        borderRadius: '4px',
        border: '1px solid var(--border)',
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

const primaryButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: '12px',
  borderRadius: '6px',
  border: 'none',
  background: 'var(--accent)',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 600,
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: '12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
}
