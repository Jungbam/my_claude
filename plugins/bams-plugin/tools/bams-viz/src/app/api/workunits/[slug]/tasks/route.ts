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

const corsHeaders = { 'Access-Control-Allow-Origin': '*' }
const BAMS_SERVER = process.env.BAMS_SERVER_URL ?? 'http://localhost:3099'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)

  try {
    const res = await fetch(`${BAMS_SERVER}/api/workunits/${encodeURIComponent(slug)}/tasks`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    return NextResponse.json({ error: 'Work unit not found' }, { status: 404, headers: corsHeaders })
  } catch {
    return NextResponse.json(
      { work_unit_slug: slug, pipelines: [], total_count: 0, summary: { backlog: 0, in_progress: 0, in_review: 0, done: 0, blocked: 0, cancelled: 0 } },
      { headers: { ...corsHeaders, 'X-Data-Source': 'fallback' } }
    )
  }
}
