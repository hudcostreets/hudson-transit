import { useMemo, useCallback, useState } from 'react'
import Plot from 'react-plotly.js'
import type { CrossingRecord, Direction, TimePeriod, Granularity } from '../lib/types'
import { useColors } from '../lib/ColorContext'
import { filterCrossings, crossingSeriesArrays, aggregateByMode } from '../lib/transform'
import Toggle from './Toggle'

const SS_KEY = 'recovery'

function useSS<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(`${SS_KEY}.${key}`)
      return stored !== null ? JSON.parse(stored) : initial
    } catch { return initial }
  })
  const set = useCallback((v: T) => {
    setVal(v)
    try { sessionStorage.setItem(`${SS_KEY}.${key}`, JSON.stringify(v)) } catch {}
  }, [key])
  return [val, set]
}

const DIR_OPTIONS = [
  { value: 'entering' as Direction, label: 'NJ\u2192NY' },
  { value: 'leaving' as Direction, label: 'NY\u2192NJ' },
]

const TIME_OPTIONS = [
  { value: 'peak_1hr' as TimePeriod, label: 'hr' },
  { value: 'peak_period' as TimePeriod, label: '3hr' },
  { value: '24hr' as TimePeriod, label: 'day' },
]

const GRAN_OPTIONS = [
  { value: 'crossing' as Granularity, label: 'crossing' },
  { value: 'mode' as Granularity, label: 'mode' },
]

const BASE_YEAR = 2019

export default function RecoveryLine({ data }: { data: CrossingRecord[] }) {
  const [direction, setDirection] = useSS<Direction>('dir', 'entering')
  const [timePeriod, setTimePeriod] = useSS<TimePeriod>('time', 'peak_1hr')
  const [granularity, setGranularity] = useSS<Granularity>('gran', 'mode')
  const colors = useColors()

  const filtered = useMemo(
    () => filterCrossings(data, direction, timePeriod),
    [data, direction, timePeriod],
  )

  const { years, series, labels } = useMemo(() => {
    if (granularity === 'mode') return aggregateByMode(filtered)
    return crossingSeriesArrays(filtered)
  }, [filtered, granularity])

  const colorMap = granularity === 'mode' ? colors.mode : colors.crossing

  const { recoveryYears, recoverySeries } = useMemo(() => {
    const baseIdx = years.indexOf(BASE_YEAR)
    if (baseIdx === -1) return { recoveryYears: [] as number[], recoverySeries: {} as Record<string, number[]> }
    const ry = years.filter(y => y >= BASE_YEAR)
    const rs: Record<string, number[]> = {}
    for (const label of labels) {
      const base = series[label][baseIdx]
      rs[label] = ry.map(y => {
        const idx = years.indexOf(y)
        return base > 0 ? series[label][idx] / base : 0
      })
    }
    return { recoveryYears: ry, recoverySeries: rs }
  }, [years, series, labels])

  const dir = direction === 'entering' ? 'NJ\u2192NY' : 'NY\u2192NJ'
  const time: Record<TimePeriod, string> = {
    peak_1hr: direction === 'entering' ? '8-9am' : '5-6pm',
    peak_period: direction === 'entering' ? '7-10am' : '4-7pm',
    '24hr': '24hr',
  }
  const subtitle = timePeriod === '24hr'
    ? `${dir}, as % of ${BASE_YEAR}`
    : `${dir}, ${time[timePeriod]}, as % of ${BASE_YEAR}`

  return (
    <div>
      <p className="chart-subtitle">{subtitle}</p>
      <div key={`${direction}-${timePeriod}-${granularity}`}>
        <Plot
          data={labels.map(label => ({
            type: 'scatter' as const,
            name: label,
            x: recoveryYears,
            y: recoverySeries[label],
            mode: 'lines+markers' as const,
            marker: { color: colorMap[label], size: 8 },
            line: { color: colorMap[label], width: 2 },
            hovertemplate: '%{y:.0%}<extra>%{fullData.name}</extra>',
          }))}
          layout={{
            xaxis: { dtick: 1, title: { text: '' } },
            yaxis: {
              title: { text: `% of ${BASE_YEAR} volume` },
              tickformat: ',.0%',
              range: [0, 1.3],
            },
            hovermode: 'x',
            shapes: [{
              type: 'line',
              x0: recoveryYears[0],
              x1: recoveryYears[recoveryYears.length - 1],
              y0: 1,
              y1: 1,
              line: { color: '#888', width: 1, dash: 'dash' },
            }],
            margin: { t: 10, l: 70, r: 20, b: 40 },
            autosize: true,
          }}
          useResizeHandler
          style={{ width: '100%', height: '500px' }}
        />
      </div>
      <div className="toggle-bar">
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
    </div>
  )
}
