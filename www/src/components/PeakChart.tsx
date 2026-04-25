import { useMemo } from 'react'
import type { Layout, PlotData } from 'plotly.js'
import { Plot, useContainerWidth, useBreakpoints, useTheme } from 'pltly/react'
import { themedLayout } from 'pltly/plotly'
import type { PeakRecord } from '../lib/hourly-types'
import { Abbr } from './Tooltip'

const CATEGORY_CONFIG: Record<string, { label: string, color: string }> = {
  total_persons: { label: 'All persons', color: '#3366cc' },
  transit_passengers: { label: 'Transit riders', color: '#109618' },
  motor_vehicles: { label: 'Motor vehicles', color: '#dc3912' },
}

const CATEGORIES = ['total_persons', 'transit_passengers', 'motor_vehicles'] as const

export default function PeakChart({ data }: { data: PeakRecord[] }) {
  const { ref, width } = useContainerWidth()
  const { narrow } = useBreakpoints(width)
  const { theme } = useTheme()

  const traces = useMemo(() => {
    return CATEGORIES.map(cat => {
      const cfg = CATEGORY_CONFIG[cat]
      const records = data
        .filter(r => r.category === cat)
        .sort((a, b) => a.year - b.year)

      return {
        type: 'scatter' as const,
        name: cfg.label,
        x: records.map(r => r.year),
        y: records.map(r => r.peak_accumulation),
        mode: 'lines+markers' as const,
        line: { color: cfg.color, width: 2 },
        marker: { size: 4, color: cfg.color },
        hovertemplate: `%{y:,.0f}<extra>${cfg.label}</extra>`,
      } satisfies Partial<PlotData>
    })
  }, [data])

  // Annotation for key events
  const annotations = useMemo(() => {
    const tp = data.filter(r => r.category === 'total_persons')
    const covid = tp.find(r => r.year === 2020)
    const peak = tp.reduce((max, r) => r.peak_accumulation > max.peak_accumulation ? r : max, tp[0])
    const latest = tp.find(r => r.year === 2024)

    const anns = []
    if (peak) {
      anns.push({
        x: peak.year, y: peak.peak_accumulation,
        text: `Peak: ${(peak.peak_accumulation / 1e6).toFixed(2)}M`,
        showarrow: true, arrowhead: 0, ax: 30, ay: -25,
        font: { size: 11, color: theme.font },
      })
    }
    if (covid) {
      anns.push({
        x: 2020, y: covid.peak_accumulation,
        text: `COVID: ${(covid.peak_accumulation / 1e6).toFixed(2)}M`,
        showarrow: true, arrowhead: 0, ax: -30, ay: -25,
        font: { size: 11, color: theme.font },
      })
    }
    if (latest) {
      const pct = peak ? Math.round(100 * latest.peak_accumulation / peak.peak_accumulation) : 0
      anns.push({
        x: 2024, y: latest.peak_accumulation,
        text: `${(latest.peak_accumulation / 1e6).toFixed(2)}M (${pct}%)`,
        showarrow: true, arrowhead: 0, ax: -40, ay: -25,
        font: { size: 11, color: theme.font },
      })
    }
    return anns
  }, [data, theme.font])

  const baseLayout = themedLayout(theme)
  const layout: Partial<Layout> = {
    ...baseLayout,
    title: { text: '' },
    xaxis: {
      ...baseLayout.xaxis,
      dtick: 5,
    },
    yaxis: {
      ...baseLayout.yaxis,
      title: { text: 'Persons', font: { size: 12 } },
      tickformat: ',',
      rangemode: 'tozero' as const,
    },
    legend: {
      orientation: 'h' as const,
      x: 0.5, y: -0.15,
      xanchor: 'center' as const,
      font: { color: theme.font },
    },
    annotations,
    margin: { t: 10, r: 10, b: 60, l: narrow ? 55 : 70 },
    autosize: true,
    showlegend: true,
    hovermode: 'x unified' as const,
    hoverlabel: {
      bgcolor: theme.annBg,
      bordercolor: theme.grid,
      font: { color: theme.font, size: 12 },
    },
  }

  return (
    <div ref={ref}>
      <h2>Peak accumulation in the Manhattan <Abbr title="The 'Hub' is NYMTC's term for Manhattan's CBD — below 60th St">Hub</Abbr></h2>
      <p className="chart-subtitle">Maximum persons present on a Fall business day, 1975&ndash;2024</p>
      <Plot
        data={traces}
        layout={layout}
        style={{ height: narrow ? 400 : 500 }}
      />
    </div>
  )
}
