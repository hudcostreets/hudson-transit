import { useMemo, useState } from 'react'
import type { Layout, PlotData } from 'plotly.js'
import { Plot, useContainerWidth, useBreakpoints } from 'pltly/react'
import { useUrlState, codeParam } from 'use-prms'
import type { CrossingRecord, Direction, TimePeriod } from '../lib/types'
import Toggle, { type ToggleOption } from './Toggle'

const SECTOR_COLORS: Record<string, string> = {
  '60th_street': '#e8a838',
  'brooklyn': '#e05555',
  'queens': '#7b68ee',
  'nj': '#2daa6e',
}

const SECTOR_LABELS: Record<string, string> = {
  '60th_street': '60th Street',
  'brooklyn': 'Brooklyn',
  'queens': 'Queens',
  'nj': 'New Jersey',
}

const SECTORS = ['60th_street', 'brooklyn', 'queens', 'nj'] as const

const DIR_OPTIONS: ToggleOption<Direction>[] = [
  { value: 'entering', label: 'NJ\u2192NY' },
  { value: 'leaving', label: 'NY\u2192NJ' },
]

const TIME_OPTIONS: ToggleOption<TimePeriod>[] = [
  { value: 'peak_1hr', label: '1hr' },
  { value: 'peak_period', label: '3hr' },
  { value: '24hr', label: 'day' },
]

type SectorView = 'stacked' | 'grouped'
const VIEW_OPTIONS: ToggleOption<SectorView>[] = [
  { value: 'stacked', label: 'Stacked' },
  { value: 'grouped', label: 'Grouped' },
]

type Theme = 'dark' | 'light' | 'system'
const themeParam = codeParam<Theme>('dark', [
  ['dark', 'd'], ['light', 'l'], ['system', 's'],
])

export default function SectorChart({ data }: { data: CrossingRecord[] }) {
  const [direction, setDirection] = useState<Direction>('entering')
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('peak_1hr')
  const [viewMode, setViewMode] = useState<SectorView>('stacked')
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

  const { years, sectorTotals } = useMemo(() => {
    const filtered = data.filter(r => r.direction === direction && r.time_period === timePeriod)
    const yearSet = new Set(filtered.map(r => r.year))
    const years = [...yearSet].sort()

    const sectorTotals: Record<string, number[]> = {}
    for (const sector of SECTORS) {
      sectorTotals[sector] = years.map(y =>
        filtered
          .filter(r => r.sector === sector && r.year === y)
          .reduce((sum, r) => sum + r.passengers, 0)
      )
    }
    return { years, sectorTotals }
  }, [data, direction, timePeriod])

  const traces: Partial<PlotData>[] = SECTORS.map(sector => ({
    type: 'bar' as const,
    name: SECTOR_LABELS[sector],
    x: years,
    y: sectorTotals[sector],
    marker: { color: SECTOR_COLORS[sector] },
    hovertemplate: `%{x}: %{y:,.0f} vehicles<extra>${SECTOR_LABELS[sector]}</extra>`,
  }))

  const timeLabel = timePeriod === 'peak_1hr'
    ? (direction === 'entering' ? '8-9am' : '5-6pm')
    : timePeriod === 'peak_period'
      ? (direction === 'entering' ? '7-10am' : '4-7pm')
      : '24hr'

  const layout: Partial<Layout> = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: fc },
    barmode: viewMode === 'stacked' ? 'stack' : 'group',
    title: {
      text: `Motor vehicles entering the CBD by sector<br><sub>${timeLabel}, Fall business day</sub>`,
      font: { size: narrow ? 14 : 18, color: fc },
    },
    xaxis: {
      tickvals: years,
      ticktext: years.map(y => `'${String(y).slice(2)}`),
      color: fc,
    },
    yaxis: {
      title: { text: 'Vehicles', font: { size: 12 } },
      color: fc,
      gridcolor: gc,
      tickformat: ',',
    },
    legend: {
      orientation: 'h' as const,
      x: 0.5, y: -0.15,
      xanchor: 'center' as const,
      font: { color: fc },
    },
    margin: { t: narrow ? 65 : 75, r: 10, b: 60, l: narrow ? 50 : 65 },
    autosize: true,
    showlegend: true,
  }

  return (
    <div ref={ref}>
      <Plot
        data={traces}
        layout={layout}
        style={{ height: narrow ? 400 : 500 }}
        disableTheme
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
        <Toggle options={VIEW_OPTIONS} value={viewMode} onChange={setViewMode} />
        <Toggle options={DIR_OPTIONS} value={direction} onChange={setDirection} />
        <Toggle options={TIME_OPTIONS} value={timePeriod} onChange={setTimePeriod} />
      </div>
    </div>
  )
}
