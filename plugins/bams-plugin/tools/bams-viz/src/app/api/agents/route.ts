import { NextRequest, NextResponse } from 'next/server'

const BAMS_SERVER = process.env.BAMS_SERVER_URL ?? 'http://localhost:3099'

function headers(source: string) {
  return { 'Access-Control-Allow-Origin': '*', 'X-Data-Source': source }
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? undefined
  const pipeline = request.nextUrl.searchParams.get('pipeline') ?? undefined
  const workUnit = request.nextUrl.searchParams.get('work_unit') ?? undefined

  try {
    const qs = new URLSearchParams()
    if (date) qs.set('date', date)
    if (pipeline) qs.set('pipeline', pipeline)
    if (workUnit) qs.set('work_unit', workUnit)
    const query = qs.toString() ? `?${qs.toString()}` : ''

    const res = await fetch(`${BAMS_SERVER}/api/agents/data${query}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('api') },
      })
    }
    // Return empty agent data shape on error
    console.error(`[agents] bams-server responded ${res.status}`)
    return NextResponse.json({
      calls: [],
      stats: [],
      collaborations: [],
      totalCalls: 0,
      totalErrors: 0,
      runningCount: 0,
    }, { headers: headers('error') })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error(`[agents] bams-server fetch failed: ${message}`)
    return NextResponse.json({ error: message }, { status: 500, headers: headers('error') })
  }
}
