/** Single source of truth for agent list and department metadata */

export const ALL_AGENTS: Array<{ agentType: string; department: string }> = [
  // Executive (management)
  { agentType: 'pipeline-orchestrator', department: 'management' },
  { agentType: 'cross-department-coordinator', department: 'management' },
  { agentType: 'executive-reporter', department: 'management' },
  { agentType: 'resource-optimizer', department: 'management' },
  { agentType: 'hr-agent', department: 'management' },
  // Planning
  { agentType: 'product-strategy', department: 'planning' },
  { agentType: 'business-analysis', department: 'planning' },
  { agentType: 'ux-research', department: 'planning' },
  { agentType: 'project-governance', department: 'planning' },
  // Engineering
  { agentType: 'frontend-engineering', department: 'engineering' },
  { agentType: 'backend-engineering', department: 'engineering' },
  { agentType: 'platform-devops', department: 'engineering' },
  { agentType: 'data-integration', department: 'engineering' },
  // Evaluation
  { agentType: 'product-analytics', department: 'evaluation' },
  { agentType: 'experimentation', department: 'evaluation' },
  { agentType: 'performance-evaluation', department: 'evaluation' },
  { agentType: 'business-kpi', department: 'evaluation' },
  // QA
  { agentType: 'qa-strategy', department: 'qa' },
  { agentType: 'automation-qa', department: 'qa' },
  { agentType: 'defect-triage', department: 'qa' },
  { agentType: 'release-quality-gate', department: 'qa' },
]

export const DEPT_INFO: Record<string, { color: string; label: string }> = {
  management: { color: '#ec4899', label: 'Executive' },
  planning: { color: '#3b82f6', label: 'Planning' },
  engineering: { color: '#22c55e', label: 'Engineering' },
  evaluation: { color: '#f97316', label: 'Evaluation' },
  qa: { color: '#a855f7', label: 'QA' },
}

/** Build agent-type → department mapping from ALL_AGENTS */
export const AGENT_DEPT_MAP: Record<string, string> = Object.fromEntries(
  ALL_AGENTS.map(a => [a.agentType, a.department])
)
