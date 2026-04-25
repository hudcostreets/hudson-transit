// All-sector bubble chart for /nyc — one bubble per (year, sector | mode),
// sized + positioned by share of total CBD-bound persons that year.
// Mirrors `UnifiedChart`'s scatter view but keyed by sector or mode (not
// crossing). MVP: bubble view only; bar/pct/recovery deferred (see
// `specs/nyc-bubble.md`).

import { useMemo } from 'react'
import { Plot } from 'pltly/react'
import { useUrlState, codeParam, type Param } from 'use-prms'
import { useContainerWidth, useBreakpoints } from 'pltly/react'
import type { Layout, PlotData } from 'plotly.js'
import type { CrossingRecord, Direction, TimePeriod } from '../lib/types'
import {
  type AppendixIIIRecord, type NycMode, type Sector,
  NYC_MODE_ORDER, SECTOR_LABELS,
} from '../lib/nyc-types'
import { buildNycRecords } from '../lib/nyc-data'
import { DEFAULT_SCHEME } from '../lib/colors'
import Toggle, { type ToggleOption } from './Toggle'

type Granularity = 'sector' | 'mode'

const dirParam = codeParam<Direction>('entering', [
  ['entering', 'njny'], ['leaving', 'nynj'],
])
const timeParam = codeParam<TimePeriod>('peak_1hr', [
  ['peak_1hr', '1h'], ['peak_period', '3h'], ['24hr', '1d'],
])
const granParam = codeParam<Granularity>('mode', [
  ['mode', 'm'], ['sector', 's'],
])

type Theme = 'dark' | 'light' | 'system'
const themeParam: Param<Theme> = codeParam<Theme>('dark', [
  ['dark', 'd'], ['light', 'l'], ['system', 's'],
])

const DIR_OPTIONS: ToggleOption<Direction>[] = [
  { value: 'entering', label: 'NJ→NY', tooltip: 'Entering CBD' },
  { value: 'leaving', label: 'NY→NJ', tooltip: 'Leaving CBD' },
]
const TIME_OPTIONS: ToggleOption<TimePeriod>[] = [
  { value: 'peak_1hr', label: '1hr' },
  { value: 'peak_period', label: '3hr' },
  { value: '24hr', label: 'day' },
]
const GRAN_OPTIONS: ToggleOption<Granularity>[] = [
  { value: 'mode', label: 'mode' },
  { value: 'sector', label: 'sector' },
]

// Bubble color tables — reuse Semantic mode colors where the labels line up,
// and assign distinct hues to sectors so they read as a categorical group.
const MODE_COLORS: Record<NycMode, string> = {
  Auto: DEFAULT_SCHEME.mode.Autos,
  Bus: DEFAULT_SCHEME.mode.Bus,
  Subway: DEFAULT_SCHEME.mode.PATH,
  Rail: DEFAULT_SCHEME.mode.Rail,
  Ferry: DEFAULT_SCHEME.mode.Ferries,
}
const SECTOR_COLORS: Record<Sector, string> = {
  nj: '#EF8D2E',
  queens: '#9333EA',
  brooklyn: '#14B8A6',
  '60th_street': '#4F46E5',
  staten_island: '#FFA500',
  roosevelt_island: '#FECB52',
}

// `mode` ordering reuses the upstream `NYC_MODE_ORDER`. Sectors are ordered
// by approximate share-of-trips (60th St biggest in absolute terms because
// it sums all Manhattan north→south flow, then Queens, etc.).
const SECTOR_ORDER: Sector[] = ['60th_street', 'queens', 'brooklyn', 'nj', 'staten_island', 'roosevelt_island']

interface Props {
  appendixIii: AppendixIIIRecord[]
  vehicles: CrossingRecord[]
}

export default function NycBubbleChart({ appendixIii, vehicles }: Props) {
  const [direction, setDirection] = useUrlState('d', dirParam)
  const [timePeriod, setTimePeriod] = useUrlState('t', timeParam)
  const [granularity, setGranularity] = useUrlState('g', granParam)
  const [theme] = useUrlState('T', themeParam)

  const isDark = useMemo(() => {
    if (theme === 'dark') return true
    if (theme === 'light') return false
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  }, [theme])
  const fc = isDark ? '#ccc' : '#444'
  const gc = isDark ? '#333' : '#e5e5e5'

  const records = useMemo(() => buildNycRecords(appendixIii, vehicles), [appendixIii, vehicles])

  const { ref, width } = useContainerWidth()
  const { narrow } = useBreakpoints(width)

  const { years, traces } = useMemo(() => {
    // Filter records for the active direction × time_period.
    const active = records.filter(r => r.direction === direction && r.time_period === timePeriod)
    const yearSet = new Set(active.map(r => r.year))
    const years = [...yearSet].sort()

    // Pivot to one trace per group (sector or mode).
    const groups = granularity === 'sector' ? SECTOR_ORDER : NYC_MODE_ORDER
    const groupKey = (r: typeof active[number]) => granularity === 'sector' ? r.sector : r.mode
    const groupLabel = (g: string) => granularity === 'sector' ? SECTOR_LABELS[g as Sector] : g
    const groupColor = (g: string) => granularity === 'sector' ? SECTOR_COLORS[g as Sector] : MODE_COLORS[g as NycMode]

    // Per-year totals (across all groups) for share-of-total Y axis.
    const yearTotals = new Map(years.map(y => [y, 0]))
    for (const r of active) yearTotals.set(r.year, (yearTotals.get(r.year) ?? 0) + r.persons)

    // For each group, build [years × {persons, share}].
    const traces: Partial<PlotData>[] = []
    let maxPersons = 0
    for (const g of groups) {
      const series = years.map(y => {
        const matching = active.filter(r => r.year === y && groupKey(r) === g)
        const persons = matching.reduce((s, r) => s + r.persons, 0)
        if (persons > maxPersons) maxPersons = persons
        return persons
      })
      if (series.every(p => p === 0)) continue
      const shares = series.map((p, i) => {
        const total = yearTotals.get(years[i]) ?? 0
        return total > 0 ? p / total : 0
      })
      const label = groupLabel(g)
      const color = groupColor(g)
      const sizes = series.map(p => maxPersons > 0 ? Math.sqrt(p / maxPersons) * (narrow ? 50 : 70) : 0)
      const labels = series.map(p => p < 1000 ? '' : `${Math.round(p / 1000)}k`)
      traces.push({
        type: 'scatter',
        name: label,
        x: years,
        y: shares,
        mode: 'text+markers',
        marker: { size: sizes as unknown as number, color, line: { width: 0 } },
        text: labels,
        textposition: 'middle center',
        textfont: { size: (narrow ? 9 : 11) as unknown as number, color: '#fff' },
        hovertemplate: `<b>${label}</b><br>%{x}: %{customdata:,.0f} persons<extra></extra>`,
        customdata: series as unknown as PlotData['customdata'],
      })
    }
    return { years, traces }
  }, [records, direction, timePeriod, granularity, narrow])

  const layout: Partial<Layout> = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: fc },
    xaxis: {
      tickvals: years,
      ticktext: years.map(y => `'${String(y).slice(2)}`),
      tickmode: 'array',
      color: fc,
      gridcolor: gc,
      range: [years[0] - 0.9, years[years.length - 1] + 1.2],
    },
    yaxis: {
      title: { text: 'Share of CBD-bound persons', font: { size: 12 } },
      color: fc,
      gridcolor: gc,
      tickformat: '.0%',
      range: [0, 0.72],
    },
    legend: {
      orientation: 'h',
      x: 0.5, y: -0.12,
      xanchor: 'center',
      font: { color: fc, size: 11 },
    },
    margin: { t: 8, r: narrow ? 20 : 60, b: 50, l: narrow ? 50 : 65 },
    autosize: true,
    showlegend: true,
    hovermode: 'closest',
  }

  const dirLabel = direction === 'entering' ? 'NJ→NY (entering)' : 'NY→NJ (leaving)'
  const timeLabel = timePeriod === 'peak_1hr' ? (direction === 'entering' ? '8-9am' : '5-6pm') :
                    timePeriod === 'peak_period' ? (direction === 'entering' ? '7-10am' : '4-7pm') : '24hr'

  return (
    <div ref={ref}>
      <h2>CBD-bound persons by {granularity}</h2>
      <p className="chart-subtitle">{dirLabel}, {timeLabel}, all sectors</p>
      <Plot
        data={traces}
        layout={layout}
        style={{ height: narrow ? 480 : 620 }}
        disableTheme
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
        <Toggle options={GRAN_OPTIONS} value={granularity} onChange={setGranularity} />
        <Toggle options={DIR_OPTIONS} value={direction} onChange={setDirection} />
        <Toggle options={TIME_OPTIONS} value={timePeriod} onChange={setTimePeriod} />
      </div>
    </div>
  )
}
