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

// og:image — canonical bubble chart, taller viewport for full chart + controls
screenshots['og-image'] = shot('', 850)

// Usage:
//   scrns --docker -h 3847 -o public/screenshots
//   scrns --docker -h 3847 -o public/screenshots -i og-image
export default screenshots
