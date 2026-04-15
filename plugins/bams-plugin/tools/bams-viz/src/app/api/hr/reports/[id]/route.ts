import { BAMS_SERVER, corsHeaders } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const route = 'hr/reports/id'
  const { id } = await params
  const decodedId = decodeURIComponent(id)

  try {
    const res = await fetch(`${BAMS_SERVER}/api/hr/reports/${encodeURIComponent(decodedId)}`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    // M-3: error 메시지에 decodedId를 포함시키지 않는다 (노출 최소화).
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status} for hr/reports/${decodedId}`,
      { route }
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
