/** Bubble scatter icon: 3 overlapping circles */
export function BubbleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ verticalAlign: 'middle' }}>
      <circle cx="5" cy="9" r="4.5" opacity="0.5" />
      <circle cx="10" cy="6" r="3.5" opacity="0.6" />
      <circle cx="12" cy="11" r="2.5" opacity="0.7" />
    </svg>
  )
}

/** Recovery icon: upward trend line with dashed baseline */
export function RecoveryIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" style={{ verticalAlign: 'middle' }}>
      <line x1="1" y1="6" x2="15" y2="6" strokeWidth="1" strokeDasharray="2 2" opacity="0.4" />
      <polyline points="2,13 5,11 8,9 11,5 14,3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5" cy="11" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="8" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14" cy="3" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}
