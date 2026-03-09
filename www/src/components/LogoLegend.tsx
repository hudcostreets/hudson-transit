/** Right-side legend that replaces Plotly's built-in legend with agency logos + mode icons.
 *  Items are y-aligned to their last data point. */

// Crossing → [agency icons, mode icon] (file basenames under /icons/)
const CROSSING_ICONS: Record<string, string[]> = {
  'Lincoln (Bus)':       ['njt', 'bus'],
  'Lincoln (Autos)':     ['pa', 'car'],
  'Holland (Bus)':       ['njt', 'bus'],
  'Holland (Autos)':     ['pa', 'car'],
  'PATH (Downtown)':     ['path', 'train'],
  'PATH (Uptown)':       ['path', 'train'],
  'Amtrak / NJ Transit': ['njt', 'amtrak', 'train'],
  'Ferry':               ['nyww', 'ferry'],
}

const MODE_ICONS: Record<string, string[]> = {
  'Bus':   ['njt', 'bus'],
  'Autos': ['car'],
  'PATH':  ['path', 'train'],
  'Rail':  ['njt', 'amtrak', 'train'],
  'Ferry': ['nyww', 'ferry'],
}

// Mode icons rendered as CSS masks (theme-adaptive); agency icons as <img> (true color)
const MODE_ICON_SET = new Set(['bus', 'car', 'train', 'ferry'])

// Per-icon natural width at ICON_HEIGHT, based on SVG aspect ratios
const ICON_HEIGHT = 20
const ICON_NATURAL_WIDTHS: Record<string, number> = {
  njt:    40,   // 500x250 → 2:1
  amtrak: 36,   // 537x230 → 2.3:1, capped
  path:   28,   // 104x75 → 1.4:1
  nyww:   29,   // 200x140 → 1.4:1
  pa:     36,   // 200x96 → 2.1:1, capped
  bus:    20,   // 24x24 → 1:1
  car:    20,
  train:  20,
  ferry:  20,
}

// Uniform slot widths for alignment: all agency icons same width, all mode icons same width
const AGENCY_SLOT = 40
const MODE_SLOT = 20

export interface BubblePixel {
  x: number  // px from legend container left
  y: number  // px from legend container top
  r: number  // bubble radius in px
}

export interface LogoLegendProps {
  labels: string[]
  colorMap: Record<string, string>
  granularity: 'crossing' | 'mode'
  lastYValues: Record<string, number>
  chartHeight: number
  margin: { t: number; b: number }
  yRange: [number, number]
  bubblePixels?: Record<string, BubblePixel>
}

function IconEl({ name, height, invert }: { name: string; height: number; invert?: boolean }) {
  const natural = ICON_NATURAL_WIDTHS[name] ?? 16
  const w = natural * (height / ICON_HEIGHT)
  if (MODE_ICON_SET.has(name)) {
    return (
      <span
        className="logo-legend-icon"
        style={{
          width: w,
          height,
          maskImage: `url(/icons/${name}.svg)`,
          WebkitMaskImage: `url(/icons/${name}.svg)`,
        }}
      />
    )
  }
  return (
    <img
      className="logo-legend-icon agency"
      src={`/icons/${name}.svg`}
      alt={name}
      style={{ width: w, height, ...(invert ? { filter: 'brightness(0) invert(1)' } : {}) }}
    />
  )
}

function IconRow({ icons }: { icons: string[] }) {
  // Split into agency icons and mode icons
  const agencies = icons.filter(n => !MODE_ICON_SET.has(n))
  const modes = icons.filter(n => MODE_ICON_SET.has(n))

  return (
    <>
      {agencies.length > 1 ? (
        // Overlay: stack agencies at full size, later ones on top (inverted for visibility)
        <span className="logo-legend-icon-slot logo-legend-overlay" style={{ width: AGENCY_SLOT, height: ICON_HEIGHT }}>
          {agencies.map((name, i) => (
            <IconEl key={name} name={name} height={ICON_HEIGHT} invert={i > 0} />
          ))}
        </span>
      ) : agencies.length === 1 ? (
        <span className="logo-legend-icon-slot" style={{ width: AGENCY_SLOT }}>
          <IconEl name={agencies[0]} height={ICON_HEIGHT} />
        </span>
      ) : null}
      {modes.map(name => (
        <span key={name} className="logo-legend-icon-slot" style={{ width: MODE_SLOT }}>
          <IconEl name={name} height={ICON_HEIGHT} />
        </span>
      ))}
    </>
  )
}

// Grid columns: [left, right] — NJT crossings left, others right
const GRID_COLS: Record<string, [string[], string[]]> = {
  crossing: [
    ['Lincoln (Bus)', 'Lincoln (Autos)', 'Holland (Autos)', 'Holland (Bus)'],
    ['Amtrak / NJ Transit', 'PATH (Downtown)', 'PATH (Uptown)', 'Ferry'],
  ],
  mode: [
    ['Bus', 'Autos', 'Rail'],
    ['PATH', 'Ferry'],
  ],
}

function GridItem({ label, icons, color }: { label: string; icons: string[]; color: string }) {
  return (
    <div className="logo-legend-grid-item">
      <span className="logo-legend-dot" style={{ backgroundColor: color }} />
      <span className="logo-legend-icons">
        <IconRow icons={icons} />
      </span>
      <span className="logo-legend-grid-label">{label}</span>
    </div>
  )
}

/** Compact grid legend for narrow screens (replaces Plotly's bottom legend) */
export function LogoLegendGrid({ labels, colorMap, granularity }: {
  labels: string[]
  colorMap: Record<string, string>
  granularity: 'crossing' | 'mode'
}) {
  const iconMap = granularity === 'mode' ? MODE_ICONS : CROSSING_ICONS
  const [left, right] = GRID_COLS[granularity] ?? [labels, []]
  const leftItems = left.filter(l => labels.includes(l))
  const rightItems = right.filter(l => labels.includes(l))
  return (
    <div className="logo-legend-grid">
      <div className="logo-legend-grid-col">
        {leftItems.map(label => (
          <GridItem key={label} label={label} icons={iconMap[label] ?? []} color={colorMap[label]} />
        ))}
      </div>
      <div className="logo-legend-grid-col">
        {rightItems.map(label => (
          <GridItem key={label} label={label} icons={iconMap[label] ?? []} color={colorMap[label]} />
        ))}
      </div>
    </div>
  )
}

export default function LogoLegend({ labels, colorMap, granularity, lastYValues, chartHeight, margin, yRange, bubblePixels }: LogoLegendProps) {
  const iconMap = granularity === 'mode' ? MODE_ICONS : CROSSING_ICONS

  const [yMin, yMax] = yRange

  const plotTop = margin.t
  const plotBottom = chartHeight - margin.b
  const plotHeight = plotBottom - plotTop

  const yToPx = (yVal: number) => plotTop + plotHeight * (1 - (yVal - yMin) / (yMax - yMin))

  const entryHeight = 50

  const entries = labels
    .map(label => ({
      label,
      idealY: yToPx(lastYValues[label] ?? 0),
      rawY: yToPx(lastYValues[label] ?? 0),
      inCluster: false,
    }))
    .sort((a, b) => a.rawY - b.rawY)

  // 1. Find clusters: groups of items whose ideal positions overlap
  const clusters: number[][] = []
  let cluster = [0]
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].idealY - entries[i - 1].idealY < entryHeight) {
      cluster.push(i)
    } else {
      clusters.push(cluster)
      cluster = [i]
    }
  }
  clusters.push(cluster)

  // 2. Lay out each cluster: spread items evenly, centered on ideal centroid
  for (const cl of clusters) {
    if (cl.length < 2) {
      entries[cl[0]].rawY = entries[cl[0]].idealY
      continue
    }
    for (const i of cl) entries[i].inCluster = true
    const idealCenter = cl.reduce((s, i) => s + entries[i].idealY, 0) / cl.length
    const totalSpan = (cl.length - 1) * entryHeight
    const startY = idealCenter - totalSpan / 2
    for (let j = 0; j < cl.length; j++) {
      entries[cl[j]].rawY = startY + j * entryHeight
    }
  }

  // 3. Resolve inter-cluster overlaps (push down) and clamp to plot area
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].rawY - entries[i - 1].rawY < entryHeight) {
      entries[i].rawY = entries[i - 1].rawY + entryHeight
    }
  }
  // Clamp bottom
  if (entries.length > 0) {
    const overflow = entries[entries.length - 1].rawY - plotBottom
    if (overflow > 0) {
      for (const entry of entries) entry.rawY -= overflow
    }
    // Clamp top
    if (entries[0].rawY < plotTop) {
      const shift = plotTop - entries[0].rawY
      for (const entry of entries) entry.rawY += shift
    }
  }

  // Dot center offsets: x = half dot width, y = margin-top + half height
  const dotCx = 5
  const dotCy = 8 // 3px margin-top + 5px radius

  return (
    <div className="logo-legend" style={{ height: chartHeight }}>
      <svg className="logo-legend-connectors" height={chartHeight} style={{ overflow: 'visible' }}>
        {entries.map(({ label, rawY }) => {
          const bp = bubblePixels?.[label]
          if (!bp) return null
          // Start from bubble edge, offset along the line toward the legend dot
          const dx = dotCx - bp.x
          const dy = rawY - bp.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const pad = bp.r + 6
          const x1 = dist > 0 ? bp.x + (dx / dist) * pad : bp.x + pad
          const y1 = dist > 0 ? bp.y + (dy / dist) * pad : bp.y
          return (
            <line
              key={label}
              x1={x1}
              y1={y1}
              x2={dotCx}
              y2={rawY}
              stroke={colorMap[label]}
              strokeWidth={1}
              strokeDasharray="3 4"
              opacity={1}
            />
          )
        })}
      </svg>
      {entries.map(({ label, rawY }) => {
        const icons = iconMap[label] ?? []
        return (
          <div
            key={label}
            className="logo-legend-entry"
            style={{ top: rawY - dotCy }}
          >
            <span className="logo-legend-dot" style={{ backgroundColor: colorMap[label] }} />
            <div className="logo-legend-content">
              <span className="logo-legend-icons">
                <IconRow icons={icons} />
              </span>
              <span className="logo-legend-label">{label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
