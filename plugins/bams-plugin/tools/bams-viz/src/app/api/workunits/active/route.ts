import { NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'

export async function GET() {
  try {
    const res = await fetch(`${BAMS_SERVER}/api/workunits/active`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers() },
      })
    }
    return NextResponse.json({ workunits: [] }, { headers: headers('error') })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: headers('error') })
  }
}
