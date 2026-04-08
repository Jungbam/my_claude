import { NextRequest, NextResponse } from 'next/server'
import { EventStore } from '@/lib/event-store'

function headers(source: string) {
  return { 'Access-Control-Allow-Origin': '*', 'X-Data-Source': source }
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? undefined
  const pipeline = request.nextUrl.searchParams.get('pipeline') ?? undefined

  // Note: bamsApi.getAgents() returns { agents, count } which is NOT the AgentData
  // shape ({ calls, stats, collaborations, totalCalls, ... }) expected by the frontend.
  // Always use EventStore which returns the correct shape.

  // date/pipeline 필터 있거나 API 실패: EventStore (파일 기반 집계)
  try {
    const store = EventStore.getInstance()
    const agentData = store.getAgents(date)

    const workUnit = request.nextUrl.searchParams.get('work_unit') ?? undefined

    if (workUnit) {
      // WU에 연결된 pipeline slugs 조회 (2가지 소스 union)
      const wuEvents = store.getWorkUnitEvents(workUnit)
      const linkedSlugs = new Set(
        wuEvents
          .filter((e: { type: string; pipeline_slug?: string }) => e.type === 'pipeline_linked' && e.pipeline_slug)
          .map((e: { pipeline_slug?: string }) => e.pipeline_slug!)
      )

      // 소스 2: pipeline_start의 work_unit_slug 필드 (pipeline_linked 누락 케이스 보완)
      // linkedSlugs가 이미 있으면 전체 파이프라인 JSONL 스캔 불필요 — early exit
      if (linkedSlugs.size === 0) {
        const allPipelines = store.getPipelines()
        for (const p of allPipelines) {
          const rawEvents = store.getRawEvents(p.slug)
          const startEvent = rawEvents.find((e: { type: string }) => e.type === 'pipeline_start')
          if (startEvent && (startEvent as Record<string, unknown>).work_unit_slug === workUnit) {
            linkedSlugs.add(p.slug)
          }
        }
      }

      // 해당 pipelines의 agent calls만 필터
      const wuCalls = agentData.calls.filter((c) =>
        c.pipelineSlug && linkedSlugs.has(c.pipelineSlug)
      )

      // stats 재계산
      const activeAgentTypes = new Set(wuCalls.map((c) => c.agentType))
      const statsByType: Record<string, unknown> = {}
      for (const call of wuCalls as Array<{
        agentType: string; department?: string; isError: boolean;
        durationMs?: number; model?: string;
      }>) {
        const t = call.agentType
        if (!statsByType[t]) {
          statsByType[t] = {
            agentType: t, dept: call.department || 'unknown',
            callCount: 0, errorCount: 0, totalDurationMs: 0, avgDurationMs: 0,
            minDurationMs: Infinity, maxDurationMs: 0, errorRate: 0, models: {},
          }
        }
        const s = statsByType[t] as Record<string, number | Record<string, number>>
        ;(s.callCount as number)++
        if (call.isError) (s.errorCount as number)++
        if (call.durationMs != null && !call.isError) {
          (s.totalDurationMs as number) += call.durationMs
          s.minDurationMs = Math.min(s.minDurationMs as number, call.durationMs)
          s.maxDurationMs = Math.max(s.maxDurationMs as number, call.durationMs)
        }
        if (call.model) {
          const models = s.models as Record<string, number>
          models[call.model] = (models[call.model] || 0) + 1
        }
      }
      for (const s of Object.values(statsByType) as Array<Record<string, number>>) {
        const completed = s.callCount - s.errorCount
        s.avgDurationMs = completed > 0 ? Math.round(s.totalDurationMs / completed) : 0
        if (s.minDurationMs === Infinity) s.minDurationMs = 0
        s.errorRate = s.callCount > 0 ? Math.round((s.errorCount / s.callCount) * 100) : 0
      }

      return NextResponse.json({
        calls: wuCalls,
        stats: Object.values(statsByType).sort((a, b) => (b as Record<string,number>).callCount - (a as Record<string,number>).callCount),
        collaborations: agentData.collaborations.filter((c) =>
          activeAgentTypes.has(c.from) || activeAgentTypes.has(c.to)
        ),
        totalCalls: wuCalls.length,
        totalErrors: wuCalls.filter((c) => c.isError).length,
        runningCount: wuCalls.filter((c) => c.startedAt && !c.endedAt).length,
      }, { headers: headers('fallback') })
    }

    if (pipeline) {
      const pipelineCalls = agentData.calls.filter((c) => c.pipelineSlug === pipeline)
      const activeAgentTypes = new Set(pipelineCalls.map((c) => c.agentType))

      const statsByType: Record<string, unknown> = {}
      for (const call of pipelineCalls as Array<{
        agentType: string; department?: string; isError: boolean;
        durationMs?: number; model?: string;
      }>) {
        const t = call.agentType
        if (!statsByType[t]) {
          statsByType[t] = {
            agentType: t, dept: call.department || 'unknown',
            callCount: 0, errorCount: 0, totalDurationMs: 0, avgDurationMs: 0,
            minDurationMs: Infinity, maxDurationMs: 0, errorRate: 0, models: {},
          }
        }
        const s = statsByType[t] as Record<string, number | Record<string, number>>
        ;(s.callCount as number)++
        if (call.isError) (s.errorCount as number)++
        if (call.durationMs != null && !call.isError) {
          (s.totalDurationMs as number) += call.durationMs
          s.minDurationMs = Math.min(s.minDurationMs as number, call.durationMs)
          s.maxDurationMs = Math.max(s.maxDurationMs as number, call.durationMs)
        }
        if (call.model) {
          const models = s.models as Record<string, number>
          models[call.model] = (models[call.model] || 0) + 1
        }
      }
      for (const s of Object.values(statsByType) as Array<Record<string, number>>) {
        const completed = s.callCount - s.errorCount
        s.avgDurationMs = completed > 0 ? Math.round(s.totalDurationMs / completed) : 0
        if (s.minDurationMs === Infinity) s.minDurationMs = 0
        s.errorRate = s.callCount > 0 ? Math.round((s.errorCount / s.callCount) * 100) : 0
      }

      return NextResponse.json({
        calls: pipelineCalls,
        stats: Object.values(statsByType).sort((a, b) => (b as Record<string,number>).callCount - (a as Record<string,number>).callCount),
        collaborations: agentData.collaborations.filter((c) =>
          activeAgentTypes.has(c.from) || activeAgentTypes.has(c.to)
        ),
        totalCalls: pipelineCalls.length,
        totalErrors: pipelineCalls.filter((c) => c.isError).length,
        runningCount: pipelineCalls.filter((c) => c.startedAt && !c.endedAt).length,
      }, { headers: headers('fallback') })
    }

    return NextResponse.json(agentData, { headers: headers('fallback') })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: headers('error') })
  }
}
