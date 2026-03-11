import type { ScreenshotsMap, ScreenshotConfig } from 'scrns'

const W = 1200
const H = 800

// URL param encoding:
//   y: view mode   — b(ubble, default), n(bar), p(ct), c(recovery)
//   d: direction   — njny(entering, default), nynj(leaving)
//   t: time period — 1h(default), 3h, 1d
//   g: granularity — c(rossing, default), m(ode)
//   T: theme       — d(ark, default), l(ight)

function shot(params: string): ScreenshotConfig {
  return {
    query: params ? `?${params}` : '',
    width: W,
    height: H,
    selector: '.js-plotly-plot',
    preScreenshotSleep: 1500,
  }
}

// Direction labels for naming
const dirs = [
  { key: 'nj-ny', params: '' },         // entering (default)
  { key: 'ny-nj', params: 'd=nynj' },   // leaving
] as const

// Time period labels for naming
const times = [
  { key: '1h', params: '' },         // peak_1hr (default)
  { key: '3h', params: 't=3h' },     // peak_period
  { key: '1d', params: 't=1d' },     // 24hr
] as const

// Non-bubble view modes
const views = [
  { key: 'bar', params: 'y=n' },
  { key: 'pct', params: 'y=p' },
  { key: 'recovery', params: 'y=c' },
] as const

const themes = [
  { key: 'dark', params: '' },       // dark is default
  { key: 'light', params: 'T=l' },
] as const

function join(...parts: string[]): string {
  return parts.filter(Boolean).join('&')
}

const screenshots: ScreenshotsMap = {}

// 6 bubble views (2 directions x 3 time periods) x 2 themes = 12
for (const dir of dirs) {
  for (const time of times) {
    for (const theme of themes) {
      const name = `bubble-${dir.key}-${time.key}-${theme.key}`
      screenshots[name] = shot(join(dir.params, time.params, theme.params))
    }
  }
}

// 3 other view modes (default direction/time/granularity) x 2 themes = 6
for (const view of views) {
  for (const theme of themes) {
    const name = `${view.key}-${theme.key}`
    screenshots[name] = shot(join(view.params, theme.params))
  }
}

// og:image — canonical bubble chart, full chart height + controls
screenshots['og-image'] = {
  query: '',
  width: 1200,
  height: 850,
  selector: '.js-plotly-plot',
  preScreenshotSleep: 1500,
}

// Usage: npx scrns -h 3847 -o public/screenshots
// og:image only: npx scrns -h 3847 -o public/screenshots -i og-image
export default screenshots
