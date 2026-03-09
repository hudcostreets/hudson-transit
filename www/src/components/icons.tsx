import type { ColorScheme } from '../lib/colors'

/** Bubble scatter icon: varied-size circles with clear spacing */
export function BubbleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ verticalAlign: 'middle' }}>
      <circle cx="4.5" cy="10" r="4" opacity="0.45" />
      <circle cx="11" cy="5.5" r="3" opacity="0.55" />
      <circle cx="12.5" cy="12" r="2" opacity="0.7" />
    </svg>
  )
}

/** Recovery icon: line rebounding toward a dashed 100% baseline */
export function RecoveryIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" style={{ verticalAlign: 'middle' }}>
      <line x1="1" y1="4" x2="15" y2="4" strokeWidth="1" strokeDasharray="2 2" opacity="0.4" />
      <polyline points="2,12 6,9 10,6 14,4.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Crossing icon: tunnel arch + bridge span */
export function CrossingIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size * 1.5} height={size} viewBox="0 0 24 16" fill="none" stroke="currentColor" style={{ verticalAlign: 'middle' }}>
      {/* Tunnel arch */}
      <path d="M2,14 L2,8 A5,5 0 0,1 12,8 L12,14" strokeWidth="1.5" strokeLinecap="round" />
      {/* Bridge span */}
      <line x1="13" y1="7" x2="22" y2="7" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15" y1="7" x2="15" y2="14" strokeWidth="1.2" />
      <line x1="20" y1="7" x2="20" y2="14" strokeWidth="1.2" />
    </svg>
  )
}

/** Mode icon: tiny bus + train + car silhouettes */
export function ModeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size * 1.5} height={size} viewBox="0 0 24 16" fill="currentColor" style={{ verticalAlign: 'middle' }}>
      {/* Bus (left) */}
      <rect x="1" y="4" width="6" height="8" rx="1.5" opacity="0.7" />
      <circle cx="3" cy="13" r="1" />
      <circle cx="5.5" cy="13" r="1" />
      {/* Train (center) */}
      <rect x="9" y="2" width="5" height="10" rx="1.5" opacity="0.7" />
      <circle cx="10.5" cy="13" r="1" />
      <circle cx="12.5" cy="13" r="1" />
      {/* Car (right) */}
      <rect x="16.5" y="7" width="6" height="5" rx="1.5" opacity="0.7" />
      <circle cx="18" cy="13" r="1" />
      <circle cx="21" cy="13" r="1" />
    </svg>
  )
}

/** Color swatch: row of colored squares previewing a scheme's mode palette */
export function SchemeSwatch({ scheme }: { scheme: ColorScheme }) {
  const colors = Object.values(scheme.mode)
  const n = colors.length
  const sq = 8
  const gap = 2
  const w = n * sq + (n - 1) * gap
  const h = sq
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ verticalAlign: 'middle' }}>
      {colors.map((c, i) => (
        <rect key={i} x={i * (sq + gap)} y={0} width={sq} height={sq} rx={1.5} fill={c} />
      ))}
    </svg>
  )
}
