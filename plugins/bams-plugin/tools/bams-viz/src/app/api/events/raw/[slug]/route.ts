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
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const route = 'events/raw/slug'
  let slug = ''
  try {
    const { slug: rawSlug } = await params
    slug = safeDecodeSlug(rawSlug)
    // M-5: ?limit, ?since 파라미터를 bams-server에 pass-through.
    // 서버가 지원하지 않으면 무시되고 전체 응답이 돌아오며, 클라이언트 측에서 slice로 보정한다.
    const url = new URL(request.url)
    const qs = new URLSearchParams()
    const limit = url.searchParams.get('limit')
    const since = url.searchParams.get('since')
    if (limit) qs.set('limit', limit)
    if (since) qs.set('since', since)
    const query = qs.toString()
    const upstream = `${BAMS_SERVER}/api/events/raw/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`
    const res = await fetch(upstream, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('api') },
      })
    }
    // M-1: upstream 에러는 빈 배열 + 200으로 마스킹하지 않고 동일 status로 중계한다.
    // M-3: upstream 본문은 클라이언트에 노출하지 않는다.
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server responded ${res.status} for ${slug}`,
      { route }
    )
  } catch (error) {
    // 네트워크 실패 — 503으로 보고 (상태 불명)
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
