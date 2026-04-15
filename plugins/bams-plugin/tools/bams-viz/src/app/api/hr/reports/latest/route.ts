import { NextResponse } from 'next/server'
import { BAMS_SERVER, corsHeaders } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

const EMPTY_REPORT = {
  report_date: null,
  source: 'weekly' as const,
  period: { start: null, end: null },
  summary: {
    total_pipelines: 0,
    total_invocations: 0,
    overall_success_rate: 0,
  },
  departments: [],
  agents: [],
  alerts: [],
  recommendations: [],
}

export async function GET(request: Request) {
  const route = 'hr/reports/latest'
  try {
    const url = new URL(request.url)
    const requestedFile = url.searchParams.get('filename')

    // bams-server에서 HR reports 목록을 가져와서 최신 또는 요청된 항목 반환
    const res = await fetch(`${BAMS_SERVER}/api/hr/reports`, {
      signal: AbortSignal.timeout(3000),
    })

    if (!res.ok) {
      // M-1: upstream 실패를 EMPTY_REPORT + 200으로 마스킹하지 않는다.
      return errorResponse(
        res.status,
        res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
        `bams-server ${res.status} for hr/reports (latest)`,
        { route }
      )
    }

    const data = await res.json()
    const reports = data.reports ?? data

    // 리포트가 존재하지 않는 것은 도메인상 정상 상태 → EMPTY_REPORT 반환.
    if (!Array.isArray(reports) || reports.length === 0) {
      return NextResponse.json(EMPTY_REPORT, { headers: corsHeaders })
    }

    // If a specific filename/slug is requested, find it
    if (requestedFile) {
      const slugMatch = requestedFile.match(/^retro-report-(.+)-\d{4}-\d{2}-\d{2}\.json$/)
      const requestedSlug = slugMatch ? slugMatch[1] : requestedFile

      const match = reports.find((r: Record<string, unknown>) =>
        r.retro_slug === requestedSlug || r.filename === requestedFile
      )

      if (match) {
        // Fetch detail for this report
        const id =
          (match as Record<string, string>).id ??
          (match as Record<string, string>).retro_slug ??
          requestedSlug
        const detailRes = await fetch(
          `${BAMS_SERVER}/api/hr/reports/${encodeURIComponent(id)}`,
          { signal: AbortSignal.timeout(3000) }
        )
        if (detailRes.ok) {
          const detail = await detailRes.json()
          const reportData = detail.data ?? detail
          return NextResponse.json(reportData, { headers: corsHeaders })
        }
      }
    }

    // Return the latest report
    const latest = reports[0]
    const latestId =
      (latest as Record<string, string>).id ?? (latest as Record<string, string>).retro_slug
    if (latestId) {
      const detailRes = await fetch(
        `${BAMS_SERVER}/api/hr/reports/${encodeURIComponent(latestId)}`,
        { signal: AbortSignal.timeout(3000) }
      )
      if (detailRes.ok) {
        const detail = await detailRes.json()
        const reportData = detail.data ?? detail
        return NextResponse.json(reportData, { headers: corsHeaders })
      }
    }

    return NextResponse.json(latest, { headers: corsHeaders })
  } catch (error) {
    return errorResponse(500, 'INTERNAL_ERROR', toInternalMessage(error), { route })
  }
}
