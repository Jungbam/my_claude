import { NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/**
 * GET /api/executions — 목록 프록시 (?project=&status=&limit=).
 * bams-server GET /api/executions 그대로 통과.
 */
export async function GET(request: Request) {
  const route = 'executions:GET'
  const inbound = new URL(request.url)
  const qs = inbound.searchParams.toString()
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/executions${qs ? `?${qs}` : ''}`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: headers('bams-server') })
    }
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status}`,
      { route },
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
