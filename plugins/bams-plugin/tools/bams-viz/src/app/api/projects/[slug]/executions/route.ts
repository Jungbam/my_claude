import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/**
 * POST /api/projects/:slug/executions — 실행 트리거 프록시 (design-fe §4-1 / design-be §F-P6).
 *
 * 응답 규약:
 *   201 → { session, status: 'queued'|'running', max_concurrent, prompt_stats? }
 *   202 → { session, status: 'pending_confirmation', max_concurrent } — uncommitted 3지 재요청 필요
 *   4xx → { error: 'CODE', detail } (upstream 그대로 전달)
 *   5xx → { error: { code, message } } (마스킹)
 *
 * 4xx는 upstream body를 그대로 전달한다: 이유는 executions.ts route가 반환하는
 * `{ error: CODE, detail }` 코드(COMMAND_NOT_ALLOWED, PROJECT_ARCHIVED, TOO_MANY_ACTIVE_SESSIONS,
 * UNSAFE_ARGUMENT 등)가 FE UX 분기에 필수(design-fe §9-3). detail은 사용자 힌트로 활용.
 * 서버 command-validator.ts는 detail에 shell metachar 위치만 노출하며 내부 stack/경로 미포함.
 * 5xx는 마스킹하여 upstream 내부 오류를 노출하지 않는다.
 */

function safeDecodeSlug(raw: string): string {
  try {
    let decoded = raw
    for (let i = 0; i < 2; i++) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
    return decoded
  } catch {
    return raw
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const route = 'projects/slug/executions:POST'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const body = await request.text()
    const res = await fetch(
      `${BAMS_SERVER}/api/projects/${encodeURIComponent(slug)}/executions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      },
    )
    if (res.ok) {
      // 201 (running) 또는 202 (pending_confirmation) — status 그대로 유지.
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('bams-server') },
      })
    }
    if (res.status >= 400 && res.status < 500) {
      // upstream 4xx — { error: CODE, detail } 그대로 전달 (FE UX 분기 필수).
      const upstreamText = await res.text().catch(() => '')
      return new Response(upstreamText || JSON.stringify({ error: 'BAD_REQUEST' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('bams-server') },
      })
    }
    return errorResponse(
      res.status,
      'UPSTREAM_ERROR',
      `bams-server ${res.status} for ${slug}`,
      { route },
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
