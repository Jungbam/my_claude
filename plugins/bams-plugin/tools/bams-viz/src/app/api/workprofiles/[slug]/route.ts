import { NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/**
 * GET    /api/workprofiles/:slug — 상세 (project_count 포함).
 * PATCH  /api/workprofiles/:slug — 수정 (프리셋 403).
 * DELETE /api/workprofiles/:slug — 삭제 (프리셋 403, in-use 409).
 *
 * 4xx는 upstream body 그대로 전달(403/409 등 UX 분기 필요).
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

async function passthroughOrMask(
  res: Response,
  route: string,
  slug: string,
) {
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
    `bams-server ${res.status} for ${slug}`,
    { route },
  )
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const route = 'workprofiles/slug:GET'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/workprofiles/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: headers('bams-server') })
    }
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status} for ${slug}`,
      { route },
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const route = 'workprofiles/slug:PATCH'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const body = await request.text()
    const res = await fetch(
      `${BAMS_SERVER}/api/workprofiles/${encodeURIComponent(slug)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      },
    )
    return passthroughOrMask(res, route, slug)
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const route = 'workprofiles/slug:DELETE'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/workprofiles/${encodeURIComponent(slug)}`,
      { method: 'DELETE', signal: AbortSignal.timeout(5000) },
    )
    return passthroughOrMask(res, route, slug)
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
