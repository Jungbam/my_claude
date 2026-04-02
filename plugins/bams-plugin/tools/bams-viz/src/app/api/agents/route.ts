import { NextRequest, NextResponse } from 'next/server'
import { EventStore } from '@/lib/event-store'

const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date') ?? undefined
    const pipeline = request.nextUrl.searchParams.get('pipeline') ?? undefined
    const store = EventStore.getInstance()
    const agentData = store.getAgents(date)

    // Filter by pipeline slug if specified
    if (pipeline) {
      const pipelineCalls = agentData.calls.filter(c => c.pipelineSlug === pipeline)
      const activeAgentTypes = new Set(pipelineCalls.map(c => c.agentType))

      // Recompute stats for filtered calls
      const statsByType: Record<string, typeof agentData.stats[0]> = {}
      for (const call of pipelineCalls) {
        const t = call.agentType
        if (!statsByType[t]) {
          statsByType[t] = {
            agentType: t,
            dept: call.department || 'unknown',
            callCount: 0,
            errorCount: 0,
            totalDurationMs: 0,
            avgDurationMs: 0,
            minDurationMs: Infinity,
            maxDurationMs: 0,
            errorRate: 0,
            models: {},
          }
        }
        const s = statsByType[t]
        s.callCount++
        if (call.isError) s.errorCount++
        if (call.durationMs != null && !call.isError) {
          s.totalDurationMs += call.durationMs
          s.minDurationMs = Math.min(s.minDurationMs, call.durationMs)
          s.maxDurationMs = Math.max(s.maxDurationMs, call.durationMs)
        }
        if (call.model) s.models[call.model] = (s.models[call.model] || 0) + 1
      }
      for (const s of Object.values(statsByType)) {
        const completed = s.callCount - s.errorCount
        s.avgDurationMs = completed > 0 ? Math.round(s.totalDurationMs / completed) : 0
        if (s.minDurationMs === Infinity) s.minDurationMs = 0
        s.errorRate = s.callCount > 0 ? Math.round((s.errorCount / s.callCount) * 100) : 0
      }

      return NextResponse.json({
        calls: pipelineCalls,
        stats: Object.values(statsByType).sort((a, b) => b.callCount - a.callCount),
        collaborations: agentData.collaborations.filter(c =>
          activeAgentTypes.has(c.from) || activeAgentTypes.has(c.to)
        ),
        totalCalls: pipelineCalls.length,
        totalErrors: pipelineCalls.filter(c => c.isError).length,
        runningCount: pipelineCalls.filter(c => c.startedAt && !c.endedAt).length,
      }, { headers: corsHeaders })
    }

    return NextResponse.json(agentData, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders })
  }
}
