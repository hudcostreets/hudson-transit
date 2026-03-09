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
import { CROSSING_ICON_FNS, MODE_ICON_FNS } from './crossing-icons'
import LogoLegend, { LogoLegendGrid } from './LogoLegend'

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

/** Breakpoint (px) for side legend: show above HIGH, hide below LOW */
const LEGEND_SIDE_SHOW = 800
const LEGEND_SIDE_HIDE = 750

/** Breakpoint (px) below which x-ticks use 'yy format at -45° */
const NARROW_TICK_WIDTH = 600

/** Scale bubble maxSize based on container width */
function responsiveMaxSize(width: number): number {
  if (width >= 1000) return 75
  if (width <= 400) return 35
  // Linear interpolation between 400→35 and 1000→75
  return Math.round(35 + (width - 400) * (75 - 35) / (1000 - 400))
}

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

/** Return dark or light text color based on background luminance */
function contrastColor(hex: string): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  // Relative luminance (sRGB)
  const L = 0.299 * r + 0.587 * g + 0.114 * b
  return L > 160 ? '#1a1a2e' : '#fff'
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
    const raw = granularity === 'mode' ? aggregateByMode(filtered) : crossingSeriesArrays(filtered)
    // Sort labels by last-year value descending so legend mirrors chart order
    const lastIdx = raw.years.length - 1
    const sorted = [...raw.labels].sort((a, b) =>
      (raw.series[b]?.[lastIdx] ?? 0) - (raw.series[a]?.[lastIdx] ?? 0)
    )
    return { ...raw, labels: sorted }
  }, [filtered, granularity])

  const pct = useMemo(
    () => toPercentages(years, series, labels),
    [years, series, labels],
  )

  const colorMap = granularity === 'mode' ? colors.mode : colors.crossing
  const canonical = isCanonical(direction, timePeriod, granularity)
  const jitter = getJitter(direction, timePeriod, granularity)
  const wideRef = useRef(false)
  if (width >= LEGEND_SIDE_SHOW) wideRef.current = true
  else if (width <= LEGEND_SIDE_HIDE) wideRef.current = false
  const wide = wideRef.current
  const narrow = width > 0 && width < NARROW_TICK_WIDTH
  const legendLayout = wide ? LEGEND_RIGHT : LEGEND_BOTTOM
  const rightMargin = wide ? 160 : 10
  const maxSize = responsiveMaxSize(width || 1000)

  // Resolve effective theme for Plotly
  const isDark = useMemo(() => {
    if (theme === 'dark') return true
    if (theme === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }, [theme])
  const plotTheme = isDark
    ? { bg: 'rgba(0,0,0,0)', font: '#ccc', grid: '#333', annFont: '#e0e0e0', annBg: '#2a2a4a' }
    : { bg: 'rgba(0,0,0,0)', font: '#444', grid: '#e5e5e5', annFont: '#000', annBg: '#fff' }

  // Pre-compute recovery ratios for hover tooltip
  const recovery = useMemo(() => {
    const baseIdx = years.indexOf(BASE_YEAR)
    if (baseIdx === -1) return undefined
    const r: Record<string, number[]> = {}
    for (const label of labels) {
      const base = series[label][baseIdx]
      r[label] = years.map((_, i) => base > 0 ? series[label][i] / base : 0)
    }
    return r
  }, [years, series, labels])

  // Unified hover state
  const [hoverYear, setHoverYear] = useState<number | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number, y: number }>({ x: 0, y: 0 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleHover = useCallback((event: any) => {
    const pt = event.points?.[0]
    if (!pt) return
    const year = Math.round(Number(pt.x))
    if (!years.includes(year)) return
    const me = event.event as MouseEvent
    setHoverYear(year)
    setHoverPos({ x: me.clientX, y: me.clientY })
  }, [years])

  const clearHover = useCallback(() => setHoverYear(null), [])

  const hoverProps = { onHover: handleHover, onUnhover: clearHover }

  const iconFns = granularity === 'mode' ? MODE_ICON_FNS : CROSSING_ICON_FNS
  const showSideLegend = wide

  // Compute explicit y-axis range matching what we pass to Plotly
  const yRange = useMemo((): [number, number] => {
    if (view === 'scatter' || view === 'pct') {
      const maxPct = Math.max(...labels.flatMap(l => pct[l]))
      // Round up to next 5% tick above max + small padding
      return [0, Math.ceil((maxPct + 0.025) * 20) / 20]
    }
    if (view === 'recovery') {
      const baseIdx = years.indexOf(BASE_YEAR)
      if (baseIdx === -1) return [0, 1.5]
      const maxR = Math.max(...labels.map(l => {
        const base = series[l][baseIdx]
        return base > 0 ? Math.max(...years.filter(y => y >= BASE_YEAR).map(y => series[l][years.indexOf(y)] / base)) : 0
      }))
      return [0, Math.ceil(maxR * 10) / 10 + 0.1]
    }
    // bar view
    const maxVal = Math.max(...labels.flatMap(l => series[l]))
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal || 1)))
    const step = magnitude / 2
    return [0, Math.ceil(maxVal * 1.05 / step) * step]
  }, [view, years, series, pct, labels])

  const content = (() => {
    if (view === 'scatter') return renderScatter(years, series, pct, labels, colorMap, jitter, canonical && showAnnotations, legendLayout, rightMargin, plotTheme, iconFns, hoverProps, true, yRange, maxSize, narrow)
    if (view === 'bar') return renderBar(years, series, labels, colorMap, legendLayout, rightMargin, plotTheme, hoverProps, true, yRange, narrow)
    if (view === 'recovery') return renderRecovery(years, series, labels, colorMap, legendLayout, rightMargin, plotTheme, hoverProps, true, yRange, narrow)
    return renderPctBar(years, series, labels, colorMap, legendLayout, rightMargin, plotTheme, hoverProps, true, yRange, narrow)
  })()

  // Compute last-year y-axis values for the logo legend (varies by view)
  const lastYValues = useMemo(() => {
    const lastIdx = years.length - 1
    const vals: Record<string, number> = {}
    if (view === 'scatter' || view === 'pct') {
      for (const label of labels) vals[label] = pct[label][lastIdx]
    } else if (view === 'recovery') {
      const baseIdx = years.indexOf(BASE_YEAR)
      for (const label of labels) {
        const base = baseIdx >= 0 ? series[label][baseIdx] : 0
        vals[label] = base > 0 ? series[label][lastIdx] / base : 0
      }
    } else {
      for (const label of labels) vals[label] = series[label][lastIdx]
    }
    return vals
  }, [years, series, pct, labels, view])

  // Chart dimensions for y-alignment
  const chartHeight = view === 'scatter' ? 700 : 600
  const chartMargin = view === 'scatter'
    ? { t: 10, b: 90 }
    : view === 'recovery' ? { t: 10, b: 40 } : { t: 40, b: 40 }

  // Compute last-year bubble pixel positions (legend-relative) for connector lines
  const bubblePixels = useMemo(() => {
    if (view !== 'scatter' || !width) return undefined
    const lastIdx = years.length - 1
    const lastYear = years[lastIdx]
    const maxPassengers = Math.max(...labels.flatMap(l => series[l]))
    const mL = 60
    const xPad = narrow ? 0.4 : 0.8
    const xMin = years[0] - xPad
    const xMax = lastYear + xPad
    const plotW = width - mL - rightMargin
    const legendLeft = width - 150
    const mT = chartMargin.t
    const plotH = chartHeight - mT - chartMargin.b
    const [yMin, yMax] = yRange

    const pixels: Record<string, { x: number; y: number; r: number }> = {}
    for (const label of labels) {
      const jx = getJitteredX(jitter, lastYear, label)
      const xPx = mL + ((jx - xMin) / (xMax - xMin)) * plotW - legendLeft
      const yVal = pct[label][lastIdx]
      const yPx = mT + plotH * (1 - (yVal - yMin) / (yMax - yMin))
      const passengers = series[label][lastIdx]
      const r = Math.sqrt(passengers / maxPassengers) * maxSize / 2
      pixels[label] = { x: xPx, y: yPx, r }
    }
    return pixels
  }, [view, years, series, pct, labels, width, rightMargin, jitter, yRange, chartHeight, chartMargin, maxSize, narrow])

  const yearIdx = hoverYear !== null ? years.indexOf(hoverYear) : -1

  return (
    <div ref={ref}>
      <p className="chart-subtitle">{subtitleText(view, direction, timePeriod)}</p>
      <div className={[showSideLegend ? 'chart-with-legend' : '', narrow ? 'chart-bleed' : ''].filter(Boolean).join(' ') || undefined} key={`${view}-${direction}-${timePeriod}-${granularity}`} onMouseLeave={clearHover}>
        {content}
        {showSideLegend && (
          <LogoLegend
            labels={labels}
            colorMap={colorMap}
            granularity={granularity}
            lastYValues={lastYValues}
            chartHeight={chartHeight}
            margin={chartMargin}
            yRange={yRange}
            bubblePixels={bubblePixels}
          />
        )}
      </div>
      {!showSideLegend && (
        <LogoLegendGrid labels={labels} colorMap={colorMap} granularity={granularity} />
      )}
      {hoverYear !== null && yearIdx >= 0 && (
        <HoverTooltip
          year={hoverYear}
          yearIdx={yearIdx}
          pos={hoverPos}
          labels={labels}
          series={series}
          pct={pct}
          recovery={recovery}
          colorMap={colorMap}
        />
      )}
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
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HoverProps = { onHover: (e: any) => void; onUnhover: () => void }

function HoverTooltip({ year, yearIdx, pos, labels, series, pct, recovery, colorMap }: {
  year: number
  yearIdx: number
  pos: { x: number; y: number }
  labels: string[]
  series: Record<string, number[]>
  pct: Record<string, number[]>
  recovery: Record<string, number[]> | undefined
  colorMap: Record<string, string>
}) {
  const rows = labels
    .map(label => ({
      label,
      color: colorMap[label],
      passengers: series[label][yearIdx],
      pctVal: pct[label][yearIdx],
      recVal: recovery?.[label]?.[yearIdx],
    }))
    .sort((a, b) => b.passengers - a.passengers)

  const total = rows.reduce((s, r) => s + r.passengers, 0)
  const hasRecovery = recovery !== undefined && year >= BASE_YEAR

  // Position: prefer right of cursor, flip left near viewport edge
  const tooltipW = 340
  const tooltipH = rows.length * 24 + 70
  const left = pos.x + 20 + tooltipW > window.innerWidth
    ? pos.x - tooltipW - 10
    : pos.x + 20
  const top = Math.max(10, Math.min(pos.y - tooltipH / 2, window.innerHeight - tooltipH - 10))

  return (
    <div className="hover-tooltip" style={{ position: 'fixed', left, top, pointerEvents: 'none' }}>
      <table>
        <thead>
          <tr>
            <th className="hover-year" colSpan={2}>{year}</th>
            <th className="hover-num">#</th>
            <th className="hover-pct">share</th>
            {hasRecovery && <th className="hover-rec">vs &rsquo;19</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <td><span className="color-dot" style={{ background: r.color }} /></td>
              <td className="hover-name">{r.label}</td>
              <td className="hover-num">{r.passengers.toLocaleString()}</td>
              <td className="hover-pct">{(r.pctVal * 100).toFixed(1)}%</td>
              {hasRecovery && (
                <td className="hover-rec">{r.recVal !== undefined ? `${(r.recVal * 100).toFixed(0)}%` : ''}</td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td></td>
            <td className="hover-name">Total</td>
            <td className="hover-num">{total.toLocaleString()}</td>
            <td></td>
            {hasRecovery && <td></td>}
          </tr>
        </tfoot>
      </table>
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
    xaxis: { gridcolor: pt.grid, zerolinecolor: pt.grid, fixedrange: true },
    yaxis: { gridcolor: pt.grid, zerolinecolor: pt.grid, fixedrange: true },
  }
}

/** Narrow-screen x-axis overrides: 'yy labels at -45° */
function narrowXaxis(years: number[]): Partial<Layout['xaxis']> {
  return {
    tickvals: years,
    ticktext: years.map(y => `'${String(y).slice(2)}`),
    tickangle: -45,
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
  iconFns: Record<string, (color: string) => string>,
  hp: HoverProps,
  hideLegend = false,
  yRange?: [number, number],
  maxSize = 75,
  narrow = false,
) {
  const maxPassengers = Math.max(...labels.flatMap(l => series[l]))

  const traces: Data[] = labels.map((label) => {
    const passengers = series[label]
    const sizes = passengers.map(p => Math.sqrt(p / maxPassengers) * maxSize)
    const texts = passengers.map(p => p >= 800 ? `${Math.round(p / 1000)}k` : '')
    const textSizes = sizes.map(s => Math.max(10, Math.min(16, s * 0.4)))
    const textColor = contrastColor(colorMap[label])
    return {
      type: 'scatter',
      name: label,
      x: years,
      y: pct[label],
      mode: 'text+markers',
      marker: { size: sizes, color: colorMap[label], line: { width: 0 } },
      text: texts,
      textfont: { size: textSizes, color: textColor },
      hoverinfo: 'none',
    } as Data
  })

  const maxYear = Math.max(...years)

  const jx = (traceName: string, yearIdx: number) =>
    getJitteredX(jitter, years[yearIdx], traceName)

  const annotations = showAnnotations
    ? buildCanonicalAnnotations(years, pct, series, maxPassengers, maxSize, jx, { font: pt.annFont, bg: pt.annBg, arrow: pt.font })
    : undefined

  const lastIdx = years.length - 1
  const iconSize = 0.018
  const images = labels.map(label => {
    const iconFn = iconFns[label]
    if (!iconFn) return null
    const icon = iconFn(colorMap[label])
    const lastPct = pct[label][lastIdx]
    const lastP = series[label][lastIdx]
    const bubbleR = Math.sqrt(lastP / maxPassengers) * maxSize
    // Offset x slightly past the bubble
    const xPos = getJitteredX(jitter, years[lastIdx], label) + 0.25 + bubbleR * 0.005
    return {
      source: icon,
      x: xPos,
      y: lastPct,
      xref: 'x' as const,
      yref: 'y' as const,
      xanchor: 'left' as const,
      yanchor: 'middle' as const,
      sizex: iconSize * 8,
      sizey: iconSize,
      opacity: 0.6,
    }
  }).filter(Boolean)

  return (
    <JitteredPlot
      data={traces}
      jitter={jitter}
      layout={{
        ...themedLayout(pt),
        xaxis: {
          dtick: 1,
          range: [years[0] - (narrow ? 0.4 : 0.8), maxYear + (narrow ? 0.4 : 0.8)],
          title: { text: '' },
          hoverformat: 'd',
          gridcolor: pt.grid,
          showspikes: true,
          spikemode: 'across',
          spikecolor: pt.font,
          spikethickness: 1,
          ...(narrow ? narrowXaxis(years) : {}),
        },
        yaxis: {
          title: narrow ? { text: '' } : { text: '% of total passengers (mode share)' },
          tickformat: ',.0%',
          range: yRange,
          gridcolor: pt.grid,
        },
        hovermode: 'x',
        dragmode: false,
        margin: { t: 10, l: narrow ? 35 : 60, r: rightMargin, b: narrow ? 60 : 90 },
        autosize: true,
        annotations: annotations as Layout['annotations'],
        images: images as Layout['images'],
        showlegend: !hideLegend,
        legend: legendLayout,
      }}
      useResizeHandler
      style={{ width: '100%', height: '700px' }}
      config={{ displayModeBar: false, scrollZoom: false }}
      {...hp}
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
  hp: HoverProps,
  hideLegend = false,
  yRange?: [number, number],
  narrow = false,
) {
  return (
    <Plot
      data={labels.map(label => ({
        type: 'bar' as const,
        name: label,
        x: years,
        y: series[label],
        marker: { color: colorMap[label] },
        hoverinfo: 'none' as const,
      }))}
      layout={{
        ...themedLayout(pt),
        xaxis: { dtick: 1, title: { text: '' }, gridcolor: pt.grid, ...(narrow ? narrowXaxis(years) : {}) },
        yaxis: { title: narrow ? { text: '' } : { text: 'Passengers' }, range: yRange, gridcolor: pt.grid },
        hovermode: 'x',
        dragmode: false,
        margin: { t: 40, l: narrow ? 40 : 60, r: rightMargin, b: narrow ? 50 : 40 },
        autosize: true,
        showlegend: !hideLegend,
        legend: legendLayout,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
      config={{ displayModeBar: false, scrollZoom: false }}
      {...hp}
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
  hp: HoverProps,
  hideLegend = false,
  _yRange?: [number, number],
  narrow = false,
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
          hoverinfo: 'none' as const,
        }
      })}
      layout={{
        ...themedLayout(pt),
        barmode: 'stack',
        barnorm: 'percent',
        xaxis: { dtick: 1, title: { text: '' }, gridcolor: pt.grid, ...(narrow ? narrowXaxis(years) : {}) },
        yaxis: { title: narrow ? { text: '' } : { text: '% Passengers' }, gridcolor: pt.grid },
        hovermode: 'x',
        dragmode: false,
        margin: { t: 40, l: narrow ? 35 : 60, r: rightMargin, b: narrow ? 50 : 40 },
        autosize: true,
        showlegend: !hideLegend,
        legend: legendLayout,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
      config={{ displayModeBar: false, scrollZoom: false }}
      {...hp}
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
  hp: HoverProps,
  hideLegend = false,
  yRange?: [number, number],
  narrow = false,
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
        hoverinfo: 'none' as const,
      }))}
      layout={{
        ...themedLayout(pt),
        xaxis: { dtick: 1, title: { text: '' }, gridcolor: pt.grid, ...(narrow ? narrowXaxis(ry) : {}) },
        yaxis: {
          title: narrow ? { text: '' } : { text: `% of ${BASE_YEAR} volume` },
          tickformat: ',.0%',
          range: yRange ?? [0, yMax],
          gridcolor: pt.grid,
        },
        hovermode: 'x',
        dragmode: false,
        shapes: [{
          type: 'line',
          x0: ry[0],
          x1: ry[ry.length - 1],
          y0: 1,
          y1: 1,
          line: { color: '#888', width: 1, dash: 'dash' },
        }],
        margin: { t: 10, l: narrow ? 40 : 70, r: rightMargin, b: narrow ? 50 : 40 },
        autosize: true,
        showlegend: !hideLegend,
        legend: legendLayout,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
      config={{ displayModeBar: false, scrollZoom: false }}
      {...hp}
    />
  )
}
