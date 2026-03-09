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

function IconEl({ name, height, invert, color }: { name: string; height: number; invert?: boolean; color?: string }) {
  const natural = ICON_NATURAL_WIDTHS[name] ?? 16
  const w = natural * (height / ICON_HEIGHT)
  if (MODE_ICON_SET.has(name)) {
    if (color) {
      // Colored pill with white icon
      const pad = 2
      return (
        <span
          className="logo-legend-icon-pill"
          style={{ width: w + pad * 2, height: height + pad * 2, backgroundColor: color, borderRadius: 3 }}
        >
          <span
            className="logo-legend-icon"
            style={{
              width: w,
              height,
              backgroundColor: '#fff',
              maskImage: `url(/icons/${name}.svg)`,
              WebkitMaskImage: `url(/icons/${name}.svg)`,
            }}
          />
        </span>
      )
    }
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

function IconRow({ icons, color }: { icons: string[]; color?: string }) {
  // Split into agency icons and mode icons
  const agencies = icons.filter(n => !MODE_ICON_SET.has(n))
  const modes = icons.filter(n => MODE_ICON_SET.has(n))

  return (
    <>
      {modes.map(name => (
        <span key={name} className="logo-legend-icon-slot" style={{ width: color ? MODE_SLOT + 4 : MODE_SLOT }}>
          <IconEl name={name} height={ICON_HEIGHT} color={color} />
        </span>
      ))}
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
    </>
  )
}

// Grid columns for legend layout — 2-col (narrow) and 4-col (medium+)
const GRID_2: Record<string, string[][]> = {
  crossing: [
    ['Lincoln (Bus)', 'Lincoln (Autos)', 'Holland (Autos)', 'Holland (Bus)'],
    ['Amtrak / NJ Transit', 'PATH (Downtown)', 'PATH (Uptown)', 'Ferry'],
  ],
  mode: [
    ['Bus', 'Autos', 'Rail'],
    ['PATH', 'Ferry'],
  ],
}
const GRID_4: Record<string, string[][]> = {
  crossing: [
    ['Lincoln (Bus)', 'Lincoln (Autos)'],
    ['Holland (Autos)', 'Holland (Bus)'],
    ['Amtrak / NJ Transit', 'PATH (Downtown)'],
    ['PATH (Uptown)', 'Ferry'],
  ],
  mode: [
    ['Bus', 'Autos'],
    ['PATH', 'Rail'],
    ['Ferry'],
  ],
}

function GridItem({ label, icons, color }: { label: string; icons: string[]; color: string }) {
  return (
    <div className="logo-legend-grid-item">
      <span className="logo-legend-icons">
        <IconRow icons={icons} color={color} />
      </span>
      <span className="logo-legend-grid-label">{label}</span>
    </div>
  )
}

/** Compact grid legend (replaces Plotly's built-in legend) */
export function LogoLegendGrid({ labels, colorMap, granularity, containerWidth }: {
  labels: string[]
  colorMap: Record<string, string>
  granularity: 'crossing' | 'mode'
  containerWidth?: number
}) {
  const iconMap = granularity === 'mode' ? MODE_ICONS : CROSSING_ICONS
  const use4 = (containerWidth ?? 0) >= 500
  const grid = use4 ? GRID_4 : GRID_2
  const cols = (grid[granularity] ?? [labels]).map(col => col.filter(l => labels.includes(l)))
  return (
    <div className="logo-legend-grid">
      {cols.map((col, i) => (
        <div key={i} className="logo-legend-grid-col">
          {col.map(label => (
            <GridItem key={label} label={label} icons={iconMap[label] ?? []} color={colorMap[label]} />
          ))}
        </div>
      ))}
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

  // Connector target: center of the first icon area
  const dotCx = 10
  const dotCy = 8

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
            <div className="logo-legend-content">
              <span className="logo-legend-icons">
                <IconRow icons={icons} color={colorMap[label]} />
              </span>
              <span className="logo-legend-label">{label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
