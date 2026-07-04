import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/**
 * PATCH  /api/workprofiles/:slug/memories/:id — 수정 (kind, title, body_md).
 * DELETE /api/workprofiles/:slug/memories/:id — 삭제.
 *
 * 4xx는 upstream body 전달(409 MEMORY_DECAYED 등 UX 분기).
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

async function passthroughOrMask(res: Response, route: string, key: string) {
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
  return errorResponse(res.status, 'UPSTREAM_ERROR', `bams-server ${res.status} for ${key}`, {
    route,
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const route = 'workprofiles/slug/memories/id:PATCH'
  const { slug: rawSlug, id: rawId } = await params
  const slug = safeDecodeSlug(rawSlug)
  const id = decodeURIComponent(rawId)
  try {
    const body = await request.text()
    const res = await fetch(
      `${BAMS_SERVER}/api/workprofiles/${encodeURIComponent(slug)}/memories/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      },
    )
    return passthroughOrMask(res, route, `${slug}/${id}`)
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const route = 'workprofiles/slug/memories/id:DELETE'
  const { slug: rawSlug, id: rawId } = await params
  const slug = safeDecodeSlug(rawSlug)
  const id = decodeURIComponent(rawId)
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/workprofiles/${encodeURIComponent(slug)}/memories/${encodeURIComponent(id)}`,
      { method: 'DELETE', signal: AbortSignal.timeout(5000) },
    )
    return passthroughOrMask(res, route, `${slug}/${id}`)
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
