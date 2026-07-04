'use client'

interface AddProjectFABProps {
  onClick: () => void
}

/**
 * 우하단 고정 "+ Add Project" FAB (design-fe.md §5-1).
 * position:fixed, bottom-right, z-index Modal(1000) 미만.
 */
export function AddProjectFAB({ onClick }: AddProjectFABProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Add project"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 900,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '10px 18px',
        borderRadius: '999px',
        background: 'var(--accent)',
        color: '#fff',
        border: 'none',
        boxShadow: '0 8px 24px var(--shadow-lg)',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <span aria-hidden style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
      Add Project
    </button>
  )
}
