import Plot from 'react-plotly.js'
import type { ModeRecord } from '../lib/types'
import { DAY_MODES } from '../lib/types'
import { useColors } from '../lib/ColorContext'
import { modeSeriesArrays, toPercentages } from '../lib/transform'

export default function DayPctBar({ data }: { data: ModeRecord[] }) {
  const { dayMode } = useColors()
  const { years, series } = modeSeriesArrays(data)
  const pct = toPercentages(years, series, DAY_MODES)
  return (
    <Plot
      data={DAY_MODES.map(mode => ({
        type: 'bar' as const,
        name: mode,
        x: years,
        y: pct[mode],
        marker: { color: dayMode[mode] },
      }))}
      layout={{
        barmode: 'stack',
        xaxis: { dtick: 1, title: { text: '' } },
        yaxis: { title: { text: '% People' }, tickformat: ',.0%', range: [0, 1] },
        hovermode: 'x',
        legend: { traceorder: 'reversed' },
        margin: { t: 10, l: 70, r: 20, b: 40 },
        autosize: true,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
    />
  )
}
