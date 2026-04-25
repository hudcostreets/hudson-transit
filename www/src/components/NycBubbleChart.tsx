// All-sector bubble chart for /nyc — one bubble per (year, sector | mode),
// sized + positioned by share of total CBD-bound persons that year.
// Shares the same primitives as `/`'s UnifiedChart bubble view: useTheme,
// themedLayout, useCustomHover (custom React tooltip), useTraceHighlight,
// JitteredPlot. MVP: bubble view only; bar/pct/recovery deferred (see
// `specs/nyc-bubble.md`).

import { useCallback, useMemo, useRef } from 'react'
import { useUrlState, codeParam } from 'use-prms'
import { useContainerWidth, useBreakpoints, useTheme, useCustomHover, useTraceHighlight } from 'pltly/react'
import type { UseCustomHoverReturn } from 'pltly/react'
import { themedLayout } from 'pltly/plotly'
import type { Layout, PlotData } from 'plotly.js'
import type { CrossingRecord, Direction, TimePeriod } from '../lib/types'
import {
  type AppendixIIIRecord, type NycMode, type Sector,
  NYC_MODE_ORDER, SECTOR_LABELS,
} from '../lib/nyc-types'
import { buildNycRecords } from '../lib/nyc-data'
import { DEFAULT_SCHEME } from '../lib/colors'
import Toggle, { type ToggleOption } from './Toggle'
import JitteredPlot, { type JitterOffsets } from './JitteredPlot'

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

const SECTOR_ORDER: Sector[] = ['60th_street', 'queens', 'brooklyn', 'nj', 'staten_island', 'roosevelt_island']

// Horizontal jitter — small (≤ ±0.18) so Plotly's `x unified` hover still
// snaps every trace into the same year tooltip.
const MODE_JITTER_VALS: Record<NycMode, number> = {
  Subway: 0,
  Bus: -0.09,
  Auto: 0.09,
  Rail: -0.18,
  Ferry: 0.18,
}
const SECTOR_JITTER_VALS: Record<Sector, number> = {
  '60th_street': 0,
  brooklyn: -0.09,
  queens: 0.09,
  nj: -0.18,
  staten_island: 0.18,
  roosevelt_island: 0,
}

interface Props {
  appendixIii: AppendixIIIRecord[]
  vehicles: CrossingRecord[]
}

export default function NycBubbleChart({ appendixIii, vehicles }: Props) {
  const [direction, setDirection] = useUrlState('d', dirParam)
  const [timePeriod, setTimePeriod] = useUrlState('t', timeParam)
  const [granularity, setGranularity] = useUrlState('g', granParam)
  const { theme } = useTheme()

  const { ref, width } = useContainerWidth()
  const { narrow } = useBreakpoints(width)

  const records = useMemo(() => buildNycRecords(appendixIii, vehicles), [appendixIii, vehicles])

  // Aggregate to per-(group, year) series. `series[label][i]` = persons
  // in `years[i]` for that label. `pct` is share of yearly total.
  const { years, series, pct, labels, colorMap, jitter, maxPersons } = useMemo(() => {
    const active = records.filter(r => r.direction === direction && r.time_period === timePeriod)
    const yearSet = new Set(active.map(r => r.year))
    const years = [...yearSet].sort()

    const groups = granularity === 'sector' ? SECTOR_ORDER : NYC_MODE_ORDER
    const groupKey = (r: typeof active[number]) => granularity === 'sector' ? r.sector : r.mode
    const groupLabel = (g: string) => granularity === 'sector' ? SECTOR_LABELS[g as Sector] : g
    const groupColor = (g: string) => granularity === 'sector' ? SECTOR_COLORS[g as Sector] : MODE_COLORS[g as NycMode]
    const groupJitter = (g: string) => granularity === 'sector' ? SECTOR_JITTER_VALS[g as Sector] : MODE_JITTER_VALS[g as NycMode]

    const yearTotals = new Map(years.map(y => [y, 0]))
    for (const r of active) yearTotals.set(r.year, (yearTotals.get(r.year) ?? 0) + r.persons)

    // First pass: compute the global max so bubble sizes scale uniformly.
    const seriesByGroup = new Map<string, number[]>()
    for (const g of groups) {
      seriesByGroup.set(g, years.map(y =>
        active.filter(r => r.year === y && groupKey(r) === g).reduce((s, r) => s + r.persons, 0),
      ))
    }

    const series: Record<string, number[]> = {}
    const pct: Record<string, number[]> = {}
    const colorMap: Record<string, string> = {}
    const jitter: JitterOffsets = {}
    const labels: string[] = []
    let maxPersons = 0
    for (const g of groups) {
      const s = seriesByGroup.get(g)!
      if (s.every(v => v === 0)) continue
      const label = groupLabel(g)
      labels.push(label)
      series[label] = s
      pct[label] = s.map((v, i) => {
        const total = yearTotals.get(years[i]) ?? 0
        return total > 0 ? v / total : 0
      })
      colorMap[label] = groupColor(g)
      const jx = groupJitter(g)
      for (const y of years) {
        if (!jitter[y]) jitter[y] = {}
        jitter[y][label] = jx
      }
      for (const v of s) maxPersons = Math.max(maxPersons, v)
    }

    return { years, series, pct, labels, colorMap, jitter, maxPersons }
  }, [records, direction, timePeriod, granularity])

  const maxSize = narrow ? 60 : 90
  const chartHeight = narrow ? 480 : 620

  // Dynamic Y-axis range. Pad above the largest share by enough to fit the
  // largest bubble's radius — a 90-px bubble at 63 % share extends ~5 % in
  // y-axis units, so a flat 3 % pad clipped the top of the bubble.
  // Solve `yMax = maxShare + (maxSize/2 / chartHeight) * yMax` for yMax,
  // then round up to the next 2 %.
  const yRange: [number, number] = useMemo(() => {
    const maxPct = labels.length ? Math.max(...labels.flatMap(l => pct[l])) : 0.5
    const radiusFrac = (maxSize / 2) / chartHeight  // bubble radius as fraction of chart height
    const ymax = maxPct / (1 - radiusFrac) + 0.01    // +1 % visual breathing room
    return [0, Math.ceil(ymax * 50) / 50]
  }, [labels, pct, maxSize, chartHeight])

  // Custom hover wired through pltly's `useCustomHover` — same setup as
  // `/`'s UnifiedChart so the tooltip is a React-rendered, dark-themed
  // breakdown table instead of Plotly's white default tooltip.
  const chartRef = useRef<HTMLDivElement>(null)
  const emptyData = useMemo(() => [] as import('plotly.js').Data[], [])
  const stableGroupKey = useCallback(() => '', [])
  const stableNormalizeX = useCallback((x: string | number) => Math.round(Number(x)), [])
  const hover = useCustomHover({ data: emptyData, groupKey: stableGroupKey, normalizeX: stableNormalizeX })
  const plotHover = useMemo((): UseCustomHoverReturn => ({
    handleHover: hover.handleHover,
    handleUnhover: hover.handleUnhover,
    handleClick: hover.handleClick,
    dismiss: hover.dismiss,
    handleMouseLeave: hover.handleMouseLeave,
    groups: [], x: null, position: null, isActive: false,
  }), [hover.handleHover, hover.handleUnhover, hover.handleClick, hover.dismiss, hover.handleMouseLeave])

  const hoverYear = hover.isActive && hover.x != null ? Math.round(Number(hover.x)) : null
  const yearIdx = hoverYear !== null ? years.indexOf(hoverYear) : -1
  const chartMarginRef = useRef({ l: narrow ? 50 : 65, r: narrow ? 20 : 60 })
  const xRangeRef = useRef<[number, number]>([years[0] - 0.9, years[years.length - 1] + 1.2])
  chartMarginRef.current = { l: narrow ? 50 : 65, r: narrow ? 20 : 60 }
  xRangeRef.current = [years[0] - 0.9, years[years.length - 1] + 1.2]

  const hoverPos = useMemo(() => {
    if (hoverYear == null || !chartRef.current) return { x: 0, y: 0 }
    const rect = chartRef.current.getBoundingClientRect()
    const { l, r } = chartMarginRef.current
    const [x0, x1] = xRangeRef.current
    const plotW = rect.width - l - r
    const xFrac = (hoverYear - x0) / (x1 - x0)
    return { x: rect.left + l + xFrac * plotW, y: rect.top + rect.height * 0.35 }
  }, [hoverYear])

  // Trace highlight: hovering a legend (or chart) trace fades others.
  const highlight = useTraceHighlight(labels, { debounceMs: 150 })

  // Build Plotly traces from aggregated data.
  const traces: Partial<PlotData>[] = useMemo(() => labels.map(label => {
    const s = series[label]
    const sizes = s.map(p => maxPersons > 0 ? Math.sqrt(p / maxPersons) * maxSize : 0)
    const insideText = s.map(p => p < 1000 ? '' : `${Math.round(p / 1000)}k`)
    return {
      type: 'scatter',
      name: label,
      x: years,
      y: pct[label],
      mode: 'text+markers',
      marker: { size: sizes as unknown as number, color: colorMap[label], line: { width: 0 } },
      text: insideText,
      textposition: 'middle center',
      textfont: { size: (narrow ? 9 : 11) as unknown as number, color: '#fff' },
      hoverinfo: 'none',  // we render the React tooltip ourselves
    } satisfies Partial<PlotData>
  }), [labels, series, pct, years, colorMap, maxSize, narrow, maxPersons])

  const baseLayout = themedLayout(theme)
  const layout: Partial<Layout> = {
    ...baseLayout,
    xaxis: {
      ...baseLayout.xaxis,
      tickvals: years,
      ticktext: years.map(y => `'${String(y).slice(2)}`),
      tickmode: 'array',
      hoverformat: 'd',
      range: [years[0] - 0.9, years[years.length - 1] + 1.2],
      fixedrange: true,
    },
    yaxis: {
      ...baseLayout.yaxis,
      title: { text: narrow ? '' : 'Share of CBD-bound persons', font: { size: 12 } },
      tickformat: '.0%',
      range: yRange,
      fixedrange: true,
    },
    legend: {
      orientation: 'h',
      x: 0.5, y: -0.12,
      xanchor: 'center',
      font: { color: theme.font, size: 11 },
    },
    margin: { t: 8, r: chartMarginRef.current.r, b: 50, l: chartMarginRef.current.l },
    autosize: true,
    showlegend: true,
    hovermode: 'x',
    clickmode: 'event',
  }

  const dirLabel = direction === 'entering' ? 'NJ→NY (entering)' : 'NY→NJ (leaving)'
  const timeLabel = timePeriod === 'peak_1hr' ? (direction === 'entering' ? '8-9am' : '5-6pm') :
                    timePeriod === 'peak_period' ? (direction === 'entering' ? '7-10am' : '4-7pm') : '24hr'

  return (
    <div ref={ref}>
      <h2>CBD-bound persons by {granularity}</h2>
      <p className="chart-subtitle">{dirLabel}, {timeLabel}, all sectors</p>
      <div ref={chartRef} onMouseLeave={hover.handleMouseLeave} style={{ position: 'relative' }}>
        <JitteredPlot
          data={traces}
          highlight={highlight}
          jitter={jitter}
          layout={layout}
          customHover={plotHover}
          style={{ height: narrow ? 480 : 620 }}
        />
        {hoverYear != null && chartRef.current && (() => {
          const { l, r } = chartMarginRef.current
          const [x0, x1] = xRangeRef.current
          const chartW = chartRef.current!.getBoundingClientRect().width
          const plotW = chartW - l - r
          const xFrac = (hoverYear - x0) / (x1 - x0)
          const leftPx = l + xFrac * plotW
          return <div style={{ position: 'absolute', left: leftPx, top: 0, bottom: 0, width: 1, background: theme.font, pointerEvents: 'none', opacity: 0.6 }} />
        })()}
      </div>
      {hoverYear !== null && yearIdx >= 0 && (
        <BubbleHoverTooltip
          year={hoverYear}
          yearIdx={yearIdx}
          pos={hoverPos}
          labels={labels}
          series={series}
          pct={pct}
          colorMap={colorMap}
          activeTrace={highlight.activeTrace}
        />
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
        <Toggle options={GRAN_OPTIONS} value={granularity} onChange={setGranularity} />
        <Toggle options={DIR_OPTIONS} value={direction} onChange={setDirection} />
        <Toggle options={TIME_OPTIONS} value={timePeriod} onChange={setTimePeriod} />
      </div>
    </div>
  )
}

// Same shape as UnifiedChart's HoverTooltip (NJ uses an extra "vs '19"
// recovery column; NYC's MVP doesn't include recovery yet).
function BubbleHoverTooltip({ year, yearIdx, pos, labels, series, pct, colorMap, activeTrace }: {
  year: number
  yearIdx: number
  pos: { x: number; y: number }
  labels: string[]
  series: Record<string, number[]>
  pct: Record<string, number[]>
  colorMap: Record<string, string>
  activeTrace?: string | null
}) {
  const rows = labels
    .map(label => ({
      label, color: colorMap[label],
      persons: series[label][yearIdx],
      pctVal: pct[label][yearIdx],
    }))
    .sort((a, b) => b.persons - a.persons)
  const total = rows.reduce((s, r) => s + r.persons, 0)

  const vw = window.innerWidth
  const isNarrow = vw < 600
  const tooltipH = rows.length * 24 + 70
  let left: number, top: number
  if (isNarrow) {
    const tooltipW = Math.min(vw - 20, 340)
    left = (vw - tooltipW) / 2
    top = Math.max(10, pos.y - tooltipH - 20)
  } else {
    const tooltipW = 340
    left = pos.x + 20 + tooltipW > vw ? pos.x - tooltipW - 10 : pos.x + 20
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
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label} style={activeTrace === r.label ? { fontWeight: 700 } : undefined}>
              <td><span className="color-dot" style={{ background: r.color }} /></td>
              <td className="hover-name">{r.label}</td>
              <td className="hover-num">{r.persons.toLocaleString()}</td>
              <td className="hover-pct">{(r.pctVal * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td></td>
            <td className="hover-name">Total</td>
            <td className="hover-num">{total.toLocaleString()}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
