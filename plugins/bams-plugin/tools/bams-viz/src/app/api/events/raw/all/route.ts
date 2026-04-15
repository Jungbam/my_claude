import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET() {
  const route = 'events/raw/all'
  try {
    const res = await fetch(`${BAMS_SERVER}/api/events/raw/all`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('api') },
      })
    }
    // M-1: upstream 에러는 빈 배열 + 200으로 마스킹하지 않는다.
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server responded ${res.status}`,
      { route }
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
