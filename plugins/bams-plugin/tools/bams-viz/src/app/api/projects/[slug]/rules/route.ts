import { NextResponse } from 'next/server'
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const route = 'projects/slug/rules'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : ''
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/projects/${encodeURIComponent(slug)}/rules${qs}`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: headers('bams-server') })
    }
    return errorResponse(
      res.status === 404 ? 404 : res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status} for ${slug}/rules`,
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
  const route = 'projects/slug/rules:POST'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const body = await request.text()
    const res = await fetch(
      `${BAMS_SERVER}/api/projects/${encodeURIComponent(slug)}/rules`,
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
        headers: { 'Content-Type': 'application/json', ...headers() },
      })
    }
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server POST ${res.status} for ${slug}/rules`,
      { route },
    )
  } catch (error) {
    return errorResponse(502, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
