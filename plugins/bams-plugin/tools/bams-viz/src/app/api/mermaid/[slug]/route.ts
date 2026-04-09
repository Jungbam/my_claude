import { NextResponse } from 'next/server'
import { parseEvents } from '@/lib/parser'
import { generateFlowchart, generateGantt } from '@/lib/mermaid-gen'

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

const BAMS_SERVER = process.env.BAMS_SERVER_URL ?? 'http://localhost:3099'
const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params
    const slug = safeDecodeSlug(rawSlug)

    // Fetch raw events from bams-server
    const res = await fetch(
      `${BAMS_SERVER}/api/events/raw/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (!res.ok) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders })
    }
    const events: unknown[] = await res.json()
    if (!events || events.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders })
    }

    // Parse events into Pipeline structure and generate mermaid
    const ndjson = events.map((e) => JSON.stringify(e)).join('\n')
    const pipeline = parseEvents(ndjson)
    return NextResponse.json({
      flowchart: generateFlowchart(pipeline),
      gantt: generateGantt(pipeline),
    }, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders })
  }
}
