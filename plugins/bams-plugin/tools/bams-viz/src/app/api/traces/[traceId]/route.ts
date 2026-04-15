import { NextResponse } from 'next/server'
import { buildTraces } from '@/lib/parser'
import type { PipelineEvent } from '@/lib/types'
import { BAMS_SERVER, corsHeaders } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const route = 'traces/traceId'
  const { traceId } = await params

  try {
    // Fetch events from bams-server for this trace
    const res = await fetch(`${BAMS_SERVER}/api/traces/${encodeURIComponent(traceId)}`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      return errorResponse(
        res.status,
        res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
        `bams-server ${res.status} for trace ${traceId}`,
        { route }
      )
    }
    const data = await res.json()
    const rawEvents: PipelineEvent[] = data.events ?? []

    if (rawEvents.length === 0) {
      return errorResponse(404, 'NOT_FOUND', `empty trace ${traceId}`, { route })
    }

    // Build traces from raw events and find the matching trace
    const traces = buildTraces(rawEvents)
    const trace = traces.find(t => t.traceId === traceId) ?? traces[0] ?? null
    if (!trace) {
      return errorResponse(404, 'NOT_FOUND', `no matching trace ${traceId}`, { route })
    }
    return NextResponse.json(trace, { headers: corsHeaders })
  } catch (error) {
    return errorResponse(500, 'INTERNAL_ERROR', toInternalMessage(error), { route })
  }
}
