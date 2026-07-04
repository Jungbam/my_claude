import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const route = 'projects/slug/rules/id:PATCH'
  const { slug: rawSlug, id } = await params
  const slug = safeDecodeSlug(rawSlug)
  // NF-SEC-4: id 는 서버 상 숫자여야 하지만 URL 상에서는 문자열. 서버가 재검증하므로 여기서는 pass-through.
  try {
    const body = await request.text()
    const res = await fetch(
      `${BAMS_SERVER}/api/projects/${encodeURIComponent(slug)}/rules/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      },
    )
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers() },
      })
    }
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server PATCH ${res.status} for ${slug}/rules/${id}`,
      { route },
    )
  } catch (error) {
    return errorResponse(502, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const route = 'projects/slug/rules/id:DELETE'
  const { slug: rawSlug, id } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/projects/${encodeURIComponent(slug)}/rules/${encodeURIComponent(id)}`,
      { method: 'DELETE', signal: AbortSignal.timeout(5000) },
    )
    if (res.ok || res.status === 204) {
      return new Response(res.status === 204 ? null : await res.text(), {
        status: res.status,
        headers: headers(),
      })
    }
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server DELETE ${res.status} for ${slug}/rules/${id}`,
      { route },
    )
  } catch (error) {
    return errorResponse(502, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
