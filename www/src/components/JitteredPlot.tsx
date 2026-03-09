import Plot from 'react-plotly.js'
import type { PlotParams } from 'react-plotly.js'
import type { Data, Layout } from 'plotly.js'

/** Per-{x, trace} jitter offsets. Outer key = x value, inner key = trace name, value = x offset */
export type JitterOffsets = Record<number, Record<string, number>>

export interface JitteredPlotProps extends Omit<PlotParams, 'data' | 'layout'> {
  data: Data[]
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

  const jitteredData: Data[] = data.map(trace => {
    const t = trace as { name?: string; x?: number[] }
    const name = t.name ?? ''
    const xs = t.x as number[] | undefined
    if (!xs) return trace

    const jitteredXs = xs.map(xVal => getJitteredX(jitter, xVal, name))
    return { ...trace, x: jitteredXs } as Data
  })

  return <Plot data={jitteredData} layout={layout} {...rest} />
}
