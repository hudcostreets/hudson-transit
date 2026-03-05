import { useState, useMemo, useRef, useLayoutEffect, useCallback, useEffect } from 'react'
import Plot from 'react-plotly.js'
import type { Data, Layout } from 'plotly.js'
import { useUrlState, codeParam } from 'use-prms'
import type { Param } from 'use-prms'
import { useActions } from 'use-kbd'
import type { CrossingRecord, ViewMode, Direction, TimePeriod, Granularity } from '../lib/types'
import { COLOR_SCHEMES } from '../lib/colors'
import { filterCrossings, crossingSeriesArrays, aggregateByMode, toPercentages } from '../lib/transform'
import { getJitter, buildCanonicalAnnotations } from './scatter-config'
import JitteredPlot, { getJitteredX, type JitterOffsets } from './JitteredPlot'
import Toggle, { type ToggleOption } from './Toggle'
import { BubbleIcon, RecoveryIcon } from './icons'

// ?y=[n|p|c] — default: bubble (omitted)
const viewParam = codeParam<ViewMode>('scatter', [
  ['scatter', 'b'], ['bar', 'n'], ['pct', 'p'], ['recovery', 'c'],
])
// ?d=nynj — default: NJ→NY (omitted)
const dirParam = codeParam<Direction>('entering', [
  ['entering', 'njny'], ['leaving', 'nynj'],
])
// ?t=[3h|1d] — default: 1h (omitted)
const timeParam = codeParam<TimePeriod>('peak_1hr', [
  ['peak_1hr', '1h'], ['peak_period', '3h'], ['24hr', '1d'],
])
// ?g=[c|m] — default: crossing (omitted)
const granParam = codeParam<Granularity>('crossing', [
  ['crossing', 'c'], ['mode', 'm'],
])

type SchemeName = 'Plotly' | 'Semantic'
const schemeParam = codeParam<SchemeName>('Plotly', [
  ['Plotly', 'p'], ['Semantic', 's'],
])
const SCHEME_OPTIONS: ToggleOption<SchemeName>[] =
  COLOR_SCHEMES.map(s => ({ value: s.name as SchemeName, label: s.name }))
// ?A (valueless) hides annotations; default: on (omitted)
const annParam: Param<boolean> = {
  encode: (v) => v ? undefined : '',
  decode: (e) => e === undefined,
}

type Theme = 'dark' | 'light' | 'system'
const themeParam = codeParam<Theme>('dark', [
  ['dark', 'd'], ['light', 'l'], ['system', 's'],
])
const THEME_OPTIONS: ToggleOption<Theme>[] = [
  { value: 'dark', label: '\u{1F31A}' },
  { value: 'light', label: '\u2600\uFE0F' },
  { value: 'system', label: '\u{1F4BB}' },
]

const VIEW_OPTIONS: ToggleOption<ViewMode>[] = [
  { value: 'scatter', label: <BubbleIcon /> },
  { value: 'bar', label: '#' },
  { value: 'pct', label: '%' },
  { value: 'recovery', label: <RecoveryIcon /> },
]

const DIR_OPTIONS: ToggleOption<Direction>[] = [
  { value: 'entering', label: 'NJ\u2192NY' },
  { value: 'leaving', label: 'NY\u2192NJ' },
]

const TIME_OPTIONS: ToggleOption<TimePeriod>[] = [
  { value: 'peak_1hr', label: 'hr' },
  { value: 'peak_period', label: '3hr' },
  { value: '24hr', label: 'day' },
]

const GRAN_OPTIONS: ToggleOption<Granularity>[] = [
  { value: 'crossing', label: 'crossing' },
  { value: 'mode', label: 'mode' },
]

/** Breakpoint (px) above which legend moves to the right side */
const LEGEND_SIDE_MIN_WIDTH = 900

/** Bottom legend: horizontal, 2 rows via tracegroupgap */
const LEGEND_BOTTOM: Partial<Layout['legend']> = {
  orientation: 'h',
  yanchor: 'top',
  y: -0.08,
  xanchor: 'center',
  x: 0.5,
  font: { size: 11 },
}

/** Right-side legend: vertical, stacked */
const LEGEND_RIGHT: Partial<Layout['legend']> = {
  yanchor: 'top',
  y: 1,
  xanchor: 'left',
  x: 1.02,
  font: { size: 11 },
}

const BASE_YEAR = 2019

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

function subtitleText(view: ViewMode, direction: Direction, timePeriod: TimePeriod): string {
  const dir = direction === 'entering' ? 'NJ\u2192NY' : 'NY\u2192NJ'
  const time: Record<TimePeriod, string> = {
    peak_1hr: direction === 'entering' ? '8-9am' : '5-6pm',
    peak_period: direction === 'entering' ? '7-10am' : '4-7pm',
    '24hr': '24hr',
  }
  const suffix = timePeriod === '24hr' ? 'Fall business day' : `${time[timePeriod]}, Fall business day`
  if (view === 'recovery') return `${dir}, ${suffix}, as % of ${BASE_YEAR}`
  return `${dir}, ${suffix}`
}

function isCanonical(direction: Direction, timePeriod: TimePeriod, granularity: Granularity): boolean {
  return direction === 'entering' && timePeriod === 'peak_1hr' && granularity === 'crossing'
}

export default function UnifiedChart({ data }: { data: CrossingRecord[] }) {
  const [view, setView] = useUrlState('y', viewParam)
  const [direction, setDirection] = useUrlState('d', dirParam)
  const [timePeriod, setTimePeriod] = useUrlState('t', timeParam)
  const [granularity, setGranularity] = useUrlState('g', granParam)
  const [showAnnotations, setShowAnnotations] = useUrlState('A', annParam)
  const [schemeName, setSchemeName] = useUrlState('s', schemeParam)
  const [theme, setTheme] = useUrlState('T', themeParam)
  const colors = COLOR_SCHEMES.find(s => s.name === schemeName) ?? COLOR_SCHEMES[0]
  const { ref, width } = useContainerWidth()

  // Sync theme to <html> data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const VIEWS: ViewMode[] = ['scatter', 'bar', 'pct', 'recovery']
  const TIMES: TimePeriod[] = ['peak_1hr', 'peak_period', '24hr']

  const toggleDirection = useCallback(() => {
    setDirection(direction === 'entering' ? 'leaving' : 'entering')
  }, [direction, setDirection])
  const cycleTime = useCallback(() => {
    setTimePeriod(TIMES[(TIMES.indexOf(timePeriod) + 1) % TIMES.length])
  }, [timePeriod, setTimePeriod])
  const toggleGranularity = useCallback(() => {
    setGranularity(granularity === 'crossing' ? 'mode' : 'crossing')
  }, [granularity, setGranularity])
  const toggleAnnotations = useCallback(() => {
    setShowAnnotations(!showAnnotations)
  }, [showAnnotations, setShowAnnotations])
  const cycleScheme = useCallback(() => {
    const names = COLOR_SCHEMES.map(s => s.name) as SchemeName[]
    setSchemeName(names[(names.indexOf(schemeName) + 1) % names.length])
  }, [schemeName, setSchemeName])
  const THEMES: Theme[] = ['dark', 'light', 'system']
  const cycleTheme = useCallback(() => {
    setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])
  }, [theme, setTheme])

  useActions({
    'view:scatter': { label: 'Bubble view', group: 'View', defaultBindings: ['1'], handler: () => setView('scatter') },
    'view:bar': { label: 'Bar view', group: 'View', defaultBindings: ['2'], handler: () => setView('bar') },
    'view:pct': { label: 'Percent view', group: 'View', defaultBindings: ['3'], handler: () => setView('pct') },
    'view:recovery': { label: 'Recovery view', group: 'View', defaultBindings: ['4'], handler: () => setView('recovery') },
    'dir:toggle': { label: 'Toggle direction', group: 'Controls', defaultBindings: ['d'], handler: toggleDirection },
    'time:cycle': { label: 'Cycle time period', group: 'Controls', defaultBindings: ['t'], handler: cycleTime },
    'gran:toggle': { label: 'Toggle granularity', group: 'Controls', defaultBindings: ['g'], handler: toggleGranularity },
    'ann:toggle': { label: 'Toggle annotations', group: 'Controls', defaultBindings: ['a'], handler: toggleAnnotations },
    'scheme:cycle': { label: 'Cycle color scheme', group: 'Controls', defaultBindings: ['c'], handler: cycleScheme },
    'theme:cycle': { label: 'Cycle theme', group: 'Controls', defaultBindings: ['shift+t'], handler: cycleTheme },
  })

  const filtered = useMemo(
    () => filterCrossings(data, direction, timePeriod),
    [data, direction, timePeriod],
  )

  const { years, series, labels } = useMemo(() => {
    if (granularity === 'mode') return aggregateByMode(filtered)
    return crossingSeriesArrays(filtered)
  }, [filtered, granularity])

  const pct = useMemo(
    () => toPercentages(years, series, labels),
    [years, series, labels],
  )

  const colorMap = granularity === 'mode' ? colors.mode : colors.crossing
  const canonical = isCanonical(direction, timePeriod, granularity)
  const jitter = getJitter(direction, timePeriod, granularity)
  const wide = width >= LEGEND_SIDE_MIN_WIDTH
  const legendLayout = wide ? LEGEND_RIGHT : LEGEND_BOTTOM
  const rightMargin = wide ? 160 : 10

  // Resolve effective theme for Plotly
  const isDark = useMemo(() => {
    if (theme === 'dark') return true
    if (theme === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }, [theme])
  const plotTheme = isDark
    ? { bg: 'rgba(0,0,0,0)', font: '#ccc', grid: '#333', annFont: '#e0e0e0', annBg: '#2a2a4a' }
    : { bg: 'rgba(0,0,0,0)', font: '#444', grid: '#e5e5e5', annFont: '#000', annBg: '#fff' }

  const content = useMemo(() => {
    if (view === 'scatter') return renderScatter(years, series, pct, labels, colorMap, jitter, canonical && showAnnotations, legendLayout, rightMargin, plotTheme)
    if (view === 'bar') return renderBar(years, series, labels, colorMap, legendLayout, rightMargin, plotTheme)
    if (view === 'recovery') return renderRecovery(years, series, labels, colorMap, legendLayout, rightMargin, plotTheme)
    return renderPctBar(years, series, labels, colorMap, legendLayout, rightMargin, plotTheme)
  }, [view, years, series, pct, labels, colorMap, jitter, canonical, showAnnotations, legendLayout, rightMargin, plotTheme])

  return (
    <div ref={ref}>
      <p className="chart-subtitle">{subtitleText(view, direction, timePeriod)}</p>
      <div key={`${view}-${direction}-${timePeriod}-${granularity}`}>
        {content}
      </div>
      <div className="toggle-bar">
        <Toggle options={VIEW_OPTIONS} value={view} onChange={setView} />
        <Toggle options={DIR_OPTIONS} value={direction} onChange={setDirection} />
        <Toggle options={TIME_OPTIONS} value={timePeriod} onChange={setTimePeriod} />
        <Toggle options={GRAN_OPTIONS} value={granularity} onChange={setGranularity} />
        {view === 'scatter' && canonical && (
          <Toggle
            options={[
              { value: 'on', label: '\u{1F4DD}' },
              { value: 'off', label: '\u2014' },
            ]}
            value={showAnnotations ? 'on' : 'off'}
            onChange={v => setShowAnnotations(v === 'on')}
          />
        )}
        <Toggle options={SCHEME_OPTIONS} value={schemeName} onChange={setSchemeName} />
        <Toggle options={THEME_OPTIONS} value={theme} onChange={setTheme} />
      </div>
    </div>
  )
}

interface PlotTheme {
  bg: string
  font: string
  grid: string
  annFont: string
  annBg: string
}

function themedLayout(pt: PlotTheme): Partial<Layout> {
  return {
    paper_bgcolor: pt.bg,
    plot_bgcolor: pt.bg,
    font: { color: pt.font },
    xaxis: { gridcolor: pt.grid, zerolinecolor: pt.grid },
    yaxis: { gridcolor: pt.grid, zerolinecolor: pt.grid },
  }
}

function renderScatter(
  years: number[],
  series: Record<string, number[]>,
  pct: Record<string, number[]>,
  labels: string[],
  colorMap: Record<string, string>,
  jitter: JitterOffsets | undefined,
  showAnnotations: boolean,
  legendLayout: Partial<Layout['legend']>,
  rightMargin: number,
  pt: PlotTheme,
) {
  const maxPassengers = Math.max(...labels.flatMap(l => series[l]))
  const maxSize = 60

  const traces: Data[] = labels.map((label, i) => {
    const passengers = series[label]
    const sizes = passengers.map(p => Math.sqrt(p / maxPassengers) * maxSize)
    const texts = passengers.map(p => p >= 800 ? `${Math.round(p / 1000)}k` : '')
    return {
      type: 'scatter',
      name: label,
      x: years,
      y: pct[label],
      mode: 'text+markers',
      marker: { size: sizes, color: colorMap[label] },
      text: texts,
      textfont: { size: 10 },
      customdata: passengers.map((p, j) => [p, years[j]]),
      hovertemplate: '%{customdata[0]:,} (%{y:.1%})<extra>%{customdata[1]}</extra>',
    } as Data
  })

  const maxYear = Math.max(...years)

  const jx = (traceName: string, yearIdx: number) =>
    getJitteredX(jitter, years[yearIdx], traceName)

  const annotations = showAnnotations
    ? buildCanonicalAnnotations(years, pct, series, maxPassengers, maxSize, jx, { font: pt.annFont, bg: pt.annBg, arrow: pt.font })
    : undefined

  return (
    <JitteredPlot
      data={traces}
      jitter={jitter}
      layout={{
        ...themedLayout(pt),
        xaxis: {
          dtick: 1,
          range: [years[0] - 0.8, maxYear + 0.5],
          title: { text: '' },
          hoverformat: 'd',
          gridcolor: pt.grid,
        },
        yaxis: {
          title: { text: '% of total passengers (mode share)' },
          tickformat: ',.0%',
          rangemode: 'tozero',
          gridcolor: pt.grid,
        },
        hovermode: 'x',
        margin: { t: 10, l: 60, r: rightMargin, b: 90 },
        autosize: true,
        annotations: annotations as Layout['annotations'],
        legend: legendLayout,
      }}
      useResizeHandler
      style={{ width: '100%', height: '700px' }}
    />
  )
}

function renderBar(
  years: number[],
  series: Record<string, number[]>,
  labels: string[],
  colorMap: Record<string, string>,
  legendLayout: Partial<Layout['legend']>,
  rightMargin: number,
  pt: PlotTheme,
) {
  return (
    <Plot
      data={labels.map(label => ({
        type: 'bar' as const,
        name: label,
        x: years,
        y: series[label],
        marker: { color: colorMap[label] },
      }))}
      layout={{
        ...themedLayout(pt),
        xaxis: { dtick: 1, title: { text: '' }, gridcolor: pt.grid },
        yaxis: { title: { text: 'Passengers' }, gridcolor: pt.grid },
        hovermode: 'x',
        margin: { t: 40, l: 60, r: rightMargin, b: 40 },
        autosize: true,
        legend: legendLayout,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
    />
  )
}

function renderPctBar(
  years: number[],
  series: Record<string, number[]>,
  labels: string[],
  colorMap: Record<string, string>,
  legendLayout: Partial<Layout['legend']>,
  rightMargin: number,
  pt: PlotTheme,
) {
  const totals = years.map((_, i) =>
    labels.reduce((sum, l) => sum + (series[l]?.[i] ?? 0), 0)
  )
  return (
    <Plot
      data={labels.map(label => {
        const pcts = series[label].map((v, i) =>
          totals[i] > 0 ? (v / totals[i]) * 100 : 0
        )
        return {
          type: 'bar' as const,
          name: label,
          x: years,
          y: series[label],
          marker: { color: colorMap[label] },
          text: pcts.map(p => p >= 2 ? `${p.toFixed(1)}%` : ''),
          textposition: 'inside' as const,
          insidetextanchor: 'middle',
          constraintext: 'none',
          textfont: { size: 11 },
          customdata: pcts,
          hovertemplate: '%{customdata:.1f}%<extra>%{fullData.name}</extra>',
        }
      })}
      layout={{
        ...themedLayout(pt),
        barmode: 'stack',
        barnorm: 'percent',
        xaxis: { dtick: 1, title: { text: '' }, gridcolor: pt.grid },
        yaxis: { title: { text: '% Passengers' }, gridcolor: pt.grid },
        hovermode: 'x',
        margin: { t: 40, l: 60, r: rightMargin, b: 40 },
        autosize: true,
        legend: legendLayout,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
    />
  )
}

function renderRecovery(
  years: number[],
  series: Record<string, number[]>,
  labels: string[],
  colorMap: Record<string, string>,
  legendLayout: Partial<Layout['legend']>,
  rightMargin: number,
  pt: PlotTheme,
) {
  const baseIdx = years.indexOf(BASE_YEAR)
  if (baseIdx === -1) return <div>No {BASE_YEAR} data for this selection</div>

  const ry = years.filter(y => y >= BASE_YEAR)
  const rs: Record<string, number[]> = {}
  for (const label of labels) {
    const base = series[label][baseIdx]
    rs[label] = ry.map(y => {
      const idx = years.indexOf(y)
      return base > 0 ? series[label][idx] / base : 0
    })
  }

  const maxRecovery = Math.max(...labels.flatMap(l => rs[l]))
  const yMax = Math.ceil(maxRecovery * 10) / 10 + 0.1

  return (
    <Plot
      data={labels.map(label => ({
        type: 'scatter' as const,
        name: label,
        x: ry,
        y: rs[label],
        mode: 'lines+markers' as const,
        marker: { color: colorMap[label], size: 8 },
        line: { color: colorMap[label], width: 2 },
        hovertemplate: '%{y:.0%}<extra>%{fullData.name}</extra>',
      }))}
      layout={{
        ...themedLayout(pt),
        xaxis: { dtick: 1, title: { text: '' }, gridcolor: pt.grid },
        yaxis: {
          title: { text: `% of ${BASE_YEAR} volume` },
          tickformat: ',.0%',
          range: [0, yMax],
          gridcolor: pt.grid,
        },
        hovermode: 'x',
        shapes: [{
          type: 'line',
          x0: ry[0],
          x1: ry[ry.length - 1],
          y0: 1,
          y1: 1,
          line: { color: '#888', width: 1, dash: 'dash' },
        }],
        margin: { t: 10, l: 70, r: rightMargin, b: 40 },
        autosize: true,
        legend: legendLayout,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
    />
  )
}
