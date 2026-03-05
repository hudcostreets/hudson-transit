import type { JitterOffsets } from './JitteredPlot'

// Explicit per-{year, trace} x-offsets to reduce bubble overlap.
// Positive = rightward, negative = leftward. Only specify where needed.
const t = 0.07  // tight offset for PATH

export const CANONICAL_JITTER: JitterOffsets = {
  2014: {
    'Holland (Bus)':   -t,
    'Holland (Autos)':  t,
    'Lincoln (Autos)': -t,
    'Ferry':            t,
  },
  2015: {
    'Holland (Bus)':   -t,
    'Holland (Autos)':  t,
    'Lincoln (Autos)': -t,
    'Ferry':            t,
  },
  2016: {
    'Holland (Bus)':    -t,
    'Holland (Autos)':   t,
    'Ferry':             t,
    'PATH (Downtown)':  -t,
    'PATH (Uptown)':     t,
  },
  2017: {
    'Holland (Bus)':    -t,
    'Holland (Autos)':   t,
    'PATH (Downtown)':   t,
    'PATH (Uptown)':    -t,
  },
  2018: {
    'Holland (Autos)':   t,
    'Lincoln (Autos)':  -t,
    'PATH (Downtown)':   t,
    'PATH (Uptown)':    -t,
  },
  2019: {
    'Holland (Autos)':   t,
    'Lincoln (Autos)':  -t,
  },
  2020: {
    'PATH (Downtown)':  -t,
    'PATH (Uptown)':     t,
  },
  2021: {
    'PATH (Downtown)':   t,
    'PATH (Uptown)':    -t,
  },
  2022: {
    'PATH (Downtown)':    -t,
    'Amtrak / NJ Transit': t,
    'PATH (Uptown)':      -t,
    'Ferry':              -t,
    'Holland (Autos)':     t,
  },
  2023: {
    'Holland (Autos)':   t,
    'Ferry':            -t,
  },
  2024: {
    'Holland (Autos)':  -t,
    'Ferry':             t,
  },
}

export interface AnnotationTarget {
  ay: number
  x: number
  y: number
  p: number
}

/** Build the bus/car annotation objects for the canonical scatter view */
export function buildCanonicalAnnotations(
  years: number[],
  pct: Record<string, number[]>,
  series: Record<string, number[]>,
  maxPassengers: number,
  maxSize: number,
  jx: (traceName: string, yearIdx: number) => number,
) {
  const lastIdx = years.length - 1
  const prevIdx = years.length - 2

  const bubbleRadius = (passengers: number) =>
    Math.sqrt(passengers / maxPassengers) * maxSize / 2

  const annX = (years[prevIdx] + years[lastIdx]) / 2

  const lincolnBusPct = pct['Lincoln (Bus)']
  const lincolnBusP = series['Lincoln (Bus)']
  const lincolnAutosPct = pct['Lincoln (Autos)']
  const lincolnAutosP = series['Lincoln (Autos)']
  const hollandAutosPct = pct['Holland (Autos)']
  const hollandAutosP = series['Holland (Autos)']

  const busTextYBottom = Math.max(
    lincolnBusPct[lastIdx],
    lincolnBusPct[prevIdx],
  ) + 0.025

  const busTargets: AnnotationTarget[] = [
    { ay: busTextYBottom + .005, x: jx('Lincoln (Bus)', prevIdx), y: lincolnBusPct[prevIdx], p: lincolnBusP[prevIdx] },
    { ay: busTextYBottom + .005, x: jx('Lincoln (Bus)', lastIdx), y: lincolnBusPct[lastIdx], p: lincolnBusP[lastIdx] },
  ]

  const carTextYBottom = Math.max(
    lincolnAutosPct[lastIdx],
    lincolnAutosPct[prevIdx],
    hollandAutosPct[lastIdx],
    hollandAutosPct[prevIdx],
  ) + 0.02

  const carTargets: AnnotationTarget[] = [
    { ay: carTextYBottom + .01 , x: jx('Lincoln (Autos)', prevIdx), y: lincolnAutosPct[prevIdx], p: lincolnAutosP[prevIdx] },
    { ay: carTextYBottom + .01 , x: jx('Lincoln (Autos)', lastIdx), y: lincolnAutosPct[lastIdx], p: lincolnAutosP[lastIdx] },
    { ay: carTextYBottom + .005, x: jx('Holland (Autos)', prevIdx), y: hollandAutosPct[prevIdx], p: hollandAutosP[prevIdx] },
    { ay: carTextYBottom + .005, x: jx('Holland (Autos)', lastIdx), y: hollandAutosPct[lastIdx], p: hollandAutosP[lastIdx] },
  ]

  return [
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
}
