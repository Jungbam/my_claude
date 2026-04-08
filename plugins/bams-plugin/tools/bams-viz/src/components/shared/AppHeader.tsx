'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function AppHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('bams-viz-theme')
    const initial = (saved === 'light' || saved === 'dark') ? saved : 'dark'
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('bams-viz-theme', next)
      return next
    })
  }, [])

  const isHR = pathname === '/hr'

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      height: '48px',
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <button
          onClick={() => router.push('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            padding: 0,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: '15px' }}>bams-viz</span>
          <span style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            fontWeight: 500,
          }}>v3.0</span>
        </button>

        {/* Navigation */}
        <nav style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: !isHR ? 600 : 400,
              color: !isHR ? 'var(--text-primary)' : 'var(--text-muted)',
              padding: '4px 10px',
              borderRadius: '6px',
              borderBottom: !isHR ? '2px solid var(--accent, #3b82f6)' : '2px solid transparent',
            }}
          >
            Work Units
          </button>
          <button
            onClick={() => router.push('/hr')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: isHR ? 600 : 400,
              color: isHR ? 'var(--text-primary)' : 'var(--text-muted)',
              padding: '4px 10px',
              borderRadius: '6px',
              borderBottom: isHR ? '2px solid var(--accent, #3b82f6)' : '2px solid transparent',
            }}
          >
            HR
          </button>
        </nav>
      </div>

      <button
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '4px 10px',
          cursor: 'pointer',
          fontSize: '14px',
          lineHeight: 1,
          color: 'var(--text-secondary)',
        }}
      >
        {theme === 'dark' ? 'Light' : 'Dark'}
      </button>
    </header>
  )
}
