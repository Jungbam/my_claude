import { NextRequest, NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET() {
  const route = 'pipelines'
  try {
    const res = await fetch(`${BAMS_SERVER}/api/pipelines`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const data = await res.json()
      // API Contract: passthrough bams-server response as { pipelines: [...] }
      // Consumers (bams-api.ts getPipelines) expect { pipelines: PipelineSummary[] }
      const pipelines = data.pipelines ?? data
      return NextResponse.json({ pipelines }, { headers: headers('api') })
    }
    // M-1: upstream 에러를 { pipelines: [] } + 200으로 마스킹하지 않는다.
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status}`,
      { route }
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}

export async function DELETE(_request: NextRequest) {
  // Pipeline deletion is not yet supported via bams-server API.
  return errorResponse(501, 'NOT_IMPLEMENTED', 'pipeline DELETE not implemented', {
    route: 'pipelines:DELETE',
  })
}
