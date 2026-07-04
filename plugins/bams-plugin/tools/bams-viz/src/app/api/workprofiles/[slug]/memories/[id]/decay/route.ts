import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/**
 * POST /api/workprofiles/:slug/memories/:id/decay — soft delete (design-be §2-3).
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
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const route = 'workprofiles/slug/memories/id/decay:POST'
  const { slug: rawSlug, id: rawId } = await params
  const slug = safeDecodeSlug(rawSlug)
  const id = decodeURIComponent(rawId)
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/workprofiles/${encodeURIComponent(slug)}/memories/${encodeURIComponent(id)}/decay`,
      { method: 'POST', signal: AbortSignal.timeout(5000) },
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
      `bams-server ${res.status} for ${slug}/${id}/decay`,
      { route },
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
