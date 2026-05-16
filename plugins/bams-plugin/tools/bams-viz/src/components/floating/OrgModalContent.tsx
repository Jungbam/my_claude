'use client'

import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { DepartmentCard } from '@/components/tabs/OrgTab'

/* ------------------------------------------------------------------ */
/*  Types (OrgTab.tsx와 동일 shape — /api/org 응답)                      */
/* ------------------------------------------------------------------ */

interface OrgSkill {
  skill_id: string
  skill_name: string
  purpose: string
}

interface OrgAgent {
  agent_id: string
  agent_name: string
  role: string
  model: string
  responsibility: string
  skills: OrgSkill[]
  collaborates_with: string[]
}

interface OrgDepartment {
  department_id: string
  department_name: string
  agent_count: number
  agents: OrgAgent[]
}

interface OrgResponse {
  mermaid: string
  departments?: OrgDepartment[]
}

/* ------------------------------------------------------------------ */
/*  Module-level cache — 모달 재열림 시 fetch 0건 (NF7)                  */
/* ------------------------------------------------------------------ */

let _orgCache: OrgResponse | null = null
let _orgPromise: Promise<OrgResponse> | null = null

async function fetchOrgOnce(): Promise<OrgResponse> {
  if (_orgCache) return _orgCache
  if (_orgPromise) return _orgPromise
  _orgPromise = fetch('/api/org')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<OrgResponse>
    })
    .then((data) => {
      _orgCache = data
      return data
    })
    .finally(() => {
      _orgPromise = null
    })
  return _orgPromise
}

/* ------------------------------------------------------------------ */
/*  OrgModalContent                                                     */
/* ------------------------------------------------------------------ */

/**
 * 조직도 모달 본문. usePolling 미사용 — 1회 fetch + module-level 캐시.
 * 부서별 카드 렌더 (DepartmentCard 재사용). 부서장 강조는 ROLE_BADGE에서 자동 처리.
 */
export function OrgModalContent() {
  const [data, setData] = useState<OrgResponse | null>(_orgCache)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState<boolean>(!_orgCache)

  useEffect(() => {
    if (_orgCache) return
    fetchOrgOnce()
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e : new Error(String(e)))
        setLoading(false)
      })
  }, [])

  if (loading && !data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading org chart...
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ padding: '20px', color: 'var(--status-fail)' }}>
        Error loading org chart: {error.message}
      </div>
    )
  }
  if (!data?.departments || data.departments.length === 0) {
    return <EmptyState icon="🏢" title="No org data" description="Organization chart data is not available yet" />
  }

  // Build agentId -> { deptId, agentName } lookup for collaborator badge coloring
  const agentDeptMap = new Map<string, { deptId: string; agentName: string }>()
  for (const dept of data.departments) {
    for (const agent of dept.agents) {
      agentDeptMap.set(agent.agent_id, {
        deptId: dept.department_id,
        agentName: agent.agent_name,
      })
    }
  }

  const totalAgents = data.departments.reduce((sum, d) => sum + d.agent_count, 0)

  return (
    <div data-testid="org-modal-content">
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 16,
        }}
      >
        {data.departments.length}개 부서 · {totalAgents}명
      </div>
      {data.departments.map((dept) => (
        <DepartmentCard key={dept.department_id} dept={dept} agentDeptMap={agentDeptMap} />
      ))}
    </div>
  )
}
