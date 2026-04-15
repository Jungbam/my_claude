import { NextResponse } from 'next/server'
import { parseEvents } from '@/lib/parser'
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
  const route = 'events/slug'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)

  // Fetch raw events from bams-server and parse into Pipeline shape
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/events/raw/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (!res.ok) {
      // M-1: upstream status를 그대로 중계. 404 이외도 동일하게 전달.
      return errorResponse(
        res.status,
        res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
        `bams-server ${res.status} for ${slug}`,
        { route }
      )
    }
    const events: unknown[] = await res.json()
    if (!events || events.length === 0) {
      return errorResponse(404, 'NOT_FOUND', `no events for ${slug}`, { route })
    }
    // Convert events array to NDJSON string for parseEvents()
    const ndjson = events.map((e) => JSON.stringify(e)).join('\n')
    const pipeline = parseEvents(ndjson)
    return NextResponse.json(pipeline, { headers: headers('api') })
  } catch (error) {
    // M-3: error.message를 그대로 노출하지 않고 INTERNAL_ERROR로 마스킹.
    return errorResponse(500, 'INTERNAL_ERROR', toInternalMessage(error), { route })
  }
}
