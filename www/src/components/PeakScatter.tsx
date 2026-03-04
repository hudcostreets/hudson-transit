import Plot from 'react-plotly.js'
import type { CrossingRecord } from '../lib/types'
import { useColors } from '../lib/ColorContext'
import { crossingSeriesArrays, toPercentages } from '../lib/transform'
import { peakLegendLayout, PEAK_SCATTER_LEGEND_ORDER } from './peak-legend'
import type { Data, Layout } from 'plotly.js'

export default function PeakScatter({ data }: { data: CrossingRecord[] }) {
  const { crossing } = useColors()
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
        color: crossing[label],
      },
      text: texts,
      textfont: { size: 10 },
      customdata: passengers,
      hovertemplate: '%{customdata} (%{y:.1%})<extra></extra>',
      legend: `legend${i + 1 === 1 ? '' : i + 1}`,
    } as Data
  })

  const maxYear = Math.max(...years)
  const lastIdx = years.length - 1
  const prevIdx = years.length - 2

  // Compute bubble radius (in px) for a given passenger count
  const bubbleRadius = (passengers: number) =>
    Math.sqrt(passengers / maxPassengers) * maxSize / 2

  // Get actual pct values and passenger counts for annotation targets
  const lincolnBusPct = pct['Lincoln (Bus)']
  const lincolnBusP = series['Lincoln (Bus)']
  const lincolnAutosPct = pct['Lincoln (Autos)']
  const lincolnAutosP = series['Lincoln (Autos)']
  const hollandAutosPct = pct['Holland (Autos)']
  const hollandAutosP = series['Holland (Autos)']

  // Bus and car annotations: centered between the two most recent years, lowered for shallower angles
  const annX = (years[prevIdx] + years[lastIdx]) / 2

  // Bus annotation: anchor text between the two most recent Lincoln Bus points
  const busTextYBottom = Math.max(
    lincolnBusPct[lastIdx],
    lincolnBusPct[prevIdx],
    ) + 0.025

  const busTargets = [
    { ay: busTextYBottom + .005, x: years[prevIdx], y: lincolnBusPct[prevIdx], p: lincolnBusP[prevIdx], },
    { ay: busTextYBottom + .005, x: years[lastIdx], y: lincolnBusPct[lastIdx], p: lincolnBusP[lastIdx] * 1.5, },
  ]

  const carTextYBottom = Math.max(
    lincolnAutosPct[lastIdx],
    lincolnAutosPct[prevIdx],
    hollandAutosPct[lastIdx],
    hollandAutosPct[prevIdx],
  ) + 0.02

  const carTargets = [
    { ay: carTextYBottom + .01 , x: years[prevIdx], y: lincolnAutosPct[prevIdx], p: lincolnAutosP[prevIdx], },
    { ay: carTextYBottom + .01 , x: years[lastIdx], y: lincolnAutosPct[lastIdx], p: lincolnAutosP[lastIdx] * 1.5, },
    { ay: carTextYBottom + .005, x: years[prevIdx] + .1, y: hollandAutosPct[prevIdx] - .004, p: hollandAutosP[prevIdx], },
    { ay: carTextYBottom + .005, x: years[lastIdx] - .02, y: hollandAutosPct[lastIdx] - .001, p: hollandAutosP[lastIdx], },
  ]

  const annotations: Partial<Layout['annotations']> = [
    // Bus lane: two arrows from label to Lincoln Bus data points
    ...busTargets.map(({ ay, x, y, p }) => ({
      ax: annX, ay,
      axref: 'x' as const, ayref: 'y' as const,
      yanchor: 'bottom' as const,
      x, y,
      standoff: bubbleRadius(p),
      arrowcolor: '#444',
      arrowhead: 0,
    })),
    {
      text: '1 bus lane:<br>30k-40k ppl/lane/hr<br>20-30 ppl/vehicle',
      ax: annX, ay: busTextYBottom,
      yanchor: 'bottom' as const,
      axref: 'x' as const, ayref: 'y' as const,
      x: years[prevIdx], y: lincolnBusPct[prevIdx],
      font: { color: 'black' },
      arrowcolor: 'rgba(0,0,0,0)',
      bgcolor: 'white',
    },
    // Car lanes: all 4 lines start from the same point below the text
    ...carTargets.map(({ ay, x, y, p }) => ({
      ax: annX, ay,
      axref: 'x' as const, ayref: 'y' as const,
      yanchor: 'bottom' as const,
      x, y,
      standoff: bubbleRadius(p),
      arrowcolor: '#444',
      arrowhead: 0,
    })),
    {
      text: '3+2 car lanes:<br>< 2k ppl/lane/hr<br>1.3 ppl/vehicle',
      bgcolor: 'white' as const,
      ax: annX, ay: carTextYBottom,
      axref: 'x' as const, ayref: 'y' as const,
      yanchor: 'bottom' as const,
      x: annX, y: carTextYBottom,
      font: { color: `black` },
      arrowcolor: `rgba(0,0,0,0)`,
    },
  ]

  return (
    <Plot
      data={traces}
      layout={{
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
        margin: { t: 10, l: 60, r: 10, b: 90 },
        autosize: true,
        annotations: annotations as Layout['annotations'],
        ...peakLegendLayout(PEAK_SCATTER_LEGEND_ORDER, { dy: -0.04 }),
      }}
      useResizeHandler
      style={{ width: '100%', height: '700px' }}
    />
  )
}
