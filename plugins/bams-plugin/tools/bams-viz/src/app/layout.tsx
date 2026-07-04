import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/shell/AppShell'

export const metadata: Metadata = {
  title: 'bams-viz — Agent Execution Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="dark" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
