/**
 * runlog-methods.test.ts
 *
 * TaskDB insertRunLog / getRunLogs 메서드 테스트 (Phase 2 변경 검증)
 * - insertRunLog(): pipeline 미존재 시 auto-create 확인 (N-M1 패턴)
 * - sanitizeRunLogPayload(): 화이트리스트 필드만 저장되는지 확인 (N-M6)
 * - getRunLogs(): slug 기반 조회 확인
 *
 * 격리: in-memory SQLite (':memory:') — 파일시스템 오염 없음
 */

import { describe, test, expect } from 'bun:test'
import { TaskDB } from '../index.ts'

function createDB(): TaskDB {
  return new TaskDB(':memory:')
}

// ─────────────────────────────────────────────────────────────
// insertRunLog — pipeline auto-create
// ─────────────────────────────────────────────────────────────

describe('insertRunLog — pipeline 미존재 시 auto-create', () => {
  test('존재하지 않는 slug로 insertRunLog 호출 시 pipeline이 자동 생성된다', () => {
    const db = createDB()
    const slug = 'auto-pipe-test-001'

    // pipeline이 없는 상태에서 insertRunLog 호출
    const logId = db.insertRunLog({
      pipeline_slug: slug,
      agent_slug: 'automation-qa',
      event_type: 'agent_start',
    })

    expect(typeof logId).toBe('string')
    expect(logId.length).toBe(36) // UUID v4

    // auto-create된 pipeline이 존재하는지 확인
    const pipeline = db.getPipelineBySlug(slug)
    expect(pipeline).not.toBeNull()
    expect(pipeline!.slug).toBe(slug)
    expect(pipeline!.type).toBe('auto-created')
  })

  test('기존 pipeline이 있으면 새로 생성하지 않는다', () => {
    const db = createDB()
    const slug = 'existing-pipe-001'

    // 먼저 pipeline을 생성
    db.upsertPipeline({ slug, type: 'feature', status: 'running' })
    const before = db.getPipelineBySlug(slug)!

    // insertRunLog 호출
    db.insertRunLog({
      pipeline_slug: slug,
      agent_slug: 'qa-strategy',
      event_type: 'agent_end',
    })

    // pipeline id가 변경되지 않아야 함
    const after = db.getPipelineBySlug(slug)!
    expect(after.id).toBe(before.id)
    expect(after.type).toBe('feature') // auto-created가 아닌 원래 타입 유지
  })

  test('insertRunLog는 생성된 run_log의 UUID를 반환한다', () => {
    const db = createDB()
    const id1 = db.insertRunLog({ pipeline_slug: 'p1', agent_slug: 'qa', event_type: 'agent_start' })
    const id2 = db.insertRunLog({ pipeline_slug: 'p1', agent_slug: 'qa', event_type: 'agent_end' })

    expect(id1).not.toBe(id2) // 각각 고유한 UUID
    expect(id1.length).toBe(36)
    expect(id2.length).toBe(36)
  })
})

// ─────────────────────────────────────────────────────────────
// sanitizeRunLogPayload — 화이트리스트 동작 검증
// ─────────────────────────────────────────────────────────────

describe('insertRunLog — payload 화이트리스트 (N-M6)', () => {
  test('허용된 필드만 저장되고 허용되지 않은 필드는 제거된다', () => {
    const db = createDB()
    const slug = 'sanitize-test'

    db.insertRunLog({
      pipeline_slug: slug,
      agent_slug: 'automation-qa',
      event_type: 'agent_start',
      payload: {
        // 허용된 필드
        agent_type: 'automation-qa',
        model: 'claude-sonnet-4-6',
        description: 'test run',
        call_id: 'call-xyz',
        // 허용되지 않은 필드 (비밀, 내부 데이터 등)
        secret_key: 'should-be-removed',
        internal_data: { nested: true },
        password: '1234',
      },
    })

    const logs = db.getRunLogs(slug)
    expect(logs.length).toBe(1)

    const payload = JSON.parse(logs[0].payload!)
    // 허용 필드 포함
    expect(payload.agent_type).toBe('automation-qa')
    expect(payload.model).toBe('claude-sonnet-4-6')
    expect(payload.call_id).toBe('call-xyz')
    // 미허용 필드 제거
    expect(payload.secret_key).toBeUndefined()
    expect(payload.internal_data).toBeUndefined()
    expect(payload.password).toBeUndefined()
  })

  test('payload가 null이면 DB에 null로 저장된다', () => {
    const db = createDB()

    db.insertRunLog({
      pipeline_slug: 'null-payload',
      agent_slug: 'qa-strategy',
      event_type: 'agent_end',
      payload: null,
    })

    const logs = db.getRunLogs('null-payload')
    expect(logs.length).toBe(1)
    expect(logs[0].payload).toBeNull()
  })

  test('payload가 undefined이면 DB에 null로 저장된다', () => {
    const db = createDB()

    db.insertRunLog({
      pipeline_slug: 'undef-payload',
      agent_slug: 'qa-strategy',
      event_type: 'step_start',
      // payload 미전달
    })

    const logs = db.getRunLogs('undef-payload')
    expect(logs.length).toBe(1)
    expect(logs[0].payload).toBeNull()
  })

  test('허용 필드만 있는 payload는 온전히 저장된다', () => {
    const db = createDB()

    db.insertRunLog({
      pipeline_slug: 'all-allowed',
      agent_slug: 'automation-qa',
      event_type: 'step_end',
      payload: {
        step_number: 3,
        step_name: 'QA Phase',
        phase: 'Phase 3',
        status: 'done',
        duration_ms: 12000,
        type: 'step_end',
        pipeline_slug: 'all-allowed',
      },
    })

    const logs = db.getRunLogs('all-allowed')
    const payload = JSON.parse(logs[0].payload!)
    expect(payload.step_number).toBe(3)
    expect(payload.step_name).toBe('QA Phase')
    expect(payload.duration_ms).toBe(12000)
  })
})

// ─────────────────────────────────────────────────────────────
// getRunLogs — 조회 확인
// ─────────────────────────────────────────────────────────────

describe('getRunLogs — 조회', () => {
  test('존재하지 않는 slug 조회 시 빈 배열 반환', () => {
    const db = createDB()
    const logs = db.getRunLogs('nonexistent-slug')
    expect(logs).toEqual([])
  })

  test('여러 로그를 삽입하면 created_at ASC 순서로 반환된다', () => {
    const db = createDB()
    const slug = 'order-test'

    db.insertRunLog({ pipeline_slug: slug, agent_slug: 'a1', event_type: 'agent_start' })
    db.insertRunLog({ pipeline_slug: slug, agent_slug: 'a2', event_type: 'agent_start' })
    db.insertRunLog({ pipeline_slug: slug, agent_slug: 'a1', event_type: 'agent_end' })

    const logs = db.getRunLogs(slug)
    expect(logs.length).toBe(3)
    expect(logs[0].agent_slug).toBe('a1')
    expect(logs[1].agent_slug).toBe('a2')
    expect(logs[2].agent_slug).toBe('a1')
  })

  test('limit 파라미터가 동작한다', () => {
    const db = createDB()
    const slug = 'limit-test'

    for (let i = 0; i < 5; i++) {
      db.insertRunLog({ pipeline_slug: slug, agent_slug: `agent-${i}`, event_type: 'agent_start' })
    }

    const logs = db.getRunLogs(slug, 3)
    expect(logs.length).toBe(3)
  })

  test('agent_slug와 event_type이 정확히 저장된다', () => {
    const db = createDB()
    const slug = 'field-check'

    db.insertRunLog({
      pipeline_slug: slug,
      agent_slug: 'automation-qa',
      event_type: 'agent_end',
      run_id: 'run-abc',
    })

    const logs = db.getRunLogs(slug)
    expect(logs[0].agent_slug).toBe('automation-qa')
    expect(logs[0].event_type).toBe('agent_end')
    expect(logs[0].run_id).toBe('run-abc')
  })
})
