// Tiny inline SVG badges for `/nyc` crossing labels.
//
//   SubwayBullet      — MTA-style colored disc(s) with white line letter/number
//   RoadBadge         — rounded text badge (e.g. "QBB", "5th", "LT")
//
// Built as inline <svg> components rather than data-URI helpers so we can
// compose multi-bullet groups (e.g. ④⑤) without baking everything into one
// SVG.

import type { CrossingId } from '../lib/nyc-crossings'

// Official MTA line colors (close-enough hex values from the MTA style guide).
const MTA_LINE_COLOR: Record<string, string> = {
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
  '4': '#00933C', '5': '#00933C', '6': '#00933C',
  '7': '#B933AD',
  'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
  'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
  'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
  'G': '#6CBE45',
  'J': '#996633', 'Z': '#996633',
  'L': '#A7A9AC',
}

// Lines that need dark text on the yellow disc for contrast.
const DARK_TEXT_LINES = new Set(['N', 'Q', 'R', 'W'])

function SubwayBullet({ line, size = 14 }: { line: string; size?: number }) {
  const color = MTA_LINE_COLOR[line] ?? '#666'
  const textColor = DARK_TEXT_LINES.has(line) ? '#000' : '#fff'
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ verticalAlign: 'middle' }}>
      <circle cx={10} cy={10} r={9} fill={color} />
      <text
        x={10}
        y={10}
        dy="0.36em"
        textAnchor="middle"
        fontFamily="Helvetica,Arial,sans-serif"
        fontWeight={700}
        fontSize={13}
        fill={textColor}
      >
        {line}
      </text>
    </svg>
  )
}

/** Stack of subway bullets (e.g. ④⑤ for the Joralemon tube). */
function SubwayBullets({ lines, size = 14 }: { lines: string[]; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2, verticalAlign: 'middle' }}>
      {lines.map(l => <SubwayBullet key={l} line={l} size={size} />)}
    </span>
  )
}

/** Rounded text badge for roads/bridges/tunnels/rail. */
function RoadBadge({ text, color = '#9aa', bg = '#1d1f24', textColor = '#eee', height = 14 }: {
  text: string
  color?: string
  bg?: string
  textColor?: string
  height?: number
}) {
  // Width scales with text length, but cap at a sensible max.
  const w = Math.max(height + 2, text.length * (height * 0.55) + 6)
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} style={{ verticalAlign: 'middle' }}>
      <rect
        x={0.5} y={0.5} width={w - 1} height={height - 1}
        rx={height / 4} fill={bg} stroke={color} strokeWidth={1}
      />
      <text
        x={w / 2}
        y={height / 2}
        dy="0.36em"
        textAnchor="middle"
        fontFamily="Helvetica,Arial,sans-serif"
        fontWeight={700}
        fontSize={height - 4}
        fill={textColor}
      >
        {text}
      </text>
    </svg>
  )
}

type IconSpec =
  | { kind: 'subway'; lines: string[] }
  | { kind: 'badge'; text: string; color?: string }

const ROAD_COLOR = '#E11D48'    // rose (matches Auto mode color)
const RAIL_COLOR = '#2563EB'    // blue (matches Rail mode color)

// One icon per crossing. Only the labeled crossings need an entry; missing
// IDs fall back to text-only labels.
const NYC_CROSSING_ICONS: Partial<Record<CrossingId, IconSpec>> = {
  // ── NJ ──────────────────────────────────────────────────────────────
  'nj-lincoln':  { kind: 'badge', text: 'LT', color: ROAD_COLOR },
  'nj-holland':  { kind: 'badge', text: 'HT', color: ROAD_COLOR },
  'nj-amtrak':   { kind: 'badge', text: 'Amtrak', color: RAIL_COLOR },
  'nj-path-up':  { kind: 'badge', text: 'PATH' },
  'nj-path-dn':  { kind: 'badge', text: 'PATH' },
  'nj-ferry':    { kind: 'badge', text: 'Ferry' },

  // ── Brooklyn ────────────────────────────────────────────────────────
  'bk-bb':         { kind: 'badge', text: 'BB',  color: ROAD_COLOR },
  'bk-mb':         { kind: 'badge', text: 'MB',  color: ROAD_COLOR },
  'bk-wb':         { kind: 'badge', text: 'WB',  color: ROAD_COLOR },
  'bk-battery':    { kind: 'badge', text: 'HLC', color: ROAD_COLOR },
  'bk-cranberry':  { kind: 'subway', lines: ['A', 'C'] },
  'bk-clark':      { kind: 'subway', lines: ['2', '3'] },
  'bk-joralemon':  { kind: 'subway', lines: ['4', '5'] },
  'bk-rutgers':    { kind: 'subway', lines: ['F'] },
  'bk-canarsie':   { kind: 'subway', lines: ['L'] },
  'bk-montague':   { kind: 'subway', lines: ['N', 'R'] },
  'bk-mb-bd':      { kind: 'subway', lines: ['B', 'D'] },
  'bk-mb-nq':      { kind: 'subway', lines: ['N', 'Q'] },

  // ── Queens ──────────────────────────────────────────────────────────
  'qn-queensboro': { kind: 'badge', text: 'QBB', color: ROAD_COLOR },
  'qn-qmt':        { kind: 'badge', text: 'QMT', color: ROAD_COLOR },
  'qn-steinway':   { kind: 'subway', lines: ['7'] },
  'qn-53':         { kind: 'subway', lines: ['E', 'M'] },
  'qn-63':         { kind: 'subway', lines: ['F'] },
  'qn-60':         { kind: 'subway', lines: ['N', 'Q', 'R'] },
  'qn-amtrak':     { kind: 'badge', text: 'Amtrak', color: RAIL_COLOR },
  'qn-lirr':       { kind: 'badge', text: 'LIRR', color: RAIL_COLOR },

  // ── Staten Island ───────────────────────────────────────────────────
  'si-ferry':      { kind: 'badge', text: 'Ferry' },

  // ── 60th Street subway ──────────────────────────────────────────────
  '60-sub-8av-loc':  { kind: 'subway', lines: ['A', 'B', 'C'] },
  '60-sub-8av-exp':  { kind: 'subway', lines: ['A', 'D'] },
  '60-sub-7av-loc':  { kind: 'subway', lines: ['1', '2'] },
  '60-sub-7av-exp':  { kind: 'subway', lines: ['2', '3'] },
  '60-sub-lex-loc':  { kind: 'subway', lines: ['4', '6'] },
  '60-sub-lex-exp':  { kind: 'subway', lines: ['4', '5'] },
  '60-sub-bway-loc': { kind: 'subway', lines: ['Q', 'W'] },

  // ── 60th Street rail (Metro-North + Empire Service) ─────────────────
  '60-mnr-hudson':   { kind: 'badge', text: 'MNR', color: RAIL_COLOR },
  '60-mnr-harlem':   { kind: 'badge', text: 'MNR', color: RAIL_COLOR },
  '60-mnr-newhaven': { kind: 'badge', text: 'MNR', color: RAIL_COLOR },
  '60-mnr-empire':   { kind: 'badge', text: 'Amtrak', color: RAIL_COLOR },

  // 60th-Street avenue auto/bus crossings intentionally omitted — they're
  // unambiguous from position (each ribbon sits on its avenue), so no
  // icon/label is rendered. See `labeledCrossings` filter in NycFlowMap.
}

// Crossings that should NEVER get an inline label/icon (auto/bus avenues
// across 60th — the ribbons sit on their actual avenue, so no caption needed).
export const SKIP_LABEL_CROSSINGS: ReadonlySet<CrossingId> = new Set<CrossingId>([
  '60-fdr', '60-york', '60-1av', '60-2av', '60-3av', '60-lex',
  '60-park', '60-mad', '60-5av', '60-bway', '60-cols', '60-amst',
  '60-westend', '60-wsh', '60-cpw',
])

/** Render the crossing's icon, or null if no spec is defined. */
export function CrossingIcon({ crossingId, size = 14 }: { crossingId: CrossingId; size?: number }) {
  const spec = NYC_CROSSING_ICONS[crossingId]
  if (!spec) return null
  if (spec.kind === 'subway') return <SubwayBullets lines={spec.lines} size={size} />
  return <RoadBadge text={spec.text} color={spec.color} height={size} />
}
