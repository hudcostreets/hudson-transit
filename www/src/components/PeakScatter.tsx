import Plot from 'react-plotly.js'
import type { CrossingRecord } from '../lib/types'
import { CROSSING_COLORS } from '../lib/colors'
import { crossingSeriesArrays, toPercentages } from '../lib/transform'
import { peakLegendLayout, PEAK_SCATTER_LEGEND_ORDER } from './peak-legend'
import type { Data, Layout } from 'plotly.js'

export default function PeakScatter({ data }: { data: CrossingRecord[] }) {
  const { years, series, labels } = crossingSeriesArrays(data)
  const pct = toPercentages(years, series, labels)

  const maxPassengers = Math.max(
    ...labels.flatMap(l => series[l])
  )
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
      marker: {
        size: sizes,
        color: CROSSING_COLORS[label],
      },
      text: texts,
      textfont: { size: 10 },
      customdata: passengers,
      hovertemplate: '%{customdata} (%{y:.1%})<extra></extra>',
      legend: `legend${i + 1 === 1 ? '' : i + 1}`,
    } as Data
  })

  const maxYear = Math.max(...years)
  const annotations: Partial<Layout['annotations']> = [
    {
      text: '1 bus lane:<br>30k-40k ppl/lane/hr<br>20-30 ppl/vehicle',
      ax: maxYear - 0.6, ay: 0.375,
      axref: 'x' as const, ayref: 'y' as const,
      x: maxYear - 1, y: 0.334,
      font: { color: 'rgba(0,0,0,0)' },
      arrowcolor: '#444',
    },
    {
      text: '1 bus lane:<br>30k-40k ppl/lane/hr<br>20-30 ppl/vehicle',
      ax: maxYear - 0.6, ay: 0.375,
      axref: 'x' as const, ayref: 'y' as const,
      x: maxYear - 0.1, y: 0.334,
      font: { color: 'rgba(0,0,0,1)' },
      arrowcolor: '#444',
    },
    ...[
      { x: maxYear - 0.93, y: 0.038 },
      { x: maxYear - 0.86, y: 0.036 },
      { x: maxYear - 0.18, y: 0.112 },
      { x: maxYear - 0.1, y: 0.069 },
    ].map(({ x, y }, idx) => ({
      text: '3+2 car lanes:<br>< 2k ppl/lane/hr<br>1.3 ppl/vehicle',
      ax: maxYear - 0.2, ay: 0.08,
      axref: 'x' as const, ayref: 'y' as const,
      x, y,
      font: { color: `rgba(0,0,0,${idx === 0 ? 1 : 0})` },
      arrowcolor: '#444',
    })),
  ]

  return (
    <Plot
      data={traces}
      layout={{
        title: { text: 'NJ\u2192NY passengers, by mode/location<br><sub>8-9am, Fall business day</sub>' },
        xaxis: {
          dtick: 1,
          range: [years[0] - 0.8, maxYear + 0.5],
          title: { text: '' },
        },
        yaxis: {
          title: { text: '% of total passengers (mode share)' },
          tickformat: ',.0%',
          range: [0, 0.4],
        },
        hovermode: 'x',
        ...({ scattermode: 'group', scattergap: 0.9 } as Partial<Layout>),
        margin: { t: 75, l: 60, r: 10, b: 90 },
        autosize: true,
        annotations: annotations as Layout['annotations'],
        ...peakLegendLayout(PEAK_SCATTER_LEGEND_ORDER, { dy: -0.04 }),
      }}
      useResizeHandler
      style={{ width: '100%', height: '700px' }}
    />
  )
}
