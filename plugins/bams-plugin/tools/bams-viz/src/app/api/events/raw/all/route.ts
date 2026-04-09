import { NextResponse } from 'next/server'

const BAMS_SERVER = process.env.BAMS_SERVER_URL ?? 'http://localhost:3099'
const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

export async function GET() {
  try {
    const res = await fetch(`${BAMS_SERVER}/api/events/raw/all`, {
      signal: AbortSignal.timeout(5000),
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
