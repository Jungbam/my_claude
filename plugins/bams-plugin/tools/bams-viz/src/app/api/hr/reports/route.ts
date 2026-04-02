import { NextResponse } from 'next/server'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { EventStore } from '@/lib/event-store'

const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

function getHrDir(): string {
  const crewRoot = EventStore.findCrewRoot()
  const hrDir = join(crewRoot, 'artifacts', 'hr')
  mkdirSync(hrDir, { recursive: true })
  return hrDir
}

export async function GET() {
  try {
    const hrDir = getHrDir()
    if (!existsSync(hrDir)) {
      return NextResponse.json([], { headers: corsHeaders })
    }

    const files = readdirSync(hrDir)
      .filter(f => f.startsWith('weekly-report-') && f.endsWith('.json'))
      .sort()
      .reverse()

    const reports = files.map(f => {
      const datePart = f.replace('weekly-report-', '').replace('.json', '')
      try {
        const content = readFileSync(join(hrDir, f), 'utf-8')
        const data = JSON.parse(content)
        return {
          date: datePart,
          filename: f,
          report_date: data.report_date ?? datePart,
          period: data.period ?? null,
          summary: data.summary ?? null,
          agent_count: data.agents?.length ?? 0,
          alert_count: data.alerts?.length ?? 0,
        }
      } catch {
        return {
          date: datePart,
          filename: f,
          report_date: datePart,
          period: null,
          summary: null,
          agent_count: 0,
          alert_count: 0,
        }
      }
    })

    return NextResponse.json(reports, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders })
  }
}
