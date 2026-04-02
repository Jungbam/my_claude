import { NextResponse } from 'next/server'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { EventStore } from '@/lib/event-store'

const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

const EMPTY_REPORT = {
  report_date: null,
  period: { start: null, end: null },
  summary: {
    total_pipelines: 0,
    total_invocations: 0,
    overall_success_rate: 0,
  },
  departments: [],
  agents: [],
  alerts: [],
  recommendations: [],
}

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
      return NextResponse.json(EMPTY_REPORT, { headers: corsHeaders })
    }

    const files = readdirSync(hrDir)
      .filter(f => f.startsWith('weekly-report-') && f.endsWith('.json'))
      .sort()
      .reverse()

    if (files.length === 0) {
      return NextResponse.json(EMPTY_REPORT, { headers: corsHeaders })
    }

    const latestFile = files[0]
    const content = readFileSync(join(hrDir, latestFile), 'utf-8')
    const data = JSON.parse(content)

    return NextResponse.json(data, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders })
  }
}
