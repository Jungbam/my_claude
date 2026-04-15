import { NextRequest, NextResponse } from 'next/server'
import { buildTraces } from '@/lib/parser'
import type { PipelineEvent } from '@/lib/types'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET(request: NextRequest) {
  const route = 'traces'
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
      // M-1: upstream 에러를 [] + 200으로 마스킹하지 않는다.
      return errorResponse(
        res.status,
        res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
        `bams-server ${res.status} for traces`,
        { route }
      )
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
    return errorResponse(500, 'INTERNAL_ERROR', toInternalMessage(error), { route })
  }
}
