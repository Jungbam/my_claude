import { NextResponse } from 'next/server'
import { BAMS_SERVER, corsHeaders } from '@/lib/server-config'

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
  try {
    const url = new URL(request.url)
    const requestedFile = url.searchParams.get('filename')

    // bams-server에서 HR reports 목록을 가져와서 최신 또는 요청된 항목 반환
    const res = await fetch(`${BAMS_SERVER}/api/hr/reports`, {
      signal: AbortSignal.timeout(3000),
    })

    if (res.ok) {
      const data = await res.json()
      const reports = data.reports ?? data

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
          const id = (match as Record<string, string>).id ?? (match as Record<string, string>).retro_slug ?? requestedSlug
          const detailRes = await fetch(`${BAMS_SERVER}/api/hr/reports/${encodeURIComponent(id)}`, {
            signal: AbortSignal.timeout(3000),
          })
          if (detailRes.ok) {
            const detail = await detailRes.json()
            const reportData = detail.data ?? detail
            return NextResponse.json(reportData, { headers: corsHeaders })
          }
        }
      }

      // Return the latest report
      const latest = reports[0]
      const latestId = (latest as Record<string, string>).id ?? (latest as Record<string, string>).retro_slug
      if (latestId) {
        const detailRes = await fetch(`${BAMS_SERVER}/api/hr/reports/${encodeURIComponent(latestId)}`, {
          signal: AbortSignal.timeout(3000),
        })
        if (detailRes.ok) {
          const detail = await detailRes.json()
          const reportData = detail.data ?? detail
          return NextResponse.json(reportData, { headers: corsHeaders })
        }
      }

      return NextResponse.json(latest, { headers: corsHeaders })
    }

    return NextResponse.json(EMPTY_REPORT, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders })
  }
}
