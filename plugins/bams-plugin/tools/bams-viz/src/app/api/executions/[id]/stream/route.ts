import { BAMS_SERVER } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/**
 * GET /api/executions/:id/stream — SSE 패스스루 프록시 (design-fe §4-3 / design-be §F-P6).
 *
 * bams-server의 `text/event-stream` ReadableStream을 그대로 클라이언트로 pipe한다.
 * NF-SEC-1: localhost bind + CORS 정책을 서버 프록시 경유로 준수.
 *
 * `?last-event-id=<id>` 쿼리 지원 — useExecutionStream 재연결 시 Chromium 자동 헤더
 * 대신 명시적 쿼리 파라미터로 전달 (design-fe §4-3).
 *
 * 반드시 Node runtime (Edge에서 SSE keepalive/backpressure 신뢰도 낮음) + force-dynamic
 * (Next 빌드 시 사전 렌더링 금지).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const route = 'executions/id/stream:GET'
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)
  const inbound = new URL(request.url)
  const qs = inbound.searchParams.toString()

  try {
    const upstreamRes = await fetch(
      `${BAMS_SERVER}/api/executions/${encodeURIComponent(id)}/stream${qs ? `?${qs}` : ''}`,
      {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          // 브라우저가 자동 헤더로 last-event-id를 보내는 경우도 서버에 그대로 전달.
          ...(request.headers.get('last-event-id')
            ? { 'Last-Event-ID': request.headers.get('last-event-id') as string }
            : {}),
        },
        // 클라이언트 abort 시 upstream fetch도 함께 취소되도록 signal 연결.
        signal: request.signal,
        // Next/Node fetch는 기본으로 request body를 stream으로 소비하지 않지만
        // GET SSE라 body 무관. cache는 명시적 no-store.
        cache: 'no-store',
      },
    )
    if (!upstreamRes.ok || !upstreamRes.body) {
      return errorResponse(
        upstreamRes.status || 502,
        upstreamRes.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
        `bams-server SSE ${upstreamRes.status} for ${id}`,
        { route },
      )
    }
    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // nginx/CDN 사이 buffering 방어
        'X-Accel-Buffering': 'no',
        // Same-origin이므로 CORS 명시 불필요 (기본).
      },
    })
  } catch (error) {
    // 클라이언트가 EventSource.close() 하면 AbortError 발생 — 정상 종료.
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'ResponseAborted')) {
      return new Response(null, { status: 499 })
    }
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
