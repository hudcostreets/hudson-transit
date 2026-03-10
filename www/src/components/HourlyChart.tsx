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

const MODE_ORDER = ['Subway', 'Rail', 'Bus', 'Ferry', 'Tramway', 'Auto', 'Bicycle']

const SECTOR_COLORS: Record<string, string> = {
  '60th_street': '#e8a838',
  'brooklyn': '#e05555',
  'queens': '#7b68ee',
  'nj': '#2daa6e',
  'staten_island': '#0099c6',
  'roosevelt_island': '#990099',
}

const SECTOR_LABELS: Record<string, string> = {
  '60th_street': '60th Street',
  'brooklyn': 'Brooklyn',
  'queens': 'Queens',
  'nj': 'New Jersey',
  'staten_island': 'Staten Island',
  'roosevelt_island': 'Roosevelt Island',
}

const SECTOR_ORDER = ['60th_street', 'brooklyn', 'queens', 'nj', 'staten_island', 'roosevelt_island']

const DIR_OPTIONS: ToggleOption<Direction>[] = [
  { value: 'entering', label: 'Entering' },
  { value: 'leaving', label: 'Leaving' },
]

type Breakdown = 'mode' | 'sector'
const BREAKDOWN_OPTIONS: ToggleOption<Breakdown>[] = [
  { value: 'mode', label: 'By mode' },
  { value: 'sector', label: 'By sector' },
]

type Theme = 'dark' | 'light' | 'system'
const themeParam = codeParam<Theme>('dark', [
  ['dark', 'd'], ['light', 'l'], ['system', 's'],
])

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const HOUR_LABELS = HOURS.map(h => {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
})

export default function HourlyChart({ data }: { data: HourlyRecord[] }) {
  const [direction, setDirection] = useState<Direction>('entering')
  const [breakdown, setBreakdown] = useState<Breakdown>('mode')
  const [selectedYear, setSelectedYear] = useState('2024')
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

  const years = useMemo(() => {
    const ys = new Set(data.filter(r => r.category === 'mode').map(r => r.year))
    return [...ys].sort()
  }, [data])

  const yearOptions: ToggleOption<string>[] = useMemo(() => {
    const highlights = [2014, 2019, 2020, 2024].filter(y => years.includes(y))
    return highlights.map(y => ({ value: String(y), label: `'${String(y).slice(2)}` }))
  }, [years])

  const traces = useMemo(() => {
    const filtered = data.filter(r =>
      r.category === breakdown && r.direction === direction && r.year === Number(selectedYear)
    )

    const keys = breakdown === 'mode' ? MODE_ORDER : SECTOR_ORDER
    const colors = breakdown === 'mode' ? MODE_COLORS : SECTOR_COLORS
    const labels = breakdown === 'mode'
      ? Object.fromEntries(MODE_ORDER.map(k => [k, k]))
      : SECTOR_LABELS

    return keys.map(key => {
      const keyData = filtered.filter(r => r.key === key)
      const hourMap = new Map(keyData.map(r => [r.hour, r.persons]))

      return {
        type: 'scatter' as const,
        name: labels[key] ?? key,
        x: HOURS,
        y: HOURS.map(h => hourMap.get(h) ?? 0),
        mode: 'lines' as const,
        stackgroup: 'one',
        line: { width: 0.5, color: colors[key] },
        fillcolor: colors[key] + 'cc',
        hovertemplate: `%{x}: %{y:,.0f}<extra>${labels[key] ?? key}</extra>`,
      } satisfies Partial<PlotData>
    })
  }, [data, direction, breakdown, selectedYear])

  const layout: Partial<Layout> = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: fc },
    title: { text: '' },
    xaxis: {
      tickvals: HOURS.filter(h => h % 3 === 0),
      ticktext: HOURS.filter(h => h % 3 === 0).map(h => HOUR_LABELS[h]),
      color: fc,
      gridcolor: gc,
    },
    yaxis: {
      title: { text: 'Persons', font: { size: 12 } },
      color: fc,
      gridcolor: gc,
      tickformat: ',',
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
    hovermode: 'x unified' as const,
  }

  return (
    <div ref={ref}>
      <h2>Persons {direction} the <Abbr title="Central Business District — Manhattan below 60th St">CBD</Abbr> by hour</h2>
      <p className="chart-subtitle">{Number(selectedYear)}, Fall business day</p>
      <Plot
        data={traces}
        layout={layout}
        style={{ height: narrow ? 400 : 500 }}
        disableTheme
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
        <Toggle options={BREAKDOWN_OPTIONS} value={breakdown} onChange={setBreakdown} />
        <Toggle options={DIR_OPTIONS} value={direction} onChange={setDirection} />
        <Toggle options={yearOptions} value={selectedYear} onChange={setSelectedYear} />
      </div>
    </div>
  )
}
