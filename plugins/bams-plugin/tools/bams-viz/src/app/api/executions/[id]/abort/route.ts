import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/**
 * POST /api/executions/:id/abort — SIGTERM/SIGKILL grace 요청 프록시.
 *
 * 요청 body: `{ confirmed: true, reason? }` — spec §F-P7 안전장치. UI가 다이얼로그
 * 확인 후에만 confirmed=true를 전달.
 *
 * upstream 현재 501 NOT_IMPLEMENTED (TASK-120에서 실장). 4xx/5xx 응답을 그대로 전달.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const route = 'executions/id/abort:POST'
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)
  try {
    const body = await request.text()
    const res = await fetch(
      `${BAMS_SERVER}/api/executions/${encodeURIComponent(id)}/abort`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      },
    )
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('bams-server') },
      })
    }
    if (res.status >= 400 && res.status < 500) {
      const upstreamText = await res.text().catch(() => '')
      return new Response(upstreamText || JSON.stringify({ error: 'BAD_REQUEST' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('bams-server') },
      })
    }
    return errorResponse(
      res.status,
      'UPSTREAM_ERROR',
      `bams-server ${res.status} for ${id}`,
      { route },
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
