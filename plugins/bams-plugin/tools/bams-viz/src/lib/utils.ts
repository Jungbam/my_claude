export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

export function formatRelativeTime(ts: string | null | undefined): string {
  if (!ts) return '--'
  const date = new Date(ts)
  if (isNaN(date.getTime())) return '--'
  const diff = Date.now() - date.getTime()
  if (diff < 0) return 'future'
  if (diff < 1000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export function sanitizeId(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '_')
}
