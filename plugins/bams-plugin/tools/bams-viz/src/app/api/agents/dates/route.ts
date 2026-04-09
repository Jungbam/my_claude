import { NextResponse } from 'next/server'

const BAMS_SERVER = process.env.BAMS_SERVER_URL ?? 'http://localhost:3099'
const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

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
