import Plot from 'react-plotly.js'
import type { CrossingRecord } from '../lib/types'
import { useColors } from '../lib/ColorContext'
import { crossingSeriesArrays, toPercentages } from '../lib/transform'
import { PEAK_BAR_LEGEND } from './peak-legend'

export default function PeakPctBar({ data }: { data: CrossingRecord[] }) {
  const { crossing } = useColors()
  const { years, series, labels } = crossingSeriesArrays(data)
  const pct = toPercentages(years, series, labels)
  return (
    <Plot
      data={labels.map(label => ({
        type: 'bar' as const,
        name: label,
        x: years,
        y: pct[label],
        marker: { color: crossing[label] },
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
