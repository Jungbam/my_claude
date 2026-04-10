import { NextResponse } from 'next/server'
import { parseEvents } from '@/lib/parser'

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
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)

  // Fetch raw events from bams-server and parse into Pipeline shape
  // Note: bamsApi.getPipeline() returns { slug, events, tasks, summary } which is NOT
  // the Pipeline type ({ steps, agents, status, ... }) expected by DagTab/GanttTab.
  // So we fetch raw events and use parseEvents() to produce the correct shape.
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/events/raw/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (!res.ok) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: headers('api') })
    }
    const events: unknown[] = await res.json()
    if (!events || events.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: headers('api') })
    }
    // Convert events array to NDJSON string for parseEvents()
    const ndjson = events.map((e) => JSON.stringify(e)).join('\n')
    const pipeline = parseEvents(ndjson)
    return NextResponse.json(pipeline, { headers: headers('api') })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: headers('error') })
  }
}
