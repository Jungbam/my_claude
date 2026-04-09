import { NextRequest, NextResponse } from 'next/server'

const BAMS_SERVER = process.env.BAMS_SERVER_URL ?? 'http://localhost:3099'

function headers(source: string) {
  return { 'Access-Control-Allow-Origin': '*', 'X-Data-Source': source }
}

export async function GET(request: NextRequest) {
  const since = request.nextUrl.searchParams.get('since')
  const pipeline = request.nextUrl.searchParams.get('pipeline') ?? undefined

  if (!since) {
    // Without since, return pipeline list from bams-server
    try {
      const res = await fetch(`${BAMS_SERVER}/api/pipelines`, {
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json(
          { events: data.pipelines ?? data, serverTime: new Date().toISOString() },
          { headers: headers('api') }
        )
      }
    } catch {
      // fallback
    }
    return NextResponse.json(
      { error: 'Missing required query parameter: since (ISO timestamp)' },
      { status: 400, headers: headers('error') }
    )
  }

  try {
    const qs = new URLSearchParams({ since })
    if (pipeline) qs.set('pipeline', pipeline)
    const res = await fetch(`${BAMS_SERVER}/api/events/poll?${qs.toString()}`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('api') },
      })
    }
    return NextResponse.json(
      { events: [], serverTime: new Date().toISOString() },
      { headers: headers('error') }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: headers('error') })
  }
}
