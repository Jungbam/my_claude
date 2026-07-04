'use client'

import { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react'
import { Modal } from '@/components/ui/Modal'
import { StackProfileSelector } from '@/components/ui/StackProfileSelector'
import { projectsApi } from '@/lib/projects-api'
import type { ValidatePathResponse } from '@/lib/projects-types'

interface AddProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreated?: (slug: string) => void
}

type ValidationState =
  | { state: 'idle' }
  | { state: 'invalid'; message: string }
  | { state: 'checking'; message: string }
  | { state: 'valid'; message: string }
  | { state: 'unknown'; message: string } // 서버 endpoint 미제공

/**
 * 프로젝트 등록 다이얼로그 — AC-1.
 *
 * 입력:
 *   - Repository path (필수) — 절대경로 + home dir 내부 검사
 *   - Name (선택, 미입력 시 slug로부터 자동 생성)
 *   - Stack Profile (필수 — /api/workprofiles 목록 select)
 *
 * 실시간 검증:
 *   1. 클라이언트: 절대경로 여부 즉시 체크
 *   2. 서버: 300ms debounce → GET /api/projects/validate?path=<>
 *   3. 서버 endpoint 미제공(404/네트워크 실패) → 'unknown' 상태 (저장 시도 시 응답으로 판정)
 */
export function AddProjectDialog({
  open,
  onClose,
  onCreated,
}: AddProjectDialogProps) {
  const pathInputRef = useRef<HTMLInputElement>(null)
  const pathHintId = useId()
  const nameHintId = useId()
  const stackLabelId = useId()

  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [workProfileSlug, setWorkProfileSlug] = useState('')
  const [validation, setValidation] = useState<ValidationState>({
    state: 'idle',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // 다이얼로그 열림 시 초기 focus + 상태 리셋
  useEffect(() => {
    if (open) {
      setPath('')
      setName('')
      setWorkProfileSlug('')
      setValidation({ state: 'idle' })
      setSubmitError(null)
      setSubmitting(false)
      // Modal 자체가 mount 시점에 있으므로 rAF로 focus 늦춤
      requestAnimationFrame(() => {
        pathInputRef.current?.focus()
      })
    }
  }, [open])

  // 실시간 검증 (300ms debounce)
  useEffect(() => {
    if (!open) return
    if (path.length === 0) {
      setValidation({ state: 'idle' })
      return
    }

    // 즉시 로컬 검증 (절대경로 여부)
    if (!path.startsWith('/')) {
      setValidation({
        state: 'invalid',
        message: 'Must be an absolute path (start with /)',
      })
      return
    }

    setValidation({ state: 'checking', message: 'Checking path…' })

    const handle = setTimeout(async () => {
      try {
        const res: ValidatePathResponse = await projectsApi.validate(path)
        if (res.ok) {
          setValidation({
            state: 'valid',
            message: 'Path OK. Must be inside your home directory.',
          })
        } else {
          setValidation({
            state: 'invalid',
            message: reasonToMessage(res.reason, res.suggestion),
          })
        }
      } catch {
        // Endpoint 미제공 등 — soft state
        setValidation({
          state: 'unknown',
          message:
            'Must be inside your home directory. Full validation happens on save.',
        })
      }
    }, 300)

    return () => clearTimeout(handle)
  }, [path, open])

  const derivedSlug = useMemo(() => {
    if (!path) return ''
    const parts = path.split('/').filter(Boolean)
    return (parts[parts.length - 1] ?? '').replace(/[^a-z0-9_-]/gi, '-')
  }, [path])

  const canSubmit = useMemo(() => {
    return (
      path.length > 0 &&
      validation.state !== 'invalid' &&
      validation.state !== 'checking' &&
      workProfileSlug.length > 0 &&
      !submitting
    )
  }, [path, validation.state, workProfileSlug, submitting])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!canSubmit) return
      setSubmitting(true)
      setSubmitError(null)
      const slug = derivedSlug
      try {
        const res = await projectsApi.create({
          slug,
          name: name.trim() || slug,
          repo_path: path.trim(),
          work_profile_slug: workProfileSlug,
        })
        onCreated?.(res.project.slug)
        onClose()
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : 'Failed to register project'
        )
        setSubmitting(false)
      }
    },
    [canSubmit, derivedSlug, name, path, workProfileSlug, onCreated, onClose]
  )

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title="Add Project"
      width="520px"
    >
      <form onSubmit={handleSubmit} noValidate>
        <fieldset
          disabled={submitting}
          style={{ border: 'none', padding: 0, margin: 0 }}
        >
          {/* Repository path */}
          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="add-project-path"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '4px',
              }}
            >
              Repository path <span style={{ color: 'var(--status-fail)' }}>*</span>
            </label>
            <input
              id="add-project-path"
              ref={pathInputRef}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={path}
              onChange={e => setPath(e.target.value)}
              placeholder="/Users/you/projects/my-repo"
              aria-invalid={validation.state === 'invalid'}
              aria-describedby={pathHintId}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: `1px solid ${
                  validation.state === 'invalid'
                    ? 'var(--status-fail)'
                    : 'var(--border)'
                }`,
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontFamily: 'monospace',
              }}
            />
            <div
              id={pathHintId}
              role="status"
              aria-live="polite"
              style={{
                fontSize: '11px',
                marginTop: '4px',
                color: validationColor(validation.state),
              }}
            >
              {validationMessage(validation)}
            </div>
          </div>

          {/* Name (optional) */}
          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="add-project-name"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '4px',
              }}
            >
              Display name
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontWeight: 400,
                  marginLeft: '4px',
                }}
              >
                (optional)
              </span>
            </label>
            <input
              id="add-project-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={derivedSlug || 'my-repo'}
              aria-describedby={nameHintId}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            />
            <div
              id={nameHintId}
              style={{
                fontSize: '11px',
                marginTop: '4px',
                color: 'var(--text-muted)',
              }}
            >
              Leave empty to use path basename as name.
            </div>
          </div>

          {/* Stack profile */}
          <div style={{ marginBottom: '14px' }}>
            <label
              id={stackLabelId}
              htmlFor="add-project-stack"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '4px',
              }}
            >
              Stack Profile <span style={{ color: 'var(--status-fail)' }}>*</span>
            </label>
            <StackProfileSelector
              id="add-project-stack"
              value={workProfileSlug}
              onChange={setWorkProfileSlug}
              ariaLabelledBy={stackLabelId}
            />
          </div>

          {submitError && (
            <div
              role="alert"
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'var(--error-bg)',
                color: 'var(--status-fail)',
                fontSize: '12px',
                marginBottom: '14px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              paddingTop: '4px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: canSubmit ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: canSubmit ? '#fff' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}

// ── helpers ──────────────────────────────────

function reasonToMessage(
  reason: ValidatePathResponse['reason'],
  suggestion?: string
): string {
  const suffix = suggestion ? ` (${suggestion})` : ''
  switch (reason) {
    case 'not_found':
      return `Path does not exist${suffix}`
    case 'not_git':
      return `Path is not a git repository${suffix}`
    case 'not_absolute':
      return `Must be an absolute path (start with /)${suffix}`
    case 'not_in_home':
      return `Must be inside your home directory${suffix}`
    case 'duplicate':
      return `Path is already registered${suffix}`
    default:
      return `Invalid path${suffix}`
  }
}

function validationMessage(v: ValidationState): string {
  if (v.state === 'idle') {
    return 'Must be an absolute path inside your home directory.'
  }
  return v.message
}

function validationColor(state: ValidationState['state']): string {
  switch (state) {
    case 'invalid':
      return 'var(--status-fail)'
    case 'valid':
      return 'var(--status-done)'
    case 'checking':
    case 'unknown':
      return 'var(--text-muted)'
    default:
      return 'var(--text-muted)'
  }
}
