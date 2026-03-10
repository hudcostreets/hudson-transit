import { useMemo } from 'react'
import type { Layout, PlotData } from 'plotly.js'
import { Plot, useContainerWidth, useBreakpoints } from 'pltly/react'
import { useUrlState, codeParam } from 'use-prms'
import type { PeakRecord } from '../lib/hourly-types'

const CATEGORY_CONFIG: Record<string, { label: string, color: string }> = {
  total_persons: { label: 'All persons', color: '#3366cc' },
  transit_passengers: { label: 'Transit riders', color: '#109618' },
  motor_vehicles: { label: 'Motor vehicles', color: '#dc3912' },
}

const CATEGORIES = ['total_persons', 'transit_passengers', 'motor_vehicles'] as const

type Theme = 'dark' | 'light' | 'system'
const themeParam = codeParam<Theme>('dark', [
  ['dark', 'd'], ['light', 'l'], ['system', 's'],
])

export default function PeakChart({ data }: { data: PeakRecord[] }) {
  const { ref, width } = useContainerWidth()
  const { narrow } = useBreakpoints(width)

  const [theme] = useUrlState('T', themeParam)
  const isDark = useMemo(() => {
    if (theme === 'dark') return true
    if (theme === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }, [theme])
  const fc = isDark ? '#ccc' : '#444'
  const gc = isDark ? '#333' : '#e5e5e5'

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
        hovertemplate: `%{x}: %{y:,.0f}<extra>${cfg.label}</extra>`,
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
        font: { size: 11, color: fc },
      })
    }
    if (covid) {
      anns.push({
        x: 2020, y: covid.peak_accumulation,
        text: `COVID: ${(covid.peak_accumulation / 1e6).toFixed(2)}M`,
        showarrow: true, arrowhead: 0, ax: -30, ay: -25,
        font: { size: 11, color: fc },
      })
    }
    if (latest) {
      const pct = peak ? Math.round(100 * latest.peak_accumulation / peak.peak_accumulation) : 0
      anns.push({
        x: 2024, y: latest.peak_accumulation,
        text: `${(latest.peak_accumulation / 1e6).toFixed(2)}M (${pct}%)`,
        showarrow: true, arrowhead: 0, ax: -40, ay: -25,
        font: { size: 11, color: fc },
      })
    }
    return anns
  }, [data, fc])

  const layout: Partial<Layout> = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: fc },
    title: {
      text: 'Peak accumulation in the Manhattan Hub<br><sub>Maximum persons present on a Fall business day, 1975\u20132024</sub>',
      font: { size: narrow ? 14 : 18, color: fc },
    },
    xaxis: {
      color: fc,
      gridcolor: gc,
      dtick: 5,
    },
    yaxis: {
      title: { text: 'Persons', font: { size: 12 } },
      color: fc,
      gridcolor: gc,
      tickformat: ',',
      rangemode: 'tozero' as const,
    },
    legend: {
      orientation: 'h' as const,
      x: 0.5, y: -0.15,
      xanchor: 'center' as const,
      font: { color: fc },
    },
    annotations,
    margin: { t: narrow ? 70 : 80, r: 10, b: 60, l: narrow ? 55 : 70 },
    autosize: true,
    showlegend: true,
    hovermode: 'x unified' as const,
  }

  return (
    <div ref={ref}>
      <Plot
        data={traces}
        layout={layout}
        style={{ height: narrow ? 400 : 500 }}
        disableTheme
      />
    </div>
  )
}
