import { NextResponse } from 'next/server'
import { buildTraces } from '@/lib/parser'
import type { PipelineEvent } from '@/lib/types'

const BAMS_SERVER = process.env.BAMS_SERVER_URL ?? 'http://localhost:3099'
const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const { traceId } = await params

  try {
    // Fetch events from bams-server for this trace
    const res = await fetch(`${BAMS_SERVER}/api/traces/${encodeURIComponent(traceId)}`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Trace not found' }, { status: 404, headers: corsHeaders })
    }
    const data = await res.json()
    const rawEvents: PipelineEvent[] = data.events ?? []

    if (rawEvents.length === 0) {
      return NextResponse.json({ error: 'Trace not found' }, { status: 404, headers: corsHeaders })
    }

    // Build traces from raw events and find the matching trace
    const traces = buildTraces(rawEvents)
    const trace = traces.find(t => t.traceId === traceId) ?? traces[0] ?? null
    if (!trace) {
      return NextResponse.json({ error: 'Trace not found' }, { status: 404, headers: corsHeaders })
    }
    return NextResponse.json(trace, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders })
  }
}
