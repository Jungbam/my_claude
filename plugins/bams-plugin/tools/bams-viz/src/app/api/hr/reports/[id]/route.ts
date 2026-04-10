import { NextResponse } from 'next/server'
import { BAMS_SERVER, corsHeaders } from '@/lib/server-config'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const decodedId = decodeURIComponent(id)

  try {
    const res = await fetch(`${BAMS_SERVER}/api/hr/reports/${encodeURIComponent(decodedId)}`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    return NextResponse.json(
      { error: `HR report not found: ${decodedId}` },
      { status: 404, headers: corsHeaders }
    )
  } catch {
    return NextResponse.json(
      { error: `Failed to fetch HR report: ${decodedId}` },
      { status: 500, headers: corsHeaders }
    )
  }
}
