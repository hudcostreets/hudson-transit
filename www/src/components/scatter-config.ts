import type { JitterOffsets } from './JitteredPlot'

function configKey(direction: string, timePeriod: string, granularity: string): string {
  return `${direction}:${timePeriod}:${granularity}`
}

// --- Jitter config ---
// Explicit per-{year, trace} x-offsets to reduce bubble overlap.
// Positive = rightward, negative = leftward. Only specify where needed.
const t = 0.07
const t1 = 0.1
const t2 = 0.13
const t3 = 0.18

/** Jitter configs keyed by `${direction}:${timePeriod}:${granularity}` */
export const JITTER_MAP: Record<string, JitterOffsets> = {}

export function getJitter(direction: string, timePeriod: string, granularity: string): JitterOffsets | undefined {
  return JITTER_MAP[configKey(direction, timePeriod, granularity)]
}

// --- entering, peak_1hr, crossing ---
const ENTERING_1HR_JITTER: JitterOffsets = {
  2014: {
    'Lincoln (Autos)': -t1,
    'Ferry':            t1,
    'Holland (Autos)':  0,
    'Holland (Bus)':    0,
  },
  2015: {
    'Lincoln (Autos)': -t1,
    'Ferry':            t1,
    'Holland (Autos)':  t,
    'Holland (Bus)':    0,
  },
  2016: {
    'PATH (Uptown)':    -t3,
    'PATH (Downtown)':   t3,
    'Ferry':             0,
    'Lincoln (Autos)':  -t2,
    'Holland (Autos)':   t2,
    'Holland (Bus)':     0,
  },
  2017: {
    'PATH (Uptown)':    -t3,
    'PATH (Downtown)':   t3,
    'Holland (Bus)':    -t1,
    'Holland (Autos)':   t1,
  },
  2018: {
    'PATH (Uptown)':    -t1,
    'PATH (Downtown)':   t1,
    'Holland (Autos)':   t1,
    'Lincoln (Autos)':  -t1,
  },
  2019: {
    'Holland (Autos)':   t1,
    'Lincoln (Autos)':  -t1,
  },
  2020: {
    'PATH (Uptown)':    -t1,
    'PATH (Downtown)':   t1,
  },
  2021: {
    'PATH (Uptown)':    -t1,
    'PATH (Downtown)':   t1,
  },
  2022: {
    'PATH (Uptown)':      -t2,
    'PATH (Downtown)':    -t2,
    'Amtrak / NJ Transit': t2,
    'Ferry':              -t,
    'Holland (Autos)':     t,
  },
  2023: {
    'Holland (Autos)':   t1,
    'Ferry':            -t1,
  },
  2024: {
    'Holland (Autos)':  -t1,
    'Ferry':             t1,
  },
}
JITTER_MAP[configKey('entering', 'peak_1hr', 'crossing')] = ENTERING_1HR_JITTER

// --- entering, peak_period, crossing ---
// Main overlap clusters: PATH Down/Up (~13-15%), Lincoln Autos/Ferry/Holland Autos (~4-5%)
const ENTERING_3HR_JITTER: JitterOffsets = {
  2014: {
    'PATH (Uptown)':     0,  // 13.6%
    'PATH (Downtown)':   0,  // 11.5%
    'Lincoln (Autos)':   0,  // 5.9%
    'Ferry':           -t1,  // 4.2%
    'Holland (Autos)':  t1,  // 4.0%
    'Holland (Bus)':     0,  // 2.6%
  },
  2015: {
    'PATH (Uptown)':      0,  // 13.8%
    'PATH (Downtown)':    0,  // 11.8%
    'Lincoln (Autos)':   t1,  // 5.3%
    'Ferry':            -t1,  // 4.2%
    'Holland (Autos)':   t2,  // 4.0%
    'Holland (Bus)':      0,  // 2.7%
  },
  2016: {
    'PATH (Uptown)':    -t2,  // 13.5%
    'PATH (Downtown)':   t2,  // 13.4%
    'Lincoln (Autos)':   t2,  // 4.4%
    'Ferry':            -t2,  // 4.1%
    'Holland (Autos)':    t,  // 3.5%
    'Holland (Bus)':     -t,  // 2.8%
  },
  2017: {
    'PATH (Downtown)':   t2,  // 14.8%
    'PATH (Uptown)':    -t2,  // 14.0%
    'Ferry':             t2,  // 4.8%
    'Lincoln (Autos)':  -t2,  // 4.7%
    'Holland (Autos)':    0,  // 3.5%
    'Holland (Bus)':      0,  // 2.5%
  },
  2018: {
    'PATH (Downtown)':    0,  // 15.5%
    'PATH (Uptown)':      0,  // 13.6%
    'Ferry':              0,  // 4.8%
    'Lincoln (Autos)':   t3,  // 4.2%
    'Holland (Autos)':  -t3,  // 4.2%
  },
  2019: {
    'PATH (Downtown)':    0,  // 16.0%
    'PATH (Uptown)':      0,  // 13.9%
    'Ferry':              0,  // 4.8%
    'Lincoln (Autos)':   t3,  // 4.2%
    'Holland (Autos)':  -t3,  // 4.0%
  },
  2020: {
    'PATH (Downtown)':    t,  // 10.2%
    'PATH (Uptown)':     -t,  // 10.0%
  },
  2021: {
    'Lincoln (Autos)':  -t1,  // 13.9%
    'PATH (Uptown)':      0,  // 12.5%
    'PATH (Downtown)':   t3,  // 13.5%
  },
  2022: {
    'PATH (Downtown)':   t,  // 14.4%
    'PATH (Uptown)':    -t,  // 13.0%
  },
  2023: {
    'Ferry':            -t,  // 4.3%
    'Holland (Autos)':   t,  // 4.6%
  },
  2024: {
    'Ferry':            -t,  // 3.9%
    'Holland (Autos)':   t,  // 4.3%
  },
}
JITTER_MAP[configKey('entering', 'peak_period', 'crossing')] = ENTERING_3HR_JITTER

// --- entering, 24hr, crossing ---
// Main overlap clusters: PATH Down/Up (~10%), Lincoln Autos/Holland Autos (~10%), Ferry/Holland Bus (~3%)
const ENTERING_24HR_JITTER: JitterOffsets = {
  2014: {
    'PATH (Uptown)':     -t2,  // 11.8%
    'PATH (Downtown)':   -t2,  // 9.6%
    'Lincoln (Autos)':    t2,  // 11.7%
    'Holland (Autos)':    t2,  // 9.7%
    'Holland (Bus)':      t1,  // 3.2%
    'Ferry':             -t1,  // 2.9%
  },
  2015: {
    'PATH (Uptown)':     -t2,  // 11.9%
    'PATH (Downtown)':   -t2,  // 9.7%
    'Lincoln (Autos)':    t2,  // 11.4%
    'Holland (Autos)':    t2,  // 9.2%
    'Ferry':             -t1,  // 3.0%
    'Holland (Bus)':      t1,  // 2.9%
  },
  2016: {
    'PATH (Uptown)':    -t3,  // 11.4%
    'PATH (Downtown)':   t3,  // 10.8%
    'Lincoln (Autos)':    0,  // 10.7%
    'Holland (Autos)':   -0,  // 8.7%
    'Ferry':             -t1,  // 3.1%
    'Holland (Bus)':      t1,  // 2.9%
  },
  2017: {
    'PATH (Uptown)':    -t3,  // 11.8%
    'PATH (Downtown)':   t3,  // 11.3%
    'Lincoln (Autos)':    0,  // 10.9%
    'Holland (Autos)':    0,  // 8.6%
    'Ferry':             -t1,  // 3.3%
    'Holland (Bus)':      t1,  // 2.8%
  },
  2018: {
    'PATH (Downtown)':   t2,  // 12.1%
    'PATH (Uptown)':    -t2,  // 11.3%
    'Lincoln (Autos)':   t2,  // 9.8%
    'Holland (Autos)':  -t2,  // 9.2%
    'Ferry':             -t1,  // 3.4%
    'Holland (Bus)':      t1,  // 2.7%
  },
  2019: {
    'PATH (Downtown)':   t2,  // 11.9%
    'PATH (Uptown)':    -t2,  // 11.8%
    'Holland (Autos)':   t2,  // 9.5%
    'Lincoln (Autos)':  -t2,  // 9.4%
    'Ferry':             -t,  // 3.3%
    'Holland (Bus)':      t,  // 2.3%
  },
  2020: {
    // 'Lincoln (Autos)':     0,  // 25.0%
    // 'Holland (Autos)':     0,  // 20.2%
    // 'Amtrak / NJ Transit': 0,  // 9.7%
    'PATH (Downtown)':     t,  // 7.6%
    'PATH (Uptown)':      -t,  // 7.5%
  },
  2021: {
    // 'Lincoln (Autos)':    0,  // 20.8%
    // 'Holland (Autos)':    0,  // 15.3%
    'PATH (Uptown)':    -t1,  // 9.7%
    'PATH (Downtown)':   t1,  // 9.1%
  },
  2022: {
    'Lincoln (Autos)':    -t,  // 15.7%
    'Amtrak / NJ Transit': t, // 14.0%
    'Holland (Autos)':    -t,  // 12.6%
    'PATH (Uptown)':     -t2,  // 10.0%
    'PATH (Downtown)':    t2,  // 9.4%
  },
  2023: {
    // 'Lincoln (Autos)':    0,  // 14.1%
    // 'Holland (Autos)':    0,  // 11.0%
    'PATH (Downtown)':   t2,  // 10.0%
    'PATH (Uptown)':    -t2,  // 9.8%
  },
  2024: {
    // 'Lincoln (Autos)':    0,  // 13.1%
    // 'Holland (Autos)':    0,  // 10.4%
    'PATH (Downtown)':   t3,  // 10.2%
    'PATH (Uptown)':    -t3,  // 9.8%
  },
}
JITTER_MAP[configKey('entering', '24hr', 'crossing')] = ENTERING_24HR_JITTER

// --- leaving, peak_1hr, crossing ---
const LEAVING_1HR_JITTER: JitterOffsets = {
  2014: {
    'PATH (Uptown)':    -t3,
    'PATH (Downtown)':   t3,
    'Holland (Bus)':    -t,
    'Holland (Autos)':   t,
  },
  2015: {
    'PATH (Uptown)':    -t2,
    'PATH (Downtown)':   t2,
    'Holland (Bus)':    -t,
    'Holland (Autos)':   t,
  },
  2016: {
    'Holland (Bus)':    -t,
    'Holland (Autos)':   t,
  },
  2017: {
    'Holland (Bus)':    -t,
    'Holland (Autos)':   t,
  },
  2018: {
    'Lincoln (Autos)':   t,
    'Ferry':            -t,
  },
  2019: {
    'Lincoln (Autos)':   t,
    'Ferry':            -t,
  },
  2020: {
    'PATH (Uptown)':    -t1,
    'PATH (Downtown)':   t1,
  },
  2021: {
    'PATH (Uptown)':    -t2,
    'PATH (Downtown)':   0,
    'Lincoln (Autos)':   t1,
  },
  2023: {
    'Holland (Autos)':   t,
    'Ferry':            -t,
  },
  2024: {
    'Holland (Autos)':   t,
    'Ferry':            -t,
  },
}
JITTER_MAP[configKey('leaving', 'peak_1hr', 'crossing')] = LEAVING_1HR_JITTER

// --- leaving, peak_period, crossing ---
// Main overlap clusters: PATH Down/Up (~11-15%), Lincoln Autos/Ferry/Holland Autos (~3-7%)
const LEAVING_3HR_JITTER: JitterOffsets = {
  2014: {
    'PATH (Uptown)':       -t3,  // 12.6%
    'PATH (Downtown)':      t3,  // 11.9%
    'Ferry':               -t2,  // 3.9%
    'Holland (Autos)':       t,  // 3.6%
    'Holland (Bus)':        -t,  // 2.4%
  },
  2015: {
    'PATH (Uptown)':       -t3,  // 11.5%
    'PATH (Downtown)':      t3,  // 11.3%
    'Ferry':               -t1,  // 3.9%
    'Holland (Autos)':      t1,  // 3.3%
  },
  2016: {
    'PATH (Uptown)':       -t2,  // 12.1%
    'PATH (Downtown)':      t2,  // 13.4%
    'Ferry':                -t,  // 4.4%
    'Holland (Autos)':       t,  // 3.3%
  },
  2017: {
    'PATH (Uptown)':        -t,  // 12.5%
    'PATH (Downtown)':       t,  // 14.6%
    'Ferry':                -t,  // 4.2%
    'Holland (Autos)':       t,  // 3.1%
  },
  2018: {
    'PATH (Uptown)':        -t,  // 12.4%
    'PATH (Downtown)':       t,  // 15.3%
    'Ferry':                -t,  // 4.3%
    'Holland (Autos)':       t,  // 3.1%
  },
  2019: {
    'PATH (Uptown)':        -t,  // 12.6%
    'PATH (Downtown)':       t,  // 15.1%
    'Ferry':                -t,  // 4.5%
    'Holland (Autos)':       t,  // 3.4%
  },
  2020: {
    'PATH (Uptown)':       -t1,  // 9.0%
    'PATH (Downtown)':      t1,  // 9.6%
    'Amtrak / NJ Transit': -t1,  // 7.8%
    'Holland (Autos)':      t1,  // 5.8%
  },
  2021: {
    'PATH (Uptown)':        -t,  // 11.8%
    'PATH (Downtown)':      t3,  // 12.8%
  },
  2022: {
    'PATH (Uptown)':        -t,  // 12.2%
    'PATH (Downtown)':       t,  // 13.9%
    'Ferry':                -t,  // 4.6%
    'Holland (Autos)':       t,  // 5.5%
  },
  2023: {
    'PATH (Uptown)':        -t,  // 11.0%
    'PATH (Downtown)':       t,  // 14.4%
    'Ferry':                -t,  // 4.0%
    'Holland (Autos)':       t,  // 4.3%
  },
  2024: {
    'PATH (Uptown)':        -t,  // 11.8%
    'PATH (Downtown)':       t,  // 14.6%
    'Ferry':                -t,  // 3.7%
    'Holland (Autos)':       t,  // 4.1%
  },
}
JITTER_MAP[configKey('leaving', 'peak_period', 'crossing')] = LEAVING_3HR_JITTER

// --- leaving, 24hr, crossing ---
// Main overlap clusters: PATH Down/Up (~9-11%), Lincoln Autos/Holland Autos (~9-13%), Ferry/Holland Bus (~2-3%)
const LEAVING_24HR_JITTER: JitterOffsets = {
  2014: {
    'PATH (Uptown)':       -t1,  // 11.8%
    'PATH (Downtown)':     -t2,  // 9.0%
    'Lincoln (Autos)':      t1,  // 13.3%
    'Holland (Autos)':      t3,  // 9.7%
    'Ferry':                -t,  // 2.6%
    'Holland (Bus)':         t,  // 2.2%
  },
  2015: {
    'PATH (Uptown)':       -t1,  // 11.2%
    'PATH (Downtown)':     -t2,  // 9.0%
    'Lincoln (Autos)':      t1,  // 12.7%
    'Holland (Autos)':      t3,  // 8.8%
    'Ferry':                -t,  // 2.9%
    'Holland (Bus)':         t,  // 2.1%
  },
  2016: {
    'PATH (Uptown)':       -t3,  // 11.1%
    'PATH (Downtown)':      t3,  // 10.4%
    'Lincoln (Autos)':       t,  // 12.4%
    'Holland (Autos)':      -t,  // 9.4%
    'Ferry':                -t,  // 3.0%
    'Holland (Bus)':         t,  // 2.4%
  },
  2017: {
    'PATH (Uptown)':       -t3,  // 11.5%
    'PATH (Downtown)':      t3,  // 11.1%
    'Lincoln (Autos)':       t,  // 12.4%
    'Holland (Autos)':       0,  // 8.9%
    'Ferry':                -t,  // 2.8%
    'Holland (Bus)':         t,  // 2.0%
  },
  2018: {
    'PATH (Uptown)':       -t1,  // 11.2%
    'PATH (Downtown)':      t3,  // 11.8%
    'Lincoln (Autos)':      -t,  // 12.6%
    'Holland (Autos)':       0,  // 8.9%
    'Ferry':                 0,  // 2.9%
    'Holland (Bus)':         0,  // 1.7%
  },
  2019: {
    'PATH (Uptown)':       -t3,  // 11.6%
    'PATH (Downtown)':      t3,  // 11.6%
    'Lincoln (Autos)':       0,  // 12.4%
    'Holland (Autos)':       0,  // 9.1%
    'Ferry':                 0,  // 3.0%
    'Holland (Bus)':         0,  // 1.5%
  },
  2020: {
    'PATH (Uptown)':       -t1,  // 6.9%
    'PATH (Downtown)':      t1,  // 7.1%
  },
  2021: {
    'PATH (Uptown)':       -t2,  // 9.5%
    'PATH (Downtown)':      t2,  // 9.1%
  },
  2022: {
    'PATH (Uptown)':       -t2,  // 10.0%
    'PATH (Downtown)':      t2,  // 9.8%
    'Lincoln (Autos)':     -t2,  // 16.6%
    'Amtrak / NJ Transit':  t3,  // 15.6%
    'Holland (Autos)':       0,  // 13.3%
  },
  2023: {
    'PATH (Uptown)':       -t3,  // 9.3%
    'PATH (Downtown)':       0,  // 10.5%
    'Holland (Autos)':      t3,  // 9.6%
  },
  2024: {
    'PATH (Uptown)':       -t3,  // 9.8%
    'PATH (Downtown)':      t3,  // 10.6%
    'Holland (Autos)':       0,  // 9.3%
  },
}
JITTER_MAP[configKey('leaving', '24hr', 'crossing')] = LEAVING_24HR_JITTER

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
  annColors?: { font: string, bg: string, arrow: string },
) {
  const fc = annColors?.font ?? 'black'
  const bg = annColors?.bg ?? 'white'
  const ac = annColors?.arrow ?? '#444'
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
      arrowcolor: ac,
      arrowhead: 0,
    })),
    {
      text: '1 bus lane:<br>30k-40k ppl/lane/hr<br>20-30 ppl/vehicle',
      ax: annX, ay: busTextYBottom,
      yanchor: 'bottom' as const,
      axref: 'x' as const, ayref: 'y' as const,
      x: years[prevIdx], y: lincolnBusPct[prevIdx],
      font: { color: fc },
      arrowcolor: 'rgba(0,0,0,0)',
      bgcolor: bg,
      borderpad: 4,
    },
    ...carTargets.map(({ ay, x, y, p }) => ({
      ax: annX, ay,
      axref: 'x' as const, ayref: 'y' as const,
      yanchor: 'bottom' as const,
      x, y,
      standoff: bubbleRadius(p) + 3,
      arrowcolor: ac,
      arrowhead: 0,
    })),
    {
      text: '3+2 car lanes:<br>< 2k ppl/lane/hr<br>1.3 ppl/vehicle',
      ax: annX, ay: carTextYBottom,
      axref: 'x' as const, ayref: 'y' as const,
      yanchor: 'bottom' as const,
      x: annX, y: carTextYBottom,
      font: { color: fc },
      arrowcolor: 'rgba(0,0,0,0)',
      bgcolor: bg,
      borderpad: 4,
    },
  ]
}
