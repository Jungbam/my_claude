import { NextResponse } from 'next/server'
import { BAMS_SERVER, corsHeaders } from '@/lib/server-config'

export async function GET() {
  try {
    const res = await fetch(`${BAMS_SERVER}/api/agents/dates`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    return NextResponse.json([], { headers: corsHeaders })
  } catch {
    return NextResponse.json([], { headers: corsHeaders })
  }
}
