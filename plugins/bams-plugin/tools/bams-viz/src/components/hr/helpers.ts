/* Shared helpers for HR components */

import { DEPT_INFO } from '@/lib/agents-config'

/** Formats a success rate (0-1) as percentage string, returns '-' for null */
export function fmtRate(rate: number | null, digits = 1): string {
  if (rate === null || rate === undefined) return '-'
  return `${(rate * 100).toFixed(digits)}%`
}

/** Returns accent color for a success rate, or muted for null */
export function rateAccent(rate: number | null): string {
  if (rate === null || rate === undefined) return 'var(--text-muted)'
  if (rate >= 0.85) return '#22c55e'
  if (rate >= 0.7) return '#eab308'
  return '#ef4444'
}

/* Grade color mapping */
const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#3b82f6',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
}

export function gradeColor(grade: string): string {
  return GRADE_COLORS[grade.toUpperCase()] ?? 'var(--text-muted)'
}

/* Trend display */
export function trendSymbol(trend: string): { symbol: string; color: string } {
  switch (trend) {
    case 'improving': return { symbol: '\u2191', color: '#22c55e' }
    case 'declining': return { symbol: '\u2193', color: '#ef4444' }
    default: return { symbol: '=', color: 'var(--text-muted)' }
  }
}

/* Department label — sourced from agents-config.ts (single source of truth) */
export function deptLabel(deptId: string): { label: string; color: string } {
  return DEPT_INFO[deptId] ?? { label: deptId, color: '#6b7280' }
}
