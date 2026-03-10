import { useMemo, useState } from 'react'
import type { Layout, PlotData } from 'plotly.js'
import { Plot, useContainerWidth, useBreakpoints } from 'pltly/react'
import { useUrlState, codeParam } from 'use-prms'
import type { HourlyRecord } from '../lib/hourly-types'
import type { Direction } from '../lib/types'
import Toggle, { type ToggleOption } from './Toggle'
import { Abbr } from './Tooltip'

const MODE_COLORS: Record<string, string> = {
  Subway: '#3366cc',
  Auto: '#dc3912',
  Rail: '#ff9900',
  Bus: '#109618',
  Ferry: '#0099c6',
  Bicycle: '#66aa00',
  Tramway: '#990099',
}

// Bottom-to-top stacking order (most dominant at bottom)
const MODE_ORDER = ['Subway', 'Auto', 'Rail', 'Bus', 'Ferry', 'Bicycle', 'Tramway']

const DIR_OPTIONS: ToggleOption<Direction>[] = [
  { value: 'entering', label: 'Entering' },
  { value: 'leaving', label: 'Leaving' },
]

type ShareView = 'absolute' | 'pct'
const VIEW_OPTIONS: ToggleOption<ShareView>[] = [
  { value: 'absolute', label: 'Total' },
  { value: 'pct', label: '%' },
]

type Theme = 'dark' | 'light' | 'system'
const themeParam = codeParam<Theme>('dark', [
  ['dark', 'd'], ['light', 'l'], ['system', 's'],
])

export default function ModeShareChart({ data }: { data: HourlyRecord[] }) {
  const [direction, setDirection] = useState<Direction>('entering')
  const [viewMode, setViewMode] = useState<ShareView>('absolute')
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

  const { years, traces } = useMemo(() => {
    // Sum all hours per mode/year/direction to get daily totals
    const filtered = data.filter(r => r.category === 'mode' && r.direction === direction)
    const yearSet = new Set(filtered.map(r => r.year))
    const years = [...yearSet].sort()

    const modeTotals: Record<string, number[]> = {}
    for (const mode of MODE_ORDER) {
      modeTotals[mode] = years.map(y =>
        filtered
          .filter(r => r.key === mode && r.year === y)
          .reduce((sum, r) => sum + r.persons, 0)
      )
    }

    // For pct view, compute year totals
    const yearTotals = years.map((_y, i) =>
      MODE_ORDER.reduce((sum, mode) => sum + modeTotals[mode][i], 0)
    )

    const isPct = viewMode === 'pct'

    const traces: Partial<PlotData>[] = MODE_ORDER.map(mode => ({
      type: 'bar' as const,
      name: mode,
      x: years,
      y: isPct
        ? modeTotals[mode].map((v, i) => yearTotals[i] > 0 ? 100 * v / yearTotals[i] : 0)
        : modeTotals[mode],
      marker: { color: MODE_COLORS[mode] },
      hovertemplate: isPct
        ? `%{x}: %{y:.1f}%<extra>${mode}</extra>`
        : `%{x}: %{y:,.0f}<extra>${mode}</extra>`,
    }))

    return { years, traces }
  }, [data, direction, viewMode])

  const layout: Partial<Layout> = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: fc },
    barmode: 'stack' as const,
    title: { text: '' },
    xaxis: {
      tickvals: years,
      ticktext: years.map(y => `'${String(y).slice(2)}`),
      color: fc,
    },
    yaxis: {
      title: { text: viewMode === 'pct' ? 'Share (%)' : 'Persons', font: { size: 12 } },
      color: fc,
      gridcolor: gc,
      tickformat: viewMode === 'pct' ? '.0f' : ',',
      ...(viewMode === 'pct' ? { range: [0, 100] } : {}),
    },
    legend: {
      orientation: 'h' as const,
      x: 0.5, y: -0.08,
      xanchor: 'center' as const,
      font: { color: fc, size: 11 },
    },
    margin: { t: 10, r: 10, b: 45, l: narrow ? 50 : 65 },
    autosize: true,
    showlegend: true,
  }

  return (
    <div ref={ref}>
      <h2>Daily persons {direction} the <Abbr title="Central Business District — Manhattan below 60th St">CBD</Abbr> by mode</h2>
      <p className="chart-subtitle">All sectors, 24hr total, Fall business day</p>
      <Plot
        data={traces}
        layout={layout}
        style={{ height: narrow ? 400 : 500 }}
        disableTheme
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
        <Toggle options={VIEW_OPTIONS} value={viewMode} onChange={setViewMode} />
        <Toggle options={DIR_OPTIONS} value={direction} onChange={setDirection} />
      </div>
    </div>
  )
}
