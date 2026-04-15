'use client'

import { RetroJournalSection } from '@/components/hr/RetroJournalSection'

export function HRTab() {
  return (
    <div style={{ padding: '16px 20px' }}>
      <RetroJournalSection selectedRetroSlug={null} />
    </div>
  )
}
