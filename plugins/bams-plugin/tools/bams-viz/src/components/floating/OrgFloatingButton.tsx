'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { OrgModalContent } from '@/components/floating/OrgModalContent'

interface OrgFloatingButtonProps {
  /** floating button을 렌더하지 않을 페이지에서 false 전달 (기본 true) */
  enabled?: boolean
}

/**
 * 전역 floating button — 모든 viz 페이지(`/`, `/work/[slug]`, `/hr`)에 마운트되어
 * 클릭 시 조직도 모달을 연다. Modal.tsx 재사용 (수정 0건). NF6 CSS 변수만 사용.
 */
export function OrgFloatingButton({ enabled = true }: OrgFloatingButtonProps = {}) {
  const [open, setOpen] = useState<boolean>(false)
  const [hover, setHover] = useState<boolean>(false)

  if (!enabled) return null

  return (
    <>
      <button
        data-testid="org-floating-button"
        onClick={() => setOpen(true)}
        aria-label="조직도 열기"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 500,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: hover
            ? '0 6px 16px var(--shadow-lg)'
            : '0 4px 12px var(--shadow)',
          cursor: 'pointer',
          fontSize: 20,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          transform: hover ? 'translateY(-1px)' : 'translateY(0)',
          transition: 'transform 120ms ease, box-shadow 120ms ease',
        }}
      >
        <span aria-hidden="true">🏢</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="조직도" width="960px">
        <OrgModalContent />
      </Modal>
    </>
  )
}
