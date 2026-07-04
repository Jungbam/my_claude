'use client'

import { Suspense } from 'react'
import { AppHeader } from '@/components/shared/AppHeader'
import { ProjectCardGrid } from '@/components/landing/ProjectCardGrid'

export default function Home() {
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
        role="main"
        style={{
          padding: '24px',
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <h1
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: '16px',
          }}
        >
          Projects
        </h1>
        <Suspense
          fallback={
            <div
              style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              Loading…
            </div>
          }
        >
          <ProjectCardGrid />
        </Suspense>
      </main>
    </div>
  )
}
