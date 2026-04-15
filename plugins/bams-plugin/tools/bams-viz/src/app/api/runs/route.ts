/**
 * bams-viz/src/app/api/runs/route.ts
 *
 * 실시간 실행 뷰어 API 라우트
 * PRD §2.7: C2 실시간 실행 뷰어
 *
 * GET /api/runs         — 실행 목록 (bams-server에서 프록시)
 * GET /api/runs/stream  — SSE 스트리밍 (bams-server /api/events/stream 프록시)
 */

import type { NextRequest } from 'next/server'
import { BAMS_SERVER, CORS_ORIGIN } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET(req: NextRequest): Promise<Response> {
  const route = 'runs'
  const { searchParams } = new URL(req.url)
  const pipeline = searchParams.get('pipeline')
  const agent = searchParams.get('agent')
  const stream = searchParams.get('stream')

  // SSE 스트리밍 프록시
  if (stream === '1') {
    const qs = new URLSearchParams()
    if (pipeline) qs.set('pipeline', pipeline)
    if (agent) qs.set('agent', agent)

    try {
      const upstream = await fetch(
        `${BAMS_SERVER}/api/events/stream?${qs.toString()}`,
        {
          headers: { Accept: 'text/event-stream' },
          // @ts-expect-error — Next.js fetch 확장
          duplex: 'half',
        }
      )

      return new Response(upstream.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': CORS_ORIGIN,
        },
      })
    } catch (error) {
      // M-3: SSE 채널이므로 standard error envelope 대신 일반화된 event를 emit.
      //   내부 메시지는 서버 로그에만 기록하고 클라이언트에는 코드화된 문자열만 전달.
      console.error(`[${route}:stream] NETWORK_ERROR:`, toInternalMessage(error))
      const errorStream = new ReadableStream<string>({
        start(controller) {
          controller.enqueue(
            `event: error\ndata: ${JSON.stringify({
              code: 'NETWORK_ERROR',
              message: 'Upstream event stream unavailable',
            })}\n\n`
          )
          controller.close()
        },
      })
      return new Response(errorStream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
  }

  // 실행 로그 목록 프록시
  if (pipeline) {
    const limit = searchParams.get('limit') ?? '100'
    try {
      const res = await fetch(
        `${BAMS_SERVER}/api/runs/${pipeline}/logs?limit=${limit}`,
        { signal: AbortSignal.timeout(3000) }
      )
      if (res.ok) {
        const data = await res.json()
        return Response.json(data, { headers: { 'X-Data-Source': 'api' } })
      }
      // M-1: upstream 에러는 원래 status로 중계. 다만 본 라우트는 보조 fallback이 존재하므로
      //   404만 그대로 진행하고, 기타 에러는 바로 errorResponse로 종결.
      if (res.status !== 404) {
        return errorResponse(
          res.status,
          'UPSTREAM_ERROR',
          `bams-server ${res.status} for runs/${pipeline}/logs`,
          { route }
        )
      }
    } catch (error) {
      // 네트워크 실패 시 fallback(raw events) 시도
      console.error(`[${route}] primary fetch failed:`, toInternalMessage(error))
    }

    try {
      const res = await fetch(
        `${BAMS_SERVER}/api/events/raw/${encodeURIComponent(pipeline)}`,
        { signal: AbortSignal.timeout(3000) }
      )
      if (res.ok) {
        const events = await res.json()
        return Response.json(
          { logs: events, count: Array.isArray(events) ? events.length : 0 },
          { headers: { 'X-Data-Source': 'api-fallback' } }
        )
      }
      // M-1: fallback upstream도 실패 시 에러 응답 (빈 logs + 200 금지).
      return errorResponse(
        res.status,
        res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
        `bams-server fallback ${res.status} for events/raw/${pipeline}`,
        { route }
      )
    } catch (error) {
      return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
    }
  }

  // 에이전트 로그 프록시
  if (agent) {
    const limit = searchParams.get('limit') ?? '50'
    try {
      const res = await fetch(
        `${BAMS_SERVER}/api/runs/agent/${agent}/logs?limit=${limit}`,
        { signal: AbortSignal.timeout(3000) }
      )
      if (res.ok) {
        const data = await res.json()
        return Response.json(data, { headers: { 'X-Data-Source': 'api' } })
      }
      return errorResponse(
        res.status,
        res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
        `bams-server ${res.status} for runs/agent/${agent}/logs`,
        { route }
      )
    } catch (error) {
      return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
    }
  }

  return errorResponse(400, 'BAD_REQUEST', 'pipeline or agent parameter required', { route })
}
