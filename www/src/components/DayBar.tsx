import Plot from 'react-plotly.js'
import type { ModeRecord } from '../lib/types'
import { DAY_MODES } from '../lib/types'
import { DAY_MODE_COLORS } from '../lib/colors'
import { modeSeriesArrays } from '../lib/transform'

export default function DayBar({ data }: { data: ModeRecord[] }) {
  const { years, series } = modeSeriesArrays(data)
  return (
    <Plot
      data={DAY_MODES.map(mode => ({
        type: 'bar' as const,
        name: mode,
        x: years,
        y: series[mode],
        marker: { color: DAY_MODE_COLORS[mode] },
      }))}
      layout={{
        title: { text: 'NJ\u2192NY crossings on a Fall business day' },
        barmode: 'stack',
        xaxis: { dtick: 1, title: { text: '' } },
        yaxis: { title: { text: '# People' } },
        hovermode: 'x',
        legend: { traceorder: 'reversed' },
        margin: { t: 50, l: 70, r: 20, b: 40 },
        autosize: true,
      }}
      useResizeHandler
      style={{ width: '100%', height: '600px' }}
    />
  )
}
