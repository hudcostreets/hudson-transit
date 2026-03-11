import { Plot } from 'pltly/react'
import type { PlotProps } from 'pltly/react'
import type { PlotData, Layout } from 'plotly.js'

/** Per-{x, trace} jitter offsets. Outer key = x value, inner key = trace name, value = x offset */
export type JitterOffsets = Record<number, Record<string, number>>

export interface JitteredPlotProps extends Omit<PlotProps, 'data' | 'layout'> {
  data: Partial<PlotData>[]
  layout: Partial<Layout>
  jitter?: JitterOffsets
}

/** Look up a trace's jitter x-offset for a given x value. Returns 0 if not specified. */
export function getJitteredX(
  jitter: JitterOffsets | undefined,
  xVal: number,
  traceName: string,
): number {
  return xVal + (jitter?.[xVal]?.[traceName] ?? 0)
}

export default function JitteredPlot({ data, layout, jitter, ...rest }: JitteredPlotProps) {
  if (!jitter) {
    return <Plot data={data} layout={layout} {...rest} />
  }

  const jitteredData: Partial<PlotData>[] = data.map(trace => {
    const t = trace as { name?: string; x?: number[] }
    const name = t.name ?? ''
    const xs = t.x as number[] | undefined
    if (!xs) return trace

    const jitteredXs = xs.map(xVal => getJitteredX(jitter, xVal, name))
    return { ...trace, x: jitteredXs }
  })

  return <Plot data={jitteredData} layout={layout} {...rest} />
}
