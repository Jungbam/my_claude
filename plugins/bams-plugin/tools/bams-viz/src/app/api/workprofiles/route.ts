import { NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/**
 * GET  /api/workprofiles — 목록 프록시.
 * POST /api/workprofiles — 생성 프록시 (name, stack_tags[], system_prompt_md?).
 */

export async function GET() {
  const route = 'workprofiles:GET'
  try {
    const res = await fetch(`${BAMS_SERVER}/api/workprofiles`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: headers('bams-server') })
    }
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status}`,
      { route },
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}

export async function POST(request: Request) {
  const route = 'workprofiles:POST'
  try {
    const body = await request.text()
    const res = await fetch(`${BAMS_SERVER}/api/workprofiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('bams-server') },
      })
    }
    if (res.status >= 400 && res.status < 500) {
      const upstreamText = await res.text().catch(() => '')
      return new Response(upstreamText || JSON.stringify({ error: 'BAD_REQUEST' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers('bams-server') },
      })
    }
    return errorResponse(res.status, 'UPSTREAM_ERROR', `bams-server ${res.status}`, { route })
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
