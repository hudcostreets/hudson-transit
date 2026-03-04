/** Shared legend layouts for peak hour charts */

export const PEAK_BAR_LEGEND_ORDER = [
  'Lincoln (Autos)', 'PATH (Uptown)',   'Holland (Autos)', 'Ferry',
  'Lincoln (Bus)',   'PATH (Downtown)', 'Holland (Bus)',   'Amtrak / NJ Transit',
]

export const PEAK_SCATTER_LEGEND_ORDER = [
  'Lincoln (Bus)',       'PATH (Uptown)',   'Ferry',           'Holland (Autos)',
  'Amtrak / NJ Transit', 'PATH (Downtown)', 'Lincoln (Autos)', 'Holland (Bus)',
]

/** 4-column legend below chart (for scatter) */
export function peakLegendLayout(
  order: string[],
  { y0 = -0.05, dy = -0.05, x0 = 0, dx = 0.25 } = {},
): Record<string, object> {
  const layout: Record<string, object> = {}
  for (let i = 0; i < order.length; i++) {
    const n = i + 1
    const key = `legend${n === 1 ? '' : n}`
    layout[key] = {
      yanchor: 'top' as const,
      x: x0 + (i % 4) * dx,
      y: y0 + Math.floor(i / 4) * dy,
    }
  }
  return layout
}

/** Single horizontal legend above the bar chart, aligned with external title */
export const PEAK_BAR_LEGEND = {
  orientation: 'h' as const,
  yanchor: 'bottom' as const,
  y: 1.02,
  xanchor: 'center' as const,
  x: 0.5,
  font: { size: 11 },
}
