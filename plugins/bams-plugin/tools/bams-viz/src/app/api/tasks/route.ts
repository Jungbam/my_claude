import { NextRequest, NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'

export async function GET(request: NextRequest) {
  const pipelineId = request.nextUrl.searchParams.get('pipeline_id') ?? undefined
  const status = request.nextUrl.searchParams.get('status') ?? undefined

  try {
    const qs = new URLSearchParams()
    if (pipelineId) qs.set('pipeline_id', pipelineId)
    if (status) qs.set('status', status)
    const query = qs.toString() ? `?${qs.toString()}` : ''

    const res = await fetch(`${BAMS_SERVER}/api/tasks${query}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: headers('bams-server') })
    }
    return NextResponse.json(
      { tasks: [], count: 0 },
      { status: res.status, headers: headers('error') }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: headers('error') }
    )
  }
}
