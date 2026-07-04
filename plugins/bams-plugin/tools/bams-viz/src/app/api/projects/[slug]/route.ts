import { NextResponse } from 'next/server'
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
  { params }: { params: Promise<{ slug: string }> },
) {
  const route = 'projects/slug'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/projects/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: headers('bams-server') })
    }
    return errorResponse(
      res.status === 404 ? 404 : res.status,
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
  const route = 'projects/slug:PATCH'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const body = await request.text()
    const res = await fetch(
      `${BAMS_SERVER}/api/projects/${encodeURIComponent(slug)}`,
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
      `bams-server PATCH ${res.status} for ${slug}`,
      { route },
    )
  } catch (error) {
    return errorResponse(502, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const route = 'projects/slug:DELETE'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/projects/${encodeURIComponent(slug)}`,
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
      `bams-server DELETE ${res.status} for ${slug}`,
      { route },
    )
  } catch (error) {
    return errorResponse(502, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
