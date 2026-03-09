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
