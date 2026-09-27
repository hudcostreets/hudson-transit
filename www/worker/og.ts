/**
 * Dynamic OG images (Satori, via `workers-og`): `/og/index.png` and
 * `/og/nyc.png`, parameterized by the page's own view params (`d`, `t`, `g`).
 * All are 1200×630. Layouts (`OG_LAYOUTS`; compare them at `/og/review`):
 * - `chart`: title + subtitle, stacked bars of passengers per year, and a
 *   legend with the latest year's values. The only layout for `/nyc`.
 * - `full` / `map` / `mosaic`: the `/` flow map, from pre-rendered captures
 *   (`public/og-maps/<width>/<dir>-<time>.jpg`, `pnpm og-maps`), alone or
 *   beside a text / mini-chart column.
 *
 * Satori requires `display:flex` on every multi-child element and treats
 * inter-tag whitespace as child nodes, so markup is built whitespace-free.
 * Chart shapes are an SVG data-URI `<img>` (text inside it wouldn't get the
 * card's fonts); every label is HTML.
 */
import { ImageResponse } from 'workers-og'
import ogDataJson from './og-data.json'
import type { OgData, OgSeries } from './og-types'

const ogData = ogDataJson as OgData

export type Direction = 'entering' | 'leaving'
export type TimePeriod = 'peak_1hr' | 'peak_period' | '24hr'
export type OgPage = 'index' | 'nyc'

export interface OgView {
  page: OgPage
  dir: Direction
  time: TimePeriod
  /** `index`: 'crossing' | 'mode'; `nyc`: 'mode' | 'sector'. */
  gran: string
}

const W = 1200
const H = 630
const PAD = 48
const BG = '#1a1a2e'
const TEXT = '#e0e0e0'
const MUTED = '#a0a0b0'
const GRID = '#2a2a4a'

const CHART_W = 680
const CHART_H = 330
const AXIS_W = 64
const LEGEND_W = W - 2 * PAD - AXIS_W - CHART_W - 40

/** Width of the narrow map captures; the column beside them gets the rest. */
export const MAP_COL_W = 780
const SIDE_W = W - MAP_COL_W

export type OgLayout = 'chart' | 'full' | 'map' | 'mosaic'
export const OG_LAYOUTS: [OgLayout, string][] = [
  ['chart', 'Stacked bars + legend'],
  ['full', 'Full-bleed map'],
  ['map', 'Map + title / total'],
  ['mosaic', 'Map + title / mini chart'],
]
export const isOgLayout = (s: string | null): s is OgLayout => OG_LAYOUTS.some(([l]) => l === s)
/** `/og/index.png` default; `/nyc` is always `chart`. */
export const DEFAULT_LAYOUT: OgLayout = 'chart'

/** Map capture for a view (the map varies only by direction and time period). */
export function mapCapture(view: OgView, width: number): string {
  const dir = view.dir === 'entering' ? 'nj-ny' : 'ny-nj'
  const time = view.time === 'peak_period' ? '3h' : view.time === '24hr' ? '1d' : '1h'
  return `/og-maps/${width}/${dir}-${time}.jpg`
}

export const TIME_LABELS: Record<Direction, Record<TimePeriod, string>> = {
  entering: { peak_1hr: '8-9am', peak_period: '7-10am', '24hr': '24hr' },
  leaving: { peak_1hr: '5-6pm', peak_period: '4-7pm', '24hr': '24hr' },
}

// Full Inter (v3.19): the `@fontsource` "latin" subset lacks `→` (U+2192).
const FONT_BASE = 'https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files'
let fontsPromise: Promise<[ArrayBuffer, ArrayBuffer]> | null = null
function loadFonts(): Promise<[ArrayBuffer, ArrayBuffer]> {
  fontsPromise ??= Promise.all(
    ['Inter-Regular.woff', 'Inter-Bold.woff'].map(async f => {
      const r = await fetch(`${FONT_BASE}/${f}`, { cf: { cacheTtl: 30 * 86400, cacheEverything: true } })
      if (!r.ok) throw new Error(`font ${f}: ${r.status}`)
      return r.arrayBuffer()
    }),
  ) as Promise<[ArrayBuffer, ArrayBuffer]>
  fontsPromise.catch(() => { fontsPromise = null })
  return fontsPromise
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const div = (style: string, inner = ''): string => `<div style="display:flex;${style}">${inner}</div>`
const span = (style: string, text: string): string => `<span style="display:flex;${style}">${esc(text)}</span>`

export function fmtCount(n: number): string {
  const trim = (s: string) => s.replace(/\.0$/, '')
  if (n >= 1_000_000) return `${trim((n / 1_000_000).toFixed(1))}M`
  if (n >= 100_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${trim((n / 1000).toFixed(1))}k`
  return String(n)
}

/** Tick step giving ~4 gridlines: 1, 2, 2.5, or 5 × 10^n. */
function niceStep(max: number): number {
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw)!
}

export function seriesFor(view: OgView): OgSeries[] {
  const key = `${view.dir}|${view.time}`
  if (view.page === 'nyc') {
    const d = ogData.nyc[key]
    return view.gran === 'sector' ? d.sector : d.mode
  }
  const d = ogData.index[key]
  return view.gran === 'mode' ? d.mode : d.crossing
}

export function titles(view: OgView): { title: string; subtitle: string } {
  const years = ogData.years
  const subtitle = `${TIME_LABELS[view.dir][view.time]}, Fall business day · ${years[0]}–${years[years.length - 1]}`
  if (view.page === 'nyc') {
    const verb = view.dir === 'entering' ? 'Entering' : 'Leaving'
    return { title: `${verb} Manhattan's CBD, by ${view.gran}`, subtitle }
  }
  const arrow = view.dir === 'entering' ? 'NJ→NY' : 'NY→NJ'
  return { title: `${arrow} passengers by ${view.gran}`, subtitle }
}

interface ChartDims { w: number; h: number; axisW: number; fontPx: number }
const BIG_CHART: ChartDims = { w: CHART_W, h: CHART_H, axisW: AXIS_W, fontPx: 18 }

const yearTotals = (series: OgSeries[]): number[] =>
  ogData.years.map((_, i) => series.reduce((s, x) => s + x.values[i], 0))

function chart(series: OgSeries[], { w: CHART_W, h: CHART_H, axisW: AXIS_W, fontPx }: ChartDims = BIG_CHART): string {
  const years = ogData.years
  const totals = yearTotals(series)
  const step = niceStep(Math.max(...totals))
  const top = Math.ceil(Math.max(...totals) / step) * step
  const y = (v: number): number => CHART_H - (v / top) * CHART_H
  const band = CHART_W / years.length
  const barW = band * 0.68

  const ticks: number[] = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  const grid = ticks.map(v =>
    `<line x1="0" y1="${y(v).toFixed(1)}" x2="${CHART_W}" y2="${y(v).toFixed(1)}" stroke="${GRID}" stroke-width="${v === 0 ? 2 : 1}"/>`,
  ).join('')
  const bars = years.map((_, i) => {
    let acc = 0
    const x = (i * band + (band - barW) / 2).toFixed(1)
    return series.map(s => {
      const v = s.values[i]
      const y1 = y(acc + v)
      const h = y(acc) - y1
      acc += v
      return h > 0 ? `<rect x="${x}" y="${y1.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}"/>` : ''
    }).join('')
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${CHART_H}" viewBox="0 0 ${CHART_W} ${CHART_H}">${grid}${bars}</svg>`

  const yLabels = ticks.map(v =>
    `<span style="display:flex;position:absolute;right:${fontPx * 2 / 3}px;top:${(y(v) - fontPx * 2 / 3).toFixed(1)}px;font-size:${fontPx}px;color:${MUTED};">${esc(fmtCount(v))}</span>`,
  ).join('')
  const xLabels = years.map(yr =>
    `<span style="display:flex;justify-content:center;width:${band.toFixed(1)}px;font-size:${fontPx}px;color:${MUTED};">'${String(yr).slice(2)}</span>`,
  ).join('')

  return div(
    'flex-direction:column;',
    div(
      'flex-direction:row;',
      div(`position:relative;width:${AXIS_W}px;height:${CHART_H}px;`, yLabels) +
        `<img src="data:image/svg+xml;base64,${btoa(svg)}" width="${CHART_W}" height="${CHART_H}"/>`,
    ) + div(`flex-direction:row;margin-left:${AXIS_W}px;margin-top:8px;`, xLabels),
  )
}

function legend(series: OgSeries[]): string {
  const years = ogData.years
  const last = years.length - 1
  const rows = [...series].reverse().map(s =>
    div(
      'flex-direction:row;align-items:center;margin-bottom:10px;',
      div(`width:18px;height:18px;border-radius:4px;background:${s.color};margin-right:12px;`) +
        span(`flex-grow:1;font-size:22px;color:${TEXT};`, s.label) +
        span(`font-size:22px;font-weight:700;color:${TEXT};`, fmtCount(s.values[last])),
    ),
  ).join('')
  return div(
    `flex-direction:column;width:${LEGEND_W}px;justify-content:center;`,
    span(`font-size:18px;color:${MUTED};letter-spacing:2px;margin-bottom:14px;`, `${years[last]} PASSENGERS`) + rows,
  )
}

const eyebrow = (): string =>
  span(`font-size:20px;color:${MUTED};letter-spacing:3px;`, 'HUB BOUND TRAVEL')

function chartCard(view: OgView): string {
  const series = seriesFor(view)
  const { title, subtitle } = titles(view)
  const header = div(
    'flex-direction:column;',
    div(
      'flex-direction:row;justify-content:space-between;',
      eyebrow() + span(`font-size:20px;color:${MUTED};`, 'hbt.hccs.dev'),
    ) +
      span(`font-size:50px;font-weight:700;color:${TEXT};margin-top:14px;line-height:1.1;`, title) +
      span(`font-size:26px;color:${MUTED};margin-top:8px;`, subtitle),
  )
  const body = div('flex-direction:row;justify-content:space-between;margin-top:30px;', chart(series) + legend(series))
  return div(
    `width:${W}px;height:${H}px;background:${BG};padding:${PAD - 10}px ${PAD}px;flex-direction:column;font-family:'Inter';`,
    header + body,
  )
}

/** Map titles name the direction + time, not a grouping (the map shows both). */
function mapTitles(view: OgView): { title: string; subtitle: string } {
  const years = ogData.years
  const arrow = view.dir === 'entering' ? 'NJ→NY' : 'NY→NJ'
  return {
    title: `${arrow} passenger flows`,
    subtitle: `${TIME_LABELS[view.dir][view.time]}, Fall business day, ${years[years.length - 1]}`,
  }
}

const img = (src: string, w: number, h: number, style = ''): string =>
  `<img src="${src}" width="${w}" height="${h}" style="${style}"/>`

/** Full-bleed map; a small caption chip bottom-left (clear of labels in both directions). */
function fullCard(view: OgView, mapUri: string): string {
  const { title, subtitle } = mapTitles(view)
  const chip = div(
    `position:absolute;left:20px;bottom:18px;flex-direction:column;padding:10px 16px;border-radius:10px;background:rgba(26,26,46,0.88);`,
    span(`font-size:15px;color:${MUTED};letter-spacing:2px;`, 'HUB BOUND TRAVEL') +
      span(`font-size:26px;font-weight:700;color:${TEXT};margin-top:2px;`, title) +
      span(`font-size:18px;color:${MUTED};margin-top:2px;`, subtitle),
  )
  return div(
    `position:relative;width:${W}px;height:${H}px;background:${BG};font-family:'Inter';`,
    img(mapUri, W, H, 'position:absolute;left:0;top:0;') + chip,
  )
}

/** Narrow map on the left, a column on the right. */
function sideCard(mapUri: string, column: string): string {
  return div(
    `width:${W}px;height:${H}px;background:${BG};flex-direction:row;font-family:'Inter';`,
    img(mapUri, MAP_COL_W, H) +
      div(`width:${SIDE_W}px;height:${H}px;flex-direction:column;padding:${PAD - 8}px 36px;`, column),
  )
}

function sideHeader(view: OgView): string {
  const { title, subtitle } = mapTitles(view)
  return eyebrow() +
    span(`font-size:44px;font-weight:700;color:${TEXT};margin-top:18px;line-height:1.1;`, title) +
    span(`font-size:21px;color:${MUTED};margin-top:10px;`, subtitle)
}

const footer = (): string =>
  div('flex-grow:1;flex-direction:column;justify-content:flex-end;', span(`font-size:20px;color:${MUTED};`, 'hbt.hccs.dev'))

function mapCard(view: OgView, mapUri: string): string {
  const years = ogData.years
  const last = years.length - 1
  const totals = yearTotals(seriesFor({ ...view, page: 'index', gran: 'crossing' }))
  const i19 = years.indexOf(2019)
  const vs19 = i19 >= 0 ? Math.round((totals[last] / totals[i19] - 1) * 100) : null
  const stat = div(
    'flex-direction:column;margin-top:44px;',
    span(`font-size:18px;color:${MUTED};letter-spacing:2px;`, 'TOTAL PASSENGERS') +
      span(`font-size:72px;font-weight:700;color:${TEXT};line-height:1.05;`, totals[last].toLocaleString('en-US')) +
      (vs19 === null ? '' : span(
        `font-size:24px;color:${MUTED};margin-top:6px;`,
        `${vs19 >= 0 ? '+' : '−'}${Math.abs(vs19)}% vs. 2019`,
      )),
  )
  return sideCard(mapUri, sideHeader(view) + stat + footer())
}

function mosaicCard(view: OgView, mapUri: string): string {
  const series = seriesFor({ ...view, page: 'index', gran: 'crossing' })
  const years = ogData.years
  const mini = div(
    'flex-direction:column;margin-top:30px;',
    span(`font-size:16px;color:${MUTED};letter-spacing:2px;margin-bottom:8px;`, `${years[0]}–${years[years.length - 1]}, BY CROSSING`) +
      chart(series, { w: SIDE_W - 72 - 44, h: 190, axisW: 44, fontPx: 14 }),
  )
  // No room for the `hbt.hccs.dev` footer under the chart.
  return sideCard(mapUri, sideHeader(view) + mini)
}

export function renderCard(view: OgView, layout: OgLayout = DEFAULT_LAYOUT, mapUri?: string): string {
  if (view.page === 'nyc' || layout === 'chart') return chartCard(view)
  if (!mapUri) throw new Error(`layout ${layout} needs a map capture`)
  return layout === 'full' ? fullCard(view, mapUri) : layout === 'map' ? mapCard(view, mapUri) : mosaicCard(view, mapUri)
}

export async function ogImage(view: OgView, layout: OgLayout = DEFAULT_LAYOUT, mapUri?: string): Promise<Response> {
  const [regular, bold] = await loadFonts()
  return new ImageResponse(renderCard(view, layout, mapUri), {
    width: W,
    height: H,
    fonts: [
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: bold, weight: 700, style: 'normal' },
    ],
    headers: { 'Cache-Control': 'public, max-age=604800' },
  })
}
