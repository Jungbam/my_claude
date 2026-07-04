import { NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/**
 * GET  /api/workprofiles/:slug/memories?kind=&alive=  — 목록.
 * POST /api/workprofiles/:slug/memories               — 생성 (kind, title?, body_md, source?).
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const route = 'workprofiles/slug/memories:GET'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  const inbound = new URL(request.url)
  const qs = inbound.searchParams.toString()
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/workprofiles/${encodeURIComponent(slug)}/memories${qs ? `?${qs}` : ''}`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: headers('bams-server') })
    }
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status} for ${slug}/memories`,
      { route },
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const route = 'workprofiles/slug/memories:POST'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const body = await request.text()
    const res = await fetch(
      `${BAMS_SERVER}/api/workprofiles/${encodeURIComponent(slug)}/memories`,
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
    return errorResponse(res.status, 'UPSTREAM_ERROR', `bams-server ${res.status}`, { route })
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
