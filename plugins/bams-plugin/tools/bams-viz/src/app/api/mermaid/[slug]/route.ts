import { NextResponse } from 'next/server'
import { parseEvents } from '@/lib/parser'
import { generateFlowchart, generateGantt } from '@/lib/mermaid-gen'
import { BAMS_SERVER, corsHeaders } from '@/lib/server-config'
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
  const route = 'mermaid/slug'
  try {
    const { slug: rawSlug } = await params
    const slug = safeDecodeSlug(rawSlug)

    // Fetch raw events from bams-server
    const res = await fetch(
      `${BAMS_SERVER}/api/events/raw/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (!res.ok) {
      return errorResponse(
        res.status,
        res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
        `bams-server ${res.status} for mermaid ${slug}`,
        { route }
      )
    }
    const events: unknown[] = await res.json()
    if (!events || events.length === 0) {
      return errorResponse(404, 'NOT_FOUND', `no events for ${slug}`, { route })
    }

    // Parse events into Pipeline structure and generate mermaid
    const ndjson = events.map((e) => JSON.stringify(e)).join('\n')
    const pipeline = parseEvents(ndjson)
    return NextResponse.json({
      flowchart: generateFlowchart(pipeline),
      gantt: generateGantt(pipeline),
    }, { headers: corsHeaders })
  } catch (error) {
    return errorResponse(500, 'INTERNAL_ERROR', toInternalMessage(error), { route })
  }
}
