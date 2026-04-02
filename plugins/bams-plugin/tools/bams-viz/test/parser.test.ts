import { describe, test, expect } from 'bun:test'
import { parseEvents, parseAgentEvents, DEPT_MAP } from '../src/lib/parser'

describe('parseEvents', () => {
  test('empty content returns default pipeline', () => {
    const result = parseEvents('')
    expect(result.status).toBe('running')
    expect(result.steps).toEqual([])
    expect(result.agents).toEqual([])
  })

  test('parses pipeline_start event', () => {
    const content = JSON.stringify({
      type: 'pipeline_start',
      pipeline_slug: 'test-slug',
      pipeline_type: 'hotfix',
      ts: '2026-04-03T10:00:00Z',
    })
    const result = parseEvents(content)
    expect(result.slug).toBe('test-slug')
    expect(result.type).toBe('hotfix')
    expect(result.status).toBe('running')
    expect(result.startedAt).toBe('2026-04-03T10:00:00Z')
  })

  test('parses pipeline_start + pipeline_end', () => {
    const lines = [
      JSON.stringify({ type: 'pipeline_start', pipeline_slug: 'test', pipeline_type: 'dev', ts: '2026-04-03T10:00:00Z' }),
      JSON.stringify({ type: 'pipeline_end', pipeline_slug: 'test', status: 'completed', ts: '2026-04-03T10:05:00Z' }),
    ].join('\n')
    const result = parseEvents(lines)
    expect(result.status).toBe('completed')
  })

  test('parses step_start + step_end', () => {
    const lines = [
      JSON.stringify({ type: 'pipeline_start', pipeline_slug: 'test', pipeline_type: 'dev', ts: '2026-04-03T10:00:00Z' }),
      JSON.stringify({ type: 'step_start', step_number: 1, step_name: 'Build', phase: 'Phase 1', ts: '2026-04-03T10:00:01Z' }),
      JSON.stringify({ type: 'step_end', step_number: 1, status: 'done', duration_ms: 5000, ts: '2026-04-03T10:00:06Z' }),
    ].join('\n')
    const result = parseEvents(lines)
    expect(result.steps.length).toBe(1)
    expect(result.steps[0].name).toBe('Build')
    expect(result.steps[0].status).toBe('done')
    expect(result.steps[0].durationMs).toBe(5000)
  })

  test('parses agent_start + agent_end', () => {
    const lines = [
      JSON.stringify({ type: 'pipeline_start', pipeline_slug: 'test', pipeline_type: 'dev', ts: '2026-04-03T10:00:00Z' }),
      JSON.stringify({ type: 'agent_start', call_id: 'abc123', agent_type: 'frontend-engineering', model: 'opus', step_number: 1, ts: '2026-04-03T10:00:01Z' }),
      JSON.stringify({ type: 'agent_end', call_id: 'abc123', status: 'done', duration_ms: 10000, ts: '2026-04-03T10:00:11Z' }),
    ].join('\n')
    const result = parseEvents(lines)
    expect(result.agents.length).toBe(1)
    expect(result.agents[0].agentType).toBe('frontend-engineering')
    expect(result.agents[0].model).toBe('opus')
    expect(result.agents[0].durationMs).toBe(10000)
  })

  test('skips malformed lines', () => {
    const lines = [
      JSON.stringify({ type: 'pipeline_start', pipeline_slug: 'test', pipeline_type: 'dev', ts: '2026-04-03T10:00:00Z' }),
      'not valid json',
      '{incomplete',
      JSON.stringify({ type: 'pipeline_end', pipeline_slug: 'test', status: 'completed', ts: '2026-04-03T10:05:00Z' }),
    ].join('\n')
    const result = parseEvents(lines)
    expect(result.status).toBe('completed')
  })

  test('handles orphaned agent_end without agent_start', () => {
    const lines = [
      JSON.stringify({ type: 'pipeline_start', pipeline_slug: 'test', pipeline_type: 'dev', ts: '2026-04-03T10:00:00Z' }),
      JSON.stringify({ type: 'agent_end', call_id: 'orphan', status: 'done', duration_ms: 5000, ts: '2026-04-03T10:00:05Z' }),
    ].join('\n')
    const result = parseEvents(lines)
    // Should not crash, orphaned ends should be handled gracefully
    expect(result).toBeDefined()
  })
})

describe('parseAgentEvents', () => {
  test('empty content returns empty agent data', () => {
    const result = parseAgentEvents('')
    expect(result.calls).toEqual([])
    expect(result.totalCalls).toBe(0)
  })

  test('parses agent start+end pair', () => {
    const lines = [
      JSON.stringify({ type: 'agent_start', call_id: 'c1', agent_type: 'backend-engineering', model: 'sonnet', ts: '2026-04-03T10:00:00Z' }),
      JSON.stringify({ type: 'agent_end', call_id: 'c1', status: 'done', duration_ms: 8000, ts: '2026-04-03T10:00:08Z' }),
    ].join('\n')
    const result = parseAgentEvents(lines)
    expect(result.totalCalls).toBe(1)
    expect(result.calls[0].agentType).toBe('backend-engineering')
    expect(result.calls[0].durationMs).toBe(8000)
  })

  test('computes stats per agent type', () => {
    const lines = [
      JSON.stringify({ type: 'agent_start', call_id: 'c1', agent_type: 'qa-strategy', model: 'sonnet', ts: '2026-04-03T10:00:00Z' }),
      JSON.stringify({ type: 'agent_end', call_id: 'c1', status: 'done', duration_ms: 3000, ts: '2026-04-03T10:00:03Z' }),
      JSON.stringify({ type: 'agent_start', call_id: 'c2', agent_type: 'qa-strategy', model: 'sonnet', ts: '2026-04-03T10:00:05Z' }),
      JSON.stringify({ type: 'agent_end', call_id: 'c2', status: 'done', duration_ms: 5000, ts: '2026-04-03T10:00:10Z' }),
    ].join('\n')
    const result = parseAgentEvents(lines)
    expect(result.stats.length).toBeGreaterThan(0)
    const qaStat = result.stats.find(s => s.agentType === 'qa-strategy')
    expect(qaStat).toBeDefined()
    expect(qaStat!.callCount).toBe(2)
  })
})

describe('DEPT_MAP', () => {
  test('maps all known agent types', () => {
    expect(DEPT_MAP['frontend-engineering']).toBe('engineering')
    expect(DEPT_MAP['qa-strategy']).toBe('qa')
    expect(DEPT_MAP['product-strategy']).toBe('planning')
    expect(DEPT_MAP['product-analytics']).toBe('evaluation')
  })

  test('includes general-purpose agents', () => {
    expect(DEPT_MAP['general-purpose']).toBe('engineering')
    expect(DEPT_MAP['Explore']).toBe('engineering')
    expect(DEPT_MAP['Plan']).toBe('planning')
  })
})
