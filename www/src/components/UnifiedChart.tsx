import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import Plot from 'react-plotly.js'
import type { Layout, PlotData } from 'plotly.js'
import { useUrlState, codeParam } from 'use-prms'
import type { Param } from 'use-prms'
import { useActions } from 'use-kbd'
import { useContainerWidth, useBreakpoints, useTraceHighlight } from 'pltly/react'
import type { UseTraceHighlightReturn } from 'pltly/react'
import { lerp } from 'pltly/plotly'
import { mobileSafeConfig, mobileSafeLayout } from 'pltly/mobile'
import type { PlotTheme } from 'pltly/plotly'
import type { CrossingRecord, ViewMode, Direction, TimePeriod, Granularity } from '../lib/types'
import { COLOR_SCHEMES } from '../lib/colors'
import { filterCrossings, crossingSeriesArrays, aggregateByMode, toPercentages } from '../lib/transform'
import { repelLabels } from 'pltly/plotly'
import type { RepelPoint, RepelObstacle } from 'pltly/plotly'
import { getJitter, getMaxSize, buildCanonicalAnnotations } from './scatter-config'
import JitteredPlot, { getJitteredX, type JitterOffsets } from './JitteredPlot'
import Toggle, { ToggleButton, type ToggleOption } from './Toggle'
import PalettePicker from './PalettePicker'
import { BubbleIcon, SchemeSwatch } from './icons'
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
const schemeParam = codeParam<SchemeName>('Semantic', [
  ['Semantic', 's'], ['Plotly', 'p'],
])
const SCHEME_OPTIONS: ToggleOption<SchemeName>[] =
  COLOR_SCHEMES.map(s => ({ value: s.name as SchemeName, label: <SchemeSwatch scheme={s} />, tooltip: s.name }))
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
  { value: 'scatter', label: <BubbleIcon />, tooltip: 'Bubble chart' },
  { value: 'bar', label: '#', tooltip: 'Grouped bars' },
  { value: 'pct', label: '%', tooltip: 'Stacked %' },
  { value: 'recovery', label: "vs.\u2009'19", tooltip: 'Recovery vs. 2019' },
]

const DIR_OPTIONS: ToggleOption<Direction>[] = [
  { value: 'entering', label: 'NJ\u2192NY', tooltip: 'Entering NYC' },
  { value: 'leaving', label: 'NY\u2192NJ', tooltip: 'Leaving NYC' },
]

const TIME_OPTIONS: ToggleOption<TimePeriod>[] = [
  { value: 'peak_1hr', label: '1hr', tooltip: 'Peak hour' },
  { value: 'peak_period', label: '3hr', tooltip: 'Peak period' },
  { value: '24hr', label: 'day', tooltip: '24-hour' },
]

const GRAN_OPTIONS: ToggleOption<Granularity>[] = [
  { value: 'crossing', label: 'crossing', tooltip: 'By crossing' },
  { value: 'mode', label: 'mode', tooltip: 'By transport mode' },
]

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
  const { narrow, wide } = useBreakpoints(width)
  const legendLayout = wide ? LEGEND_RIGHT : LEGEND_BOTTOM
  const rightMargin = wide ? 160 : 10
  const [sizeMin, sizeMax] = getMaxSize(direction, timePeriod, granularity)
  const maxSize = Math.round(lerp(width || 1000, 400, 1000, sizeMin, sizeMax))

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
  const chartRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleHover = useCallback((event: any) => {
    const pt = event.points?.[0]
    if (!pt) return
    const year = Math.round(Number(pt.x))
    if (!years.includes(year)) return
    const raw = event.event
    if (typeof raw?.clientX === 'number') {
      setHoverPos({ x: raw.clientX, y: raw.clientY })
    }
    setHoverYear(year)
  }, [years])

  const clearHover = useCallback(() => setHoverYear(null), [])

  // Click handler for mobile tap-to-hover (Plotly reliably fires plotly_click on touch)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = useCallback((event: any) => {
    const pt = event.points?.[0]
    if (!pt) return
    const year = Math.round(Number(pt.x))
    if (!years.includes(year)) return
    const raw = event.event
    if (hoverYear === year) {
      setHoverYear(null)
    } else {
      setHoverYear(year)
      if (typeof raw?.clientX === 'number') {
        setHoverPos({ x: raw.clientX, y: raw.clientY })
      }
    }
  }, [years, hoverYear])

  // Refs for chart margin/xRange (used by touch position calculation)
  const chartMarginRef = useRef({ l: 60, r: 10 })
  const xRangeRef = useRef<[number, number]>([years[0] - 0.8, years[years.length - 1] + 0.8])

  const hoverProps = { onHover: handleHover, onUnhover: clearHover, onClick: handleClick }

  const highlight = useTraceHighlight(labels)

  const iconFns = granularity === 'mode' ? MODE_ICON_FNS : CROSSING_ICON_FNS
  const showSideLegend = wide

  // Compute explicit y-axis range matching what we pass to Plotly
  const yRange = useMemo((): [number, number] => {
    if (view === 'scatter' || view === 'pct') {
      const maxPct = Math.max(...labels.flatMap(l => pct[l]))
      // Round up to next 2% above max + 3% padding for bubble radius clearance
      return [0, Math.ceil((maxPct + 0.03) * 50) / 50]
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

  // Keep touch handler refs in sync with current chart margins/xRange
  if (view === 'scatter') {
    const xPad = narrow ? 0.4 : 0.8
    const xRightPad = narrow ? 0.7 : 0.8
    chartMarginRef.current = { l: narrow ? 35 : 60, r: rightMargin }
    xRangeRef.current = [years[0] - xPad, years[years.length - 1] + xRightPad]
  } else if (view === 'recovery') {
    const ry = years.filter(y => y >= BASE_YEAR)
    chartMarginRef.current = { l: narrow ? 40 : 70, r: rightMargin }
    xRangeRef.current = [ry[0] - 0.5, ry[ry.length - 1] + 0.5]
  } else {
    chartMarginRef.current = { l: narrow ? 40 : 60, r: rightMargin }
    xRangeRef.current = [years[0] - 0.5, years[years.length - 1] + 0.5]
  }

  const content = (() => {
    if (view === 'scatter') return renderScatter(years, series, pct, labels, colorMap, jitter, canonical && showAnnotations, legendLayout, rightMargin, plotTheme, iconFns, hoverProps, true, yRange, maxSize, narrow, width, highlight)
    if (view === 'bar') return renderBar(years, series, labels, colorMap, legendLayout, rightMargin, plotTheme, hoverProps, true, yRange, narrow, highlight)
    if (view === 'recovery') return renderRecovery(years, series, labels, colorMap, legendLayout, rightMargin, plotTheme, hoverProps, true, yRange, narrow, highlight)
    return renderPctBar(years, series, labels, colorMap, legendLayout, rightMargin, plotTheme, hoverProps, true, yRange, narrow, highlight)
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

  // Chart dimensions for y-alignment — must match Plotly layout margins exactly
  const chartHeight = view === 'scatter' ? (narrow ? 580 : 700) : 600
  const chartMargin = view === 'scatter'
    ? { t: 5, b: narrow ? 50 : 55 }
    : view === 'recovery' ? { t: 10, b: narrow ? 50 : 40 } : { t: 40, b: narrow ? 50 : 40 }

  // Compute last-year bubble pixel positions (legend-relative) for connector lines
  const bubblePixels = useMemo(() => {
    if (view !== 'scatter' || !width) return undefined
    const lastIdx = years.length - 1
    const lastYear = years[lastIdx]
    const maxPassengers = Math.max(...labels.flatMap(l => series[l]))
    const mL = chartMarginRef.current.l
    const mR = chartMarginRef.current.r
    const [xMin, xMax] = xRangeRef.current
    const plotW = width - mL - mR
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are set above, deps cover all changing inputs
  }, [view, years, series, pct, labels, width, rightMargin, narrow, jitter, yRange, chartHeight, chartMargin, maxSize])

  const yearIdx = hoverYear !== null ? years.indexOf(hoverYear) : -1

  return (
    <div ref={ref}>
      <h2>NJ&rarr;NY passengers by mode/crossing</h2>
      <p className="chart-subtitle">{subtitleText(view, direction, timePeriod)}</p>
      <div ref={chartRef} className={[showSideLegend ? 'chart-with-legend' : '', narrow ? 'chart-bleed' : ''].filter(Boolean).join(' ') || undefined} key={`${view}-${direction}-${timePeriod}-${granularity}`} onMouseLeave={clearHover}>
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
            highlight={highlight}
          />
        )}
      </div>
      {!showSideLegend && (
        <LogoLegendGrid labels={labels} colorMap={colorMap} granularity={granularity} containerWidth={width} highlight={highlight} />
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
          <ToggleButton
            active={showAnnotations}
            onClick={() => setShowAnnotations(!showAnnotations)}
            tooltip={showAnnotations ? 'Hide annotations' : 'Show annotations'}
          >
            {'\u{1F4DD}'}
          </ToggleButton>
        )}
        <PalettePicker options={SCHEME_OPTIONS} value={schemeName} onChange={setSchemeName} />
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HoverProps = { onHover: (e: any) => void; onUnhover: () => void; onClick?: (e: any) => void }

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

  const vw = window.innerWidth
  const isNarrow = vw < 600
  const tooltipH = rows.length * 24 + 70

  // Narrow: center horizontally, position above touch point
  // Wide: prefer right of cursor, flip left near edge
  let left: number
  let top: number
  if (isNarrow) {
    const tooltipW = Math.min(vw - 20, 340)
    left = (vw - tooltipW) / 2
    top = Math.max(10, pos.y - tooltipH - 20)
  } else {
    const tooltipW = 340
    left = pos.x + 20 + tooltipW > vw
      ? pos.x - tooltipW - 10
      : pos.x + 20
    top = Math.max(10, Math.min(pos.y - tooltipH / 2, window.innerHeight - tooltipH - 10))
  }

  return (
    <div className="hover-tooltip" style={{ position: 'fixed', left, top, pointerEvents: 'none', maxWidth: isNarrow ? 'calc(100vw - 20px)' : undefined }}>
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

const mobileLayout = mobileSafeLayout()
const mobileConfig = mobileSafeConfig()

function themedLayout(pt: PlotTheme): Partial<Layout> {
  return {
    ...mobileLayout,
    paper_bgcolor: pt.bg,
    plot_bgcolor: pt.bg,
    font: { color: pt.font },
    xaxis: { ...mobileLayout.xaxis, gridcolor: pt.grid, zerolinecolor: pt.grid },
    yaxis: { ...mobileLayout.yaxis, gridcolor: pt.grid, zerolinecolor: pt.grid },
  }
}

/** 'yy tick labels; angled on narrow screens */
function yearTicks(years: number[], narrow: boolean): Partial<Layout['xaxis']> {
  return {
    tickvals: years,
    ticktext: years.map(y => `'${String(y).slice(2)}`),
    ...(narrow ? { tickangle: -45 } : {}),
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
  containerWidth = 1000,
  highlight?: UseTraceHighlightReturn,
) {
  const maxPassengers = Math.max(...labels.flatMap(l => series[l]))

  const jx = (traceName: string, yearIdx: number) =>
    getJitteredX(jitter, years[yearIdx], traceName)

  const fontSize = narrow ? 9 : 11
  // Measure actual text width via canvas to decide if it fits inside the bubble
  const measureCtx = (() => {
    if (typeof document === 'undefined') return null
    const c = document.createElement('canvas').getContext('2d')
    if (c) c.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
    return c
  })()
  const textFitsInside = (text: string, markerDiameter: number) => {
    const w = measureCtx ? measureCtx.measureText(text).width : text.length * fontSize * 0.6
    return markerDiameter >= w + 6 // 6px padding
  }

  const traces = labels.map((label) => {
    const passengers = series[label]
    const sizes = passengers.map(p => Math.sqrt(p / maxPassengers) * maxSize)
    // Large enough bubbles get text inside
    const texts = passengers.map((p, i) => {
      if (p < 800) return ''
      const text = `${Math.round(p / 1000)}k`
      return textFitsInside(text, sizes[i]) ? text : ''
    })
    const textSizes = sizes.map(s => Math.max(10, Math.min(16, s * 0.4)))
    return {
      type: 'scatter',
      name: label,
      x: years,
      y: pct[label],
      mode: 'text+markers',
      marker: { size: sizes, color: colorMap[label], line: { width: 0 } },
      text: texts,
      textposition: 'middle center',
      textfont: { size: textSizes as unknown as number, color: '#fff' },
      hoverinfo: 'none',
    } as Partial<PlotData>
  }) as Partial<PlotData>[]

  const maxYear = Math.max(...years)

  // Build repel points for small-bubble labels (text outside) + obstacles for all other bubbles
  const margin = { t: 5, l: narrow ? 35 : 60, r: rightMargin, b: narrow ? 50 : 55 }
  const xRange: [number, number] = [years[0] - (narrow ? 0.4 : 0.8), maxYear + (narrow ? 0.7 : 0.8)]
  const computedYRange = yRange ?? [0, 0.4]

  // Anchor trace at exact integer years — spike line snaps here instead of jittered x-values
  const midY = (computedYRange[0] + computedYRange[1]) / 2
  traces.unshift({
    type: 'scatter',
    x: years,
    y: years.map(() => midY),
    mode: 'markers',
    marker: { size: 40, color: 'rgba(0,0,0,0)' },
    hoverinfo: 'none',
    showlegend: false,
  } as Partial<PlotData>)
  const repelPoints: RepelPoint[] = []
  const obstacles: RepelObstacle[] = []
  for (const label of labels) {
    const passengers = series[label]
    for (let i = 0; i < years.length; i++) {
      const p = passengers[i]
      const s = Math.sqrt(p / maxPassengers) * maxSize
      const jitteredX = getJitteredX(jitter, years[i], label)
      const yVal = pct[label][i]
      if (p < 800) {
        // Tiny bubbles are still obstacles
        if (s > 2) obstacles.push({ x: jitteredX, y: yVal, size: s })
        continue
      }
      const text = `${Math.round(p / 1000)}k`
      if (textFitsInside(text, s)) {
        // Large bubbles with inside text: obstacle only (no outside label needed)
        obstacles.push({ x: jitteredX, y: yVal, size: s })
      } else {
        // Small-to-medium bubbles: need outside label (already an obstacle via RepelPoint.markerSize)
        repelPoints.push({ x: jitteredX, y: yVal, markerSize: s, text, group: label })
      }
    }
  }

  // Build canonical annotations first so their bounding boxes are repel obstacles
  const canonical_ = showAnnotations
    ? buildCanonicalAnnotations(years, pct, series, maxPassengers, maxSize, jx, { font: pt.annFont, bg: pt.annBg, arrow: pt.font }, narrow)
    : null

  const { annotations: repelAnnotations } = repelLabels(repelPoints, {
    plotWidth: containerWidth,
    plotHeight: narrow ? 580 : 700,
    xRange,
    yRange: computedYRange,
    margin,
    fontSize,
    standoff: 3,
    textColor: pt.font,
    obstacles,
    lineObstacles: canonical_?.lineObstacles,
    rectObstacles: canonical_?.rectObstacles,
    distanceFactors: [1],
    maxIter: 0,
  })

  // Fade repel labels for non-active traces
  const fadedRepelAnnotations = highlight?.activeTrace
    ? repelAnnotations.map((ann, i) => {
        const group = repelPoints[i]?.group
        if (group && group !== highlight.activeTrace) {
          return { ...ann, opacity: 0.15 }
        }
        return ann
      })
    : repelAnnotations

  const annotations = [...(canonical_?.annotations ?? []), ...fadedRepelAnnotations]
  const canonicalShapes = canonical_?.shapes ?? []

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

  const styledTraces = highlight ? highlight.fadeTraces(traces) : traces

  return (
    <JitteredPlot
      data={styledTraces}
      jitter={jitter}
      layout={{
        ...themedLayout(pt),
        xaxis: {
          dtick: 1,
          range: xRange,
          fixedrange: true,
          title: { text: '' },
          hoverformat: 'd',
          gridcolor: pt.grid,
          showspikes: true,
          spikemode: 'across',
          spikesnap: 'data',
          spikecolor: pt.font,
          spikethickness: 1,
          ...yearTicks(years, narrow),
        },
        yaxis: {
          title: narrow ? { text: '' } : { text: '% of total passengers (mode share)' },
          tickformat: ',.0%',
          range: computedYRange,
          fixedrange: true,
          gridcolor: pt.grid,
        },
        hovermode: 'x',
        clickmode: 'event',
        margin,
        autosize: true,
        annotations: annotations.length ? (annotations as Layout['annotations']).map(a => ({ ...a, captureevents: false })) : undefined,
        shapes: canonicalShapes.length ? canonicalShapes as Layout['shapes'] : undefined,
        images: images as Layout['images'],
        showlegend: !hideLegend,
        legend: legendLayout,
      }}
      useResizeHandler
      style={{ width: '100%', height: narrow ? '580px' : '700px' }}
      config={mobileConfig}
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
  highlight?: UseTraceHighlightReturn,
) {
  const traces = labels.map(label => ({
    type: 'bar' as const,
    name: label,
    x: years,
    y: series[label],
    marker: { color: colorMap[label] },
    hoverinfo: 'none' as const,
  }))
  return (
    <Plot
      data={highlight ? highlight.fadeTraces(traces) : traces}
      layout={{
        ...themedLayout(pt),
        xaxis: { dtick: 1, fixedrange: true, title: { text: '' }, gridcolor: pt.grid, ...yearTicks(years, narrow) },
        yaxis: { fixedrange: true, title: narrow ? { text: '' } : { text: 'Passengers' }, range: yRange, gridcolor: pt.grid },
        hovermode: 'x',
        clickmode: 'event',
        margin: { t: 40, l: narrow ? 40 : 60, r: rightMargin, b: narrow ? 50 : 40 },
        autosize: true,
        showlegend: !hideLegend,
        legend: legendLayout,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
      config={mobileConfig}
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
  highlight?: UseTraceHighlightReturn,
) {
  const totals = years.map((_, i) =>
    labels.reduce((sum, l) => sum + (series[l]?.[i] ?? 0), 0)
  )
  const traces = labels.map(label => {
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
      insidetextanchor: 'middle' as const,
      constraintext: 'none' as const,
      textfont: { size: 11 },
      hoverinfo: 'none' as const,
    }
  })
  return (
    <Plot
      data={highlight ? highlight.fadeTraces(traces) : traces}
      layout={{
        ...themedLayout(pt),
        barmode: 'stack',
        barnorm: 'percent',
        xaxis: { dtick: 1, fixedrange: true, title: { text: '' }, gridcolor: pt.grid, ...yearTicks(years, narrow) },
        yaxis: { fixedrange: true, title: narrow ? { text: '' } : { text: '% Passengers' }, gridcolor: pt.grid },
        hovermode: 'x',
        clickmode: 'event',
        margin: { t: 40, l: narrow ? 35 : 60, r: rightMargin, b: narrow ? 50 : 40 },
        autosize: true,
        showlegend: !hideLegend,
        legend: legendLayout,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
      config={mobileConfig}
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
  highlight?: UseTraceHighlightReturn,
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

  const traces = labels.map(label => ({
    type: 'scatter' as const,
    name: label,
    x: ry,
    y: rs[label],
    mode: 'lines+markers' as const,
    marker: { color: colorMap[label], size: 8 },
    line: { color: colorMap[label], width: 2 },
    hoverinfo: 'none' as const,
  }))
  return (
    <Plot
      data={highlight ? highlight.fadeTraces(traces) : traces}
      layout={{
        ...themedLayout(pt),
        xaxis: { dtick: 1, fixedrange: true, title: { text: '' }, gridcolor: pt.grid, ...yearTicks(ry, narrow) },
        yaxis: {
          fixedrange: true,
          title: narrow ? { text: '' } : { text: `% of ${BASE_YEAR} volume` },
          tickformat: ',.0%',
          range: yRange ?? [0, yMax],
          gridcolor: pt.grid,
        },
        hovermode: 'x',
        clickmode: 'event',
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
      config={mobileConfig}
      {...hp}
    />
  )
}
