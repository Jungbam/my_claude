import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/** Defensively decode percent-encoded slug. Handles double-encoding. */
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const route = 'pipelines/slug/tasks'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/pipelines/${encodeURIComponent(slug)}/tasks`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers() },
      })
    }
    // M-1: upstream 에러를 { tasks: [], count: 0 } + 원래 status로 그대로 중계하던 패턴을
    // 공통 에러 응답으로 통일한다. 빈 응답과 실패를 분리.
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status} for tasks of ${slug}`,
      { route }
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
