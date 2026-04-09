import { NextRequest, NextResponse } from 'next/server'
import { buildTraces } from '@/lib/parser'
import type { PipelineEvent } from '@/lib/types'

const BAMS_SERVER = process.env.BAMS_SERVER_URL ?? 'http://localhost:3099'

function headers(source: string) {
  return { 'Access-Control-Allow-Origin': '*', 'X-Data-Source': source }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const pipeline = searchParams.get('pipeline') ?? undefined
  const agent = searchParams.get('agent') ?? undefined
  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined

  try {
    // Fetch raw events from bams-server
    const qs = new URLSearchParams()
    if (pipeline) qs.set('pipeline', pipeline)
    const query = qs.toString() ? `?${qs.toString()}` : ''
    const res = await fetch(`${BAMS_SERVER}/api/traces${query}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      return NextResponse.json([], { headers: headers('error') })
    }
    const data = await res.json()
    const rawEvents: PipelineEvent[] = data.events ?? []

    // Build traces from raw events using local parser
    let traces = buildTraces(rawEvents)

    // Apply filters
    if (agent) {
      traces = traces.filter(t => t.spans.some(s => s.agentType === agent))
    }
    if (from) {
      const fromTime = new Date(from).getTime()
      traces = traces.filter(t => new Date(t.startedAt).getTime() >= fromTime)
    }
    if (to) {
      const toTime = new Date(to).getTime()
      traces = traces.filter(t => new Date(t.startedAt).getTime() <= toTime)
    }

    return NextResponse.json(
      traces.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      { headers: headers('api') }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: headers('error') })
  }
}
