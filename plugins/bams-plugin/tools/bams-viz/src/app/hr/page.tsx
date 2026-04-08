'use client'

import { AppHeader } from '@/components/shared/AppHeader'
import { HRTab } from '@/components/tabs/HRTab'

export default function HRPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: 'var(--bg-secondary)',
    }}>
      <AppHeader />
      <main style={{
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
        flex: 1,
      }}>
        <HRTab />
      </main>
    </div>
  )
}
