import { NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/**
 * GET /api/executions/:id/logs?tail=N — ring buffer tail 프록시.
 * SSE 첫 오픈 전(또는 재연결 갭) backfill용.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const route = 'executions/id/logs:GET'
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)
  const inbound = new URL(request.url)
  const tail = inbound.searchParams.get('tail')
  const qs = tail ? `?tail=${encodeURIComponent(tail)}` : ''
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/executions/${encodeURIComponent(id)}/logs${qs}`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: headers('bams-server') })
    }
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status} for ${id}`,
      { route },
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
