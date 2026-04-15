import { NextRequest, NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET(request: NextRequest) {
  const route = 'events/poll'
  const since = request.nextUrl.searchParams.get('since')
  const pipeline = request.nextUrl.searchParams.get('pipeline') ?? undefined

  if (!since) {
    // Without since, return pipeline list from bams-server (legacy behavior)
    try {
      const res = await fetch(`${BAMS_SERVER}/api/pipelines`, {
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json(
          { events: data.pipelines ?? data, serverTime: new Date().toISOString() },
          { headers: headers('api') }
        )
      }
      return errorResponse(
        res.status,
        res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
        `bams-server ${res.status} (poll list)`,
        { route }
      )
    } catch (error) {
      return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
    }
  }

  try {
    const qs = new URLSearchParams({ since })
    if (pipeline) qs.set('pipeline', pipeline)
    const res = await fetch(`${BAMS_SERVER}/api/events/poll?${qs.toString()}`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('api') },
      })
    }
    // M-1: upstream 에러를 { events: [], serverTime } + 200으로 마스킹하지 않는다.
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status} (poll since=${since})`,
      { route }
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
