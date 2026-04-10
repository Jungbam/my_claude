/* HR Report types matching the JSON schema from PRD section 3.4 */

export interface HRReportSummary {
  total_pipelines: number
  total_invocations: number
  overall_success_rate: number | null
}

export interface HRDepartment {
  department_id: string
  agent_count: number
  avg_success_rate: number | null
  total_invocations: number
}

export interface HRAgent {
  agent_id: string
  department: string
  grade: string
  invocation_count: number
  success_rate: number | null
  avg_duration_ms: number
  retry_count: number
  escalation_count: number
  trend: 'improving' | 'declining' | 'stable'
}

export interface HRReport {
  report_date: string | null
  source?: 'weekly' | 'retro'
  retro_slug?: string
  period: { start: string | null; end: string | null }
  summary: HRReportSummary
  departments: HRDepartment[]
  agents: HRAgent[]
  alerts: string[]
  recommendations: string[]
}

export interface HRReportListItem {
  date: string
  filename: string
  report_date: string
  period: { start: string; end: string } | null
  agent_count: number
  alert_count: number
  source?: 'weekly' | 'retro'
  retro_slug?: string
}
