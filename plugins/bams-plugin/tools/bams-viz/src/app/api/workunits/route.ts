import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET() {
  const route = 'workunits'
  try {
    const res = await fetch(`${BAMS_SERVER}/api/workunits`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('bams-server') },
      })
    }
    // M-1: upstream 에러를 { workunits: [] } + 200으로 마스킹하지 않는다.
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status}`,
      { route }
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
