import { describe, test, expect } from 'bun:test'
import { parseAgentMetrics, parseKPT } from '../src/lib/retro-to-hr'
import { ALL_AGENTS } from '../src/lib/agents-config'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ─────────────────────────────────────────────────────────────
// DEPT_MAP 8부서 체계 일치 검증
// ─────────────────────────────────────────────────────────────

/**
 * retro-to-hr.ts 내 DEPT_MAP은 export되지 않으므로
 * ALL_AGENTS (agents-config.ts)와 교차 검증한다.
 * ALL_AGENTS가 8부서 체계를 표현하고 있으므로 이를 기준으로 검증한다.
 */

const EXPECTED_DEPARTMENTS = new Set([
  'management',
  'planning',
  'engineering-frontend',
  'engineering-backend',
  'engineering-platform',
  'design',
  'evaluation',
  'qa',
])

describe('ALL_AGENTS — 8부서 체계 일치 확인', () => {
  test('ALL_AGENTS의 모든 department 값이 8부서 체계 내에 있다', () => {
    for (const agent of ALL_AGENTS) {
      expect(EXPECTED_DEPARTMENTS.has(agent.department)).toBe(true)
    }
  })

  test('8부서 모두 ALL_AGENTS에 최소 1개 이상 에이전트가 배정되어 있다', () => {
    const usedDepts = new Set(ALL_AGENTS.map(a => a.department))
    for (const dept of EXPECTED_DEPARTMENTS) {
      expect(usedDepts.has(dept)).toBe(true)
    }
  })

  test('ALL_AGENTS에 중복 agentType이 없다', () => {
    const seen = new Set<string>()
    for (const agent of ALL_AGENTS) {
      expect(seen.has(agent.agentType)).toBe(false)
      seen.add(agent.agentType)
    }
  })

  test('QA 부서에 4개 에이전트가 포함된다', () => {
    const qaAgents = ALL_AGENTS.filter(a => a.department === 'qa')
    expect(qaAgents.length).toBe(4)
    const qaSlugs = qaAgents.map(a => a.agentType)
    expect(qaSlugs).toContain('qa-strategy')
    expect(qaSlugs).toContain('automation-qa')
    expect(qaSlugs).toContain('defect-triage')
    expect(qaSlugs).toContain('release-quality-gate')
  })

  test('management 부서에 5개 에이전트가 포함된다', () => {
    const mgmtAgents = ALL_AGENTS.filter(a => a.department === 'management')
    expect(mgmtAgents.length).toBe(5)
    const mgmtSlugs = mgmtAgents.map(a => a.agentType)
    expect(mgmtSlugs).toContain('pipeline-orchestrator')
    expect(mgmtSlugs).toContain('hr-agent')
  })
})

// ─────────────────────────────────────────────────────────────
// parseAgentMetrics — 에이전트 메트릭 파싱 검증
// ─────────────────────────────────────────────────────────────

function makeTempFile(content: string, filename: string): string {
  const dir = join(tmpdir(), 'bams-retro-test-' + Date.now())
  mkdirSync(dir, { recursive: true })
  const path = join(dir, filename)
  writeFileSync(path, content, 'utf-8')
  return path
}

const AGENT_METRICS_TABLE = `
# Phase 1 에이전트 메트릭

| 에이전트 | 부서 | 호출수 | 성공률 | 재시도율(%) | 평균ms | 등급 |
|----------|------|--------|--------|------------|--------|------|
| pipeline-orchestrator | management | 10 | 90% | 5% | 3000 | A |
| qa-strategy | qa | 5 | 80% | 10% | 2000 | B |
| automation-qa | qa | 3 | 100% | 0% | 1500 | A |
`

describe('parseAgentMetrics — 기본 파싱', () => {
  test('에이전트 메트릭 테이블을 파싱하여 에이전트 목록을 반환한다', () => {
    const path = makeTempFile(AGENT_METRICS_TABLE, 'phase1-agent-metrics.md')
    const agents = parseAgentMetrics(path)
    expect(agents.length).toBeGreaterThan(0)
  })

  test('에이전트 ID가 정확히 파싱된다', () => {
    const path = makeTempFile(AGENT_METRICS_TABLE, 'phase1-agent-metrics.md')
    const agents = parseAgentMetrics(path)
    const ids = agents.map(a => a.agent_id)
    expect(ids).toContain('pipeline-orchestrator')
    expect(ids).toContain('qa-strategy')
  })

  test('department가 정확히 파싱된다', () => {
    const path = makeTempFile(AGENT_METRICS_TABLE, 'phase1-agent-metrics.md')
    const agents = parseAgentMetrics(path)
    const po = agents.find(a => a.agent_id === 'pipeline-orchestrator')
    expect(po).toBeDefined()
    expect(po!.department).toBe('management')
  })

  test('grade가 정확히 파싱된다', () => {
    const path = makeTempFile(AGENT_METRICS_TABLE, 'phase1-agent-metrics.md')
    const agents = parseAgentMetrics(path)
    const qa = agents.find(a => a.agent_id === 'qa-strategy')
    expect(qa).toBeDefined()
    expect(qa!.grade).toBe('B')
  })

  test('빈 파일이면 빈 배열을 반환한다', () => {
    const path = makeTempFile('', 'phase1-agent-metrics.md')
    const agents = parseAgentMetrics(path)
    expect(agents).toEqual([])
  })

  test('에이전트 테이블이 없는 파일이면 빈 배열을 반환한다', () => {
    const path = makeTempFile('# 제목\n\n내용만 있는 파일', 'phase1-agent-metrics.md')
    const agents = parseAgentMetrics(path)
    expect(agents).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────
// parseKPT — KPT 파일 파싱 검증
// ─────────────────────────────────────────────────────────────

const KPT_CONTENT = `
# Phase 2 KPT 종합

총 Keep: 5개 / Problem: 8개 / Try: 6개

## 4. 액션 아이템

| # | 내용 | 담당 | 기한 |
|---|------|------|------|
| 1 | agent_start emit 누락 수정 | automation-qa | 즉시 |
| 2 | 테스트 커버리지 10% 이상 달성 | qa-strategy | 1주 |
| 3 | Flaky 테스트 격리 처리 | automation-qa | 2주 |
`

describe('parseKPT — KPT 파싱', () => {
  test('Keep/Problem/Try 카운트를 파싱한다', () => {
    const path = makeTempFile(KPT_CONTENT, 'phase2-kpt-consolidated.md')
    const result = parseKPT(path)
    expect(result.keepCount).toBe(5)
    expect(result.problemCount).toBe(8)
    expect(result.tryCount).toBe(6)
  })

  test('액션 아이템 목록을 파싱한다', () => {
    const path = makeTempFile(KPT_CONTENT, 'phase2-kpt-consolidated.md')
    const result = parseKPT(path)
    expect(result.actionItems.length).toBeGreaterThan(0)
    expect(result.actionItems[0]).toContain('agent_start')
  })

  test('파일이 존재하지 않으면 기본값을 반환한다', () => {
    const result = parseKPT('/tmp/nonexistent-path-xyz/phase2.md')
    expect(result.keepCount).toBe(0)
    expect(result.problemCount).toBe(0)
    expect(result.tryCount).toBe(0)
    expect(result.actionItems).toEqual([])
  })
})
