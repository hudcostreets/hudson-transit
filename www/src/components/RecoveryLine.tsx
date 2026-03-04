import Plot from 'react-plotly.js'
import type { ModeRecord } from '../lib/types'
import { DAY_MODES } from '../lib/types'
import { DAY_MODE_COLORS } from '../lib/colors'
import { recoveryPct } from '../lib/transform'

export default function RecoveryLine({ data }: { data: ModeRecord[] }) {
  const { years, series } = recoveryPct(data, 2019)
  return (
    <Plot
      data={DAY_MODES.map(mode => ({
        type: 'scatter' as const,
        name: mode,
        x: years,
        y: series[mode],
        mode: 'lines+markers' as const,
        marker: { color: DAY_MODE_COLORS[mode], size: 8 },
        line: { color: DAY_MODE_COLORS[mode], width: 2 },
      }))}
      layout={{
        title: { text: 'Recovery from COVID: NJ\u2192NY mode volumes as % of 2019 level' },
        xaxis: { dtick: 1, title: { text: '' } },
        yaxis: {
          title: { text: '% of 2019 volume' },
          tickformat: ',.0%',
          range: [0, 1.3],
        },
        hovermode: 'x',
        shapes: [{
          type: 'line',
          x0: years[0],
          x1: years[years.length - 1],
          y0: 1,
          y1: 1,
          line: { color: '#888', width: 1, dash: 'dash' },
        }],
        margin: { t: 50, l: 70, r: 20, b: 40 },
        autosize: true,
      }}
      useResizeHandler
      style={{ width: '100%', height: '500px' }}
    />
  )
}
