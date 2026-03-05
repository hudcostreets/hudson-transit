import type { CrossingRecord } from '../lib/types'
import { useColors } from '../lib/ColorContext'
import { crossingSeriesArrays, toPercentages } from '../lib/transform'
import { peakLegendLayout, PEAK_SCATTER_LEGEND_ORDER } from './peak-legend'
import JitteredPlot, { getJitteredX } from './JitteredPlot'
import type { JitterOffsets } from './JitteredPlot'
import type { Data, Layout } from 'plotly.js'

// Explicit per-{year, trace} x-offsets to reduce bubble overlap.
// Positive = rightward, negative = leftward. Only specify where needed.
// Small traces sorted by pct each year → alternate L/R so vertically
// adjacent bubbles don't also overlap horizontally.
const t = 0.07  // tight offset for PATH
const JITTER: JitterOffsets = {
  // 2014: HBus 2.2 | HAut 3.2 | LAut 4.7 | Ferry 4.8
  2014: {
    'Holland (Bus)':   -t,
    'Holland (Autos)':  t,
    'Lincoln (Autos)': -t,
    'Ferry':            t,
  },
  // 2015: HBus 2.4 | HAut 2.9 | LAut 3.9 | Ferry 4.6
  2015: {
    'Holland (Bus)':   -t,
    'Holland (Autos)':  t,
    'Lincoln (Autos)': -t,
    'Ferry':            t,
  },
  // 2016: HBus 2.6 | HAut 2.7 | LAut 3.2 | Ferry 4.5; PATHd 14 ~ PATHu 15
  2016: {
    'Holland (Bus)':    -t,
    'Holland (Autos)':   t,
    'Ferry':             t,
    'PATH (Downtown)':  -t,
    'PATH (Uptown)':     t,
  },
  // 2017: HBus 2.4 | HAut 2.8 | LAut 3.6 | Ferry 5.3; PATHd~PATHu at 15.8-15.9
  2017: {
    'Holland (Bus)':    -t,
    'Holland (Autos)':   t,
    'PATH (Downtown)':   t,
    'PATH (Uptown)':    -t,
  },
  // 2018: HBus 2.0 | HAut 3.2 | LAut 3.3 | Ferry 5.1; PATHd 16.5 ~ PATHu 15.0
  2018: {
    'Holland (Autos)':   t,
    'Lincoln (Autos)':  -t,
    'PATH (Downtown)':   t,
    'PATH (Uptown)':    -t,
  },
  // 2019: HAut 2.9 ~ LAut 3.2
  2019: {
    'Holland (Autos)':   t,
    'Lincoln (Autos)':  -t,
  },
  // 2020: PATHd 10.6 ~ PATHu 11.1
  2020: {
    'PATH (Downtown)':  -t,
    'PATH (Uptown)':     t,
  },
  // 2021: PATHu 13.9 ~ PATHd 14.4
  2021: {
    'PATH (Downtown)':   t,
    'PATH (Uptown)':    -t,
  },
  // 2022: Ferry 4.6 ~ HAut 5.4
  2022: {
    'PATH (Downtown)':    -t,
    'Amtrak / NJ Transit': t,
    'PATH (Uptown)':      -t,
    'Ferry':              -t,
    'Holland (Autos)':     t,
  },
  // 2023: HAut 3.8 ~ Ferry 4.4; Holland inside for annotation clearance
  2023: {
    'Holland (Autos)':   t,
    'Ferry':            -t,
  },
  // 2024: HAut 3.4 ~ Ferry 3.9; Holland inside for annotation clearance
  2024: {
    'Holland (Autos)':  -t,
    'Ferry':             t,
  },
}

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
      customdata: passengers.map((p, j) => [p, years[j]]),
      hovertemplate: '%{customdata[0]} (%{y:.1%})<extra>%{customdata[1]}</extra>',
      legend: `legend${i + 2}`,
    } as Data
  })

  const maxYear = Math.max(...years)
  const lastIdx = years.length - 1
  const prevIdx = years.length - 2

  // Compute bubble radius (in px) for a given passenger count
  const bubbleRadius = (passengers: number) =>
    Math.sqrt(passengers / maxPassengers) * maxSize / 2

  // Helper: get the jittered x for a given trace at a given year
  const jx = (traceName: string, yearIdx: number) =>
    getJitteredX(JITTER, years[yearIdx], traceName)

  // Get actual pct values and passenger counts for annotation targets
  const lincolnBusPct = pct['Lincoln (Bus)']
  const lincolnBusP = series['Lincoln (Bus)']
  const lincolnAutosPct = pct['Lincoln (Autos)']
  const lincolnAutosP = series['Lincoln (Autos)']
  const hollandAutosPct = pct['Holland (Autos)']
  const hollandAutosP = series['Holland (Autos)']

  // Bus and car annotations: centered between the two most recent years
  const annX = (years[prevIdx] + years[lastIdx]) / 2

  // Bus annotation
  const busTextYBottom = Math.max(
    lincolnBusPct[lastIdx],
    lincolnBusPct[prevIdx],
  ) + 0.025

  const busTargets = [
    { ay: busTextYBottom + .005, x: jx('Lincoln (Bus)', prevIdx), y: lincolnBusPct[prevIdx], p: lincolnBusP[prevIdx] },
    { ay: busTextYBottom + .005, x: jx('Lincoln (Bus)', lastIdx), y: lincolnBusPct[lastIdx], p: lincolnBusP[lastIdx] },
  ]

  const carTextYBottom = Math.max(
    lincolnAutosPct[lastIdx],
    lincolnAutosPct[prevIdx],
    hollandAutosPct[lastIdx],
    hollandAutosPct[prevIdx],
  ) + 0.02

  const carTargets = [
    { ay: carTextYBottom + .01 , x: jx('Lincoln (Autos)', prevIdx), y: lincolnAutosPct[prevIdx], p: lincolnAutosP[prevIdx] },
    { ay: carTextYBottom + .01 , x: jx('Lincoln (Autos)', lastIdx), y: lincolnAutosPct[lastIdx], p: lincolnAutosP[lastIdx] },
    { ay: carTextYBottom + .005, x: jx('Holland (Autos)', prevIdx), y: hollandAutosPct[prevIdx], p: hollandAutosP[prevIdx] },
    { ay: carTextYBottom + .005, x: jx('Holland (Autos)', lastIdx), y: hollandAutosPct[lastIdx], p: hollandAutosP[lastIdx] },
  ]

  const annotations: Partial<Layout['annotations']> = [
    ...busTargets.map(({ ay, x, y, p }) => ({
      ax: annX, ay,
      axref: 'x' as const, ayref: 'y' as const,
      yanchor: 'bottom' as const,
      x, y,
      standoff: bubbleRadius(p) + 3,
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
      borderpad: 4,
    },
    ...carTargets.map(({ ay, x, y, p }) => ({
      ax: annX, ay,
      axref: 'x' as const, ayref: 'y' as const,
      yanchor: 'bottom' as const,
      x, y,
      standoff: bubbleRadius(p) + 3,
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
      font: { color: 'black' },
      arrowcolor: 'rgba(0,0,0,0)',
      bgcolor: 'white',
      borderpad: 4,
    },
  ]

  return (
    <JitteredPlot
      data={traces}
      jitter={JITTER}
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
