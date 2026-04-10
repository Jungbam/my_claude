import { NextResponse } from 'next/server'

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

import { BAMS_SERVER, headers } from '@/lib/server-config'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params
    const slug = safeDecodeSlug(rawSlug)
    const res = await fetch(
      `${BAMS_SERVER}/api/events/raw/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('api') },
      })
    }
    console.error(`[events/raw/${slug}] bams-server responded ${res.status}`)
    return NextResponse.json([], { headers: headers('error') })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[events/raw/slug] bams-server fetch failed: ${message}`)
    return NextResponse.json([], { headers: headers('error') })
  }
}
