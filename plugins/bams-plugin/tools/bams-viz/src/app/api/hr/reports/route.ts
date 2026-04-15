import { NextResponse } from 'next/server'
import { BAMS_SERVER, corsHeaders } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET() {
  const route = 'hr/reports'
  try {
    const res = await fetch(`${BAMS_SERVER}/api/hr/reports`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const data = await res.json()
      // API Contract: passthrough bams-server response as { reports: [...] }
      // Consumers (bams-api.ts getHRReports, HRTab.tsx) expect { reports: HRReportListItem[] }
      const reports = data.reports ?? data
      return NextResponse.json({ reports }, { headers: corsHeaders })
    }
    // M-1: upstream 에러를 { reports: [] } + 200으로 마스킹하지 않는다.
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status} for hr/reports`,
      { route }
    )
  } catch (error) {
    return errorResponse(503, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
