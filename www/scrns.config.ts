import type { ScreenshotsMap, ScreenshotConfig } from 'scrns'

const W = 1200
const H = 800

// URL param encoding:
//   y: view mode   — b(ubble, default), n(bar), p(ct), c(recovery)
//   d: direction   — njny(entering, default), nynj(leaving)
//   t: time period — 1h(default), 3h, 1d
//   g: granularity — c(rossing, default), m(ode)
//   T: theme       — d(ark, default), l(ight)

function shot(params: string, h = H): ScreenshotConfig {
  return {
    query: params ? `?${params}` : '',
    width: W,
    height: h,
    selector: '.js-plotly-plot',
    preScreenshotSleep: 1500,
  }
}

const dirs = [
  { key: 'nj-ny', params: '' },
  { key: 'ny-nj', params: 'd=nynj' },
] as const

const times = [
  { key: '1h', params: '' },
  { key: '3h', params: 't=3h' },
  { key: '1d', params: 't=1d' },
] as const

function join(...parts: string[]) { return parts.filter(Boolean).join('&') }

const screenshots: ScreenshotsMap = {}

// 6 bubble views: 2 directions x 3 time periods (dark theme only)
for (const dir of dirs) {
  for (const time of times) {
    screenshots[`bubble-${dir.key}-${time.key}`] = shot(join(dir.params, time.params))
  }
}

// Flow map — geographic Sankey of crossings + ferries. The map needs more
// settling time than Plotly: maplibre-gl loads vector tiles asynchronously,
// then we render the ribbon polygons on top. The flow map sits below the
// bubble chart, so scroll to it before capturing. Inline-legend is on by
// default so the labels appear at the arrow tips. `headless: false` is
// required because maplibre-gl uses WebGL, which needs a real GPU context —
// in headless Chromium the canvas renders blank.
function mapShot(params: string): ScreenshotConfig {
  return {
    query: params ? `?${params}` : '',
    width: W,
    height: 900,
    selector: '.geo-sankey',
    scrollTo: '.geo-sankey',
    preScreenshotSleep: 3000,
    headless: false,
  }
}
for (const dir of dirs) {
  screenshots[`map-${dir.key}`] = mapShot(dir.params)
}

// og:image — canonical bubble chart, clean mode (no toggles/SpeedDial, larger text)
// Standard og:image is 1200x630
screenshots['og'] = {
  query: '?clean',
  width: W,
  height: 630,
  selector: '#chart',
  preScreenshotSleep: 1500,
}

// Usage:
//   scrns -h 3847 -o public/scrns                    # all bubble views
//   scrns -h 3847 -o public -i og                    # og:image → public/og.png
export default screenshots
