import { NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/**
 * GET /api/executions/:id — 세션 상세 프록시.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const route = 'executions/id:GET'
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/executions/${encodeURIComponent(id)}`,
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
