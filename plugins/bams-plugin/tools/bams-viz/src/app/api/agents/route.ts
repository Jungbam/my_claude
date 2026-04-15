import { NextRequest } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET(request: NextRequest) {
  const route = 'agents'
  const date = request.nextUrl.searchParams.get('date') ?? undefined
  const pipeline = request.nextUrl.searchParams.get('pipeline') ?? undefined
  const workUnit = request.nextUrl.searchParams.get('work_unit') ?? undefined

  try {
    const qs = new URLSearchParams()
    if (date) qs.set('date', date)
    if (pipeline) qs.set('pipeline', pipeline)
    if (workUnit) qs.set('work_unit', workUnit)
    const query = qs.toString() ? `?${qs.toString()}` : ''

    const res = await fetch(`${BAMS_SERVER}/api/agents/data${query}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('api') },
      })
    }
    // M-1: upstream 에러를 빈 stats/calls fallback으로 가리지 않는다.
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status} for agents/data`,
      { route }
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
