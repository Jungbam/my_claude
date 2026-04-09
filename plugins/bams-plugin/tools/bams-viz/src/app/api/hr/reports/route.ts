import { NextResponse } from 'next/server'

const BAMS_SERVER = process.env.BAMS_SERVER_URL ?? 'http://localhost:3099'
const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

export async function GET() {
  try {
    const res = await fetch(`${BAMS_SERVER}/api/hr/reports`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const data = await res.json()
      // bams-server returns { reports: [...] }, but frontend expects raw array
      const reports = data.reports ?? data
      return NextResponse.json(reports, { headers: corsHeaders })
    }
    return NextResponse.json([], { headers: corsHeaders })
  } catch {
    return NextResponse.json([], { headers: corsHeaders })
  }
}
