import { NextResponse } from 'next/server'

const BAMS_SERVER = process.env.BAMS_SERVER_URL ?? 'http://localhost:3099'
const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const slug = url.searchParams.get('slug') || undefined

    // Fetch HR reports from bams-server, filter retro source
    const res = await fetch(`${BAMS_SERVER}/api/hr/reports`, {
      signal: AbortSignal.timeout(3000),
    })

    if (!res.ok) {
      return NextResponse.json([], { headers: corsHeaders })
    }

    const data = await res.json()
    const reports: Array<Record<string, unknown>> = data.reports ?? data

    if (!Array.isArray(reports)) {
      return NextResponse.json([], { headers: corsHeaders })
    }

    // Filter retro reports and fetch their details for retro_metadata
    const retroReports = reports.filter((r) => r.source === 'retro')
    const entries = []

    for (const r of retroReports) {
      const reportId = (r.id ?? r.retro_slug) as string | undefined
      if (!reportId) continue
      if (slug && r.retro_slug !== slug) continue

      try {
        const detailRes = await fetch(
          `${BAMS_SERVER}/api/hr/reports/${encodeURIComponent(reportId)}`,
          { signal: AbortSignal.timeout(3000) }
        )
        if (!detailRes.ok) continue
        const detail = await detailRes.json()
        const detailData = detail.data ?? detail

        if (!detailData.retro_metadata) continue

        entries.push({
          retro_slug: r.retro_slug ?? reportId,
          report_date: r.report_date ?? detail.report_date,
          period: detailData.period ?? { start: detail.period_start ?? null, end: detail.period_end ?? null },
          agent_count: (detailData.agents as unknown[])?.length ?? 0,
          alert_count: (detailData.alerts as unknown[])?.length ?? 0,
          retro_metadata: detailData.retro_metadata,
          agents: detailData.agents ?? [],
        })
      } catch {
        // skip individual failures
      }
    }

    return NextResponse.json(entries, { headers: corsHeaders })
  } catch (error) {
    console.error('[retro-journal] Unexpected error:', error)
    return NextResponse.json([], { headers: corsHeaders, status: 200 })
  }
}
