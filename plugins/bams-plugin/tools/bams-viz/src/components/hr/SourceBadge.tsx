export function SourceBadge({ source }: { source?: 'weekly' | 'retro' }) {
  const isRetro = source === 'retro'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: 600,
      color: '#fff',
      background: isRetro ? '#6366f1' : '#3b82f6',
      letterSpacing: '0.3px',
    }}>
      {isRetro ? '회고' : '주간'}
    </span>
  )
}
