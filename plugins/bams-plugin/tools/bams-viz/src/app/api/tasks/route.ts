import { NextRequest, NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET(request: NextRequest) {
  const route = 'tasks'
  const pipelineId = request.nextUrl.searchParams.get('pipeline_id') ?? undefined
  const status = request.nextUrl.searchParams.get('status') ?? undefined

  try {
    const qs = new URLSearchParams()
    if (pipelineId) qs.set('pipeline_id', pipelineId)
    if (status) qs.set('status', status)
    const query = qs.toString() ? `?${qs.toString()}` : ''

    const res = await fetch(`${BAMS_SERVER}/api/tasks${query}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: headers('bams-server') })
    }
    // M-3: upstream 본문 노출 금지.
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status} for tasks`,
      { route }
    )
  } catch (error) {
    return errorResponse(500, 'INTERNAL_ERROR', toInternalMessage(error), { route })
  }
}
