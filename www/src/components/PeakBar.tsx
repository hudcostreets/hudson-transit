import Plot from 'react-plotly.js'
import type { CrossingRecord } from '../lib/types'
import { CROSSING_COLORS } from '../lib/colors'
import { crossingSeriesArrays } from '../lib/transform'
import { peakLegendLayout, PEAK_BAR_LEGEND_ORDER } from './peak-legend'

export default function PeakBar({ data }: { data: CrossingRecord[] }) {
  const { years, series, labels } = crossingSeriesArrays(data)
  return (
    <Plot
      data={labels.map((label, i) => ({
        type: 'bar' as const,
        name: label,
        x: years,
        y: series[label],
        marker: { color: CROSSING_COLORS[label] },
        legend: `legend${i + 1 === 1 ? '' : i + 1}`,
      }))}
      layout={{
        title: { text: 'NJ\u2192NY passengers, by mode/location<br><sub>8-9am, Fall business day</sub>' },
        xaxis: { dtick: 1, title: { text: '' } },
        yaxis: { title: { text: 'Passengers' } },
        hovermode: 'x',
        margin: { t: 75, l: 60, r: 10, b: 90 },
        autosize: true,
        ...peakLegendLayout(PEAK_BAR_LEGEND_ORDER),
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
    />
  )
}
