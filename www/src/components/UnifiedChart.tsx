import { useState, useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { Data, Layout } from 'plotly.js'
import type { CrossingRecord, ViewMode, Direction, TimePeriod, Granularity } from '../lib/types'
import { useColors } from '../lib/ColorContext'
import { filterCrossings, crossingSeriesArrays, aggregateByMode, toPercentages } from '../lib/transform'
import { JITTER, buildCanonicalAnnotations } from './scatter-config'
import { peakLegendLayout, PEAK_SCATTER_LEGEND_ORDER, PEAK_BAR_LEGEND } from './peak-legend'
import JitteredPlot, { getJitteredX } from './JitteredPlot'
import Toggle from './Toggle'

const VIEW_OPTIONS = [
  { value: 'scatter' as ViewMode, label: '\u{1FAE7}' },
  { value: 'bar' as ViewMode, label: '#' },
  { value: 'pct' as ViewMode, label: '%' },
]

const DIR_OPTIONS = [
  { value: 'entering' as Direction, label: 'NJ\u2192NY' },
  { value: 'leaving' as Direction, label: 'NY\u2192NJ' },
]

const TIME_OPTIONS = [
  { value: 'peak_1hr' as TimePeriod, label: 'hr' },
  { value: 'peak_period' as TimePeriod, label: 'prd' },
  { value: '24hr' as TimePeriod, label: 'day' },
]

const GRAN_OPTIONS = [
  { value: 'crossing' as Granularity, label: 'crossing' },
  { value: 'mode' as Granularity, label: 'mode' },
]

function subtitleText(direction: Direction, timePeriod: TimePeriod): string {
  const dir = direction === 'entering' ? 'NJ\u2192NY' : 'NY\u2192NJ'
  const time: Record<TimePeriod, string> = {
    peak_1hr: direction === 'entering' ? '8-9am' : '5-6pm',
    peak_period: direction === 'entering' ? '7-10am' : '4-7pm',
    '24hr': '24hr',
  }
  const suffix = timePeriod === '24hr' ? 'Fall business day' : `${time[timePeriod]}, Fall business day`
  return `${dir}, ${suffix}`
}

/** Whether the current combination matches the "canonical" scatter view */
function isCanonical(direction: Direction, timePeriod: TimePeriod, granularity: Granularity): boolean {
  return direction === 'entering' && timePeriod === 'peak_1hr' && granularity === 'crossing'
}

export default function UnifiedChart({ data }: { data: CrossingRecord[] }) {
  const [view, setView] = useState<ViewMode>('scatter')
  const [direction, setDirection] = useState<Direction>('entering')
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('peak_1hr')
  const [granularity, setGranularity] = useState<Granularity>('crossing')
  const colors = useColors()

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

  const content = useMemo(() => {
    if (view === 'scatter') return renderScatter(years, series, pct, labels, colorMap, canonical)
    if (view === 'bar') return renderBar(years, series, labels, colorMap)
    return renderPctBar(years, pct, labels, colorMap)
  }, [view, years, series, pct, labels, colorMap, canonical])

  return (
    <div>
      <div className="toggle-bar">
        <Toggle
          options={VIEW_OPTIONS.map(o => o.label)}
          value={VIEW_OPTIONS.find(o => o.value === view)!.label}
          onChange={label => setView(VIEW_OPTIONS.find(o => o.label === label)!.value)}
        />
        <Toggle
          options={DIR_OPTIONS.map(o => o.label)}
          value={DIR_OPTIONS.find(o => o.value === direction)!.label}
          onChange={label => setDirection(DIR_OPTIONS.find(o => o.label === label)!.value)}
        />
        <Toggle
          options={TIME_OPTIONS.map(o => o.label)}
          value={TIME_OPTIONS.find(o => o.value === timePeriod)!.label}
          onChange={label => setTimePeriod(TIME_OPTIONS.find(o => o.label === label)!.value)}
        />
        <Toggle
          options={GRAN_OPTIONS.map(o => o.label)}
          value={GRAN_OPTIONS.find(o => o.value === granularity)!.label}
          onChange={label => setGranularity(GRAN_OPTIONS.find(o => o.label === label)!.value)}
        />
      </div>
      <p className="chart-subtitle">{subtitleText(direction, timePeriod)}</p>
      {content}
    </div>
  )
}

function renderScatter(
  years: number[],
  series: Record<string, number[]>,
  pct: Record<string, number[]>,
  labels: string[],
  colorMap: Record<string, string>,
  canonical: boolean,
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
      legend: `legend${i + 2}`,
    } as Data
  })

  const maxYear = Math.max(...years)
  const jitter = canonical ? JITTER : undefined

  const jx = (traceName: string, yearIdx: number) =>
    getJitteredX(jitter, years[yearIdx], traceName)

  const annotations = canonical
    ? buildCanonicalAnnotations(years, pct, series, maxPassengers, maxSize, jx)
    : undefined

  const extraLayout = canonical
    ? peakLegendLayout(PEAK_SCATTER_LEGEND_ORDER, { dy: -0.04 })
    : {}

  return (
    <JitteredPlot
      data={traces}
      jitter={jitter}
      layout={{
        xaxis: {
          dtick: 1,
          range: [years[0] - 0.8, maxYear + 0.5],
          title: { text: '' },
          hoverformat: 'd',
        },
        yaxis: {
          title: { text: '% of total passengers (mode share)' },
          tickformat: ',.0%',
          range: [0, 0.4],
        },
        hovermode: 'x',
        margin: { t: 10, l: 60, r: 10, b: 90 },
        autosize: true,
        annotations: annotations as Layout['annotations'],
        ...extraLayout,
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
        xaxis: { dtick: 1, title: { text: '' } },
        yaxis: { title: { text: 'Passengers' } },
        hovermode: 'x',
        margin: { t: 40, l: 60, r: 10, b: 40 },
        autosize: true,
        legend: PEAK_BAR_LEGEND,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
    />
  )
}

function renderPctBar(
  years: number[],
  pct: Record<string, number[]>,
  labels: string[],
  colorMap: Record<string, string>,
) {
  return (
    <Plot
      data={labels.map(label => ({
        type: 'bar' as const,
        name: label,
        x: years,
        y: pct[label],
        marker: { color: colorMap[label] },
      }))}
      layout={{
        xaxis: { dtick: 1, title: { text: '' } },
        yaxis: { title: { text: '% Passengers' }, tickformat: ',.0%' },
        hovermode: 'x',
        margin: { t: 40, l: 60, r: 10, b: 40 },
        autosize: true,
        legend: PEAK_BAR_LEGEND,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
    />
  )
}
