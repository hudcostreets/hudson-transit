/**
 * FE Worker (Workers + static Assets): serves the SPA from `env.ASSETS`, and
 * rewrites `<title>` + OG meta on HTML responses per route and view params.
 * Also serves:
 * - `/og/{index,nyc}.png?d=&t=&g=[&layout=]`: per-view OG images (`og.ts`, Satori).
 * - `/og/review`: every layout for a few views, side by side.
 * - `/api/files/*`: `@rdub/file-tree` list/get over the R2 bucket `hbt`,
 *   backing the `/files/*` browser.
 *
 * `run_worker_first` (see `wrangler.jsonc`) sends only SPA navigation routes,
 * `/og/*` and `/api/*` here; hashed `/assets/*` and other static files go
 * straight to the asset server. Anything that reaches the Worker and isn't
 * HTML passes through.
 */
import { createHandlers } from '@rdub/file-tree/server'
import { R2Store } from '@rdub/file-tree/stores/r2'
import {
  DEFAULT_LAYOUT, isOgLayout, MAP_COL_W, mapCapture, OG_LAYOUTS, ogImage, titles, TIME_LABELS,
  type Direction, type OgLayout, type OgPage, type OgView, type TimePeriod,
} from './og'

interface Env {
  ASSETS: Fetcher
  HBT_BUCKET: R2Bucket
  CF_VERSION_METADATA: WorkerVersionMetadata
}

interface OgMeta {
  title: string
  description: string
  url: string
  image: string
  imageAlt: string
}

const YEARS = '2014-2024'
const SOURCE = 'From NYMTC Hub Bound Travel reports.'
const SITE_TITLE = 'Hub Bound Travel'
const STATIC_IMAGE_ALT = 'NJ→NY passengers by mode/crossing, 8-9am, Fall business day, 2014-2024'

const FILES_API = '/api/files'
// Top-level prefixes of the `hbt` bucket that are public (`.dvc/cache` isn't).
const FILES_PREFIXES = ['raw/', 'data/']

// Same encodings as the FE's `useUrlState` params (`d`, `t`, `g`).
const direction = (p: URLSearchParams): Direction => p.get('d') === 'nynj' ? 'leaving' : 'entering'
const timePeriod = (p: URLSearchParams): TimePeriod => {
  const t = p.get('t')
  return t === '3h' ? 'peak_period' : t === '1d' ? '24hr' : 'peak_1hr'
}
// `/` (`UnifiedChart`): `g=m` → by mode, default by crossing.
// `/nyc` (`NycBubbleChart`): `g=s` → by sector, default by mode.
const granularity = (page: OgPage, p: URLSearchParams): string =>
  page === 'nyc'
    ? (p.get('g') === 's' ? 'sector' : 'mode')
    : (p.get('g') === 'm' ? 'mode' : 'crossing')

export function ogView(page: OgPage, params: URLSearchParams): OgView {
  return { page, dir: direction(params), time: timePeriod(params), gran: granularity(page, params) }
}

/** Canonical query for a view's OG image: only non-default params, fixed order,
 *  plus the deployed version so a deploy busts crawler / edge caches. */
function ogImageUrl(origin: string, view: OgView, version: string): string {
  const q = new URLSearchParams()
  if (view.dir === 'leaving') q.set('d', 'nynj')
  if (view.time !== 'peak_1hr') q.set('t', view.time === 'peak_period' ? '3h' : '1d')
  const defaultGran = view.page === 'nyc' ? 'mode' : 'crossing'
  if (view.gran !== defaultGran) q.set('g', view.gran === 'sector' ? 's' : 'm')
  q.set('v', version)
  return `${origin}/og/${view.page}.png?${q}`
}

export function resolveOgMeta(url: URL, version: string): OgMeta {
  const pageUrl = `${url.origin}${url.pathname}${url.search}`
  // `public/og.png` (bubble-chart screenshot). The asset server ignores `v`,
  // which only busts crawler caches when it's regenerated.
  const staticImage = `${url.origin}/og.png?v=${version}`

  const files = url.pathname.match(/^\/files(?:\/(.*))?$/)
  if (files) {
    const path = decodeURIComponent(files[1] ?? '').replace(/\/+$/, '')
    return {
      title: path ? `${path} — ${SITE_TITLE} files` : `Files — ${SITE_TITLE}`,
      description: `NYMTC Hub Bound Travel reports (${YEARS}) and the data extracted from them.`,
      url: pageUrl,
      image: staticImage,
      imageAlt: STATIC_IMAGE_ALT,
    }
  }

  const params = url.searchParams
  const page: OgPage = /^\/nyc\/?$/.test(url.pathname) ? 'nyc' : 'index'
  const view = ogView(page, params)
  const timeLabel = TIME_LABELS[view.dir][view.time]
  const card = titles(view)
  const image = ogImageUrl(url.origin, view, version)
  const imageAlt = `${card.title}, ${card.subtitle}`

  if (page === 'nyc') {
    const verb = view.dir === 'entering' ? 'into' : 'out of'
    return {
      title: `All sectors — ${SITE_TITLE}`,
      description: `Travel ${verb} Manhattan's Central Business District from all sectors, ${timeLabel}, ${YEARS}. ${SOURCE}`,
      url: pageUrl,
      image,
      imageAlt,
    }
  }

  const isDefaultView = view.dir === 'entering' && view.time === 'peak_1hr'
  // The most-shared link (bare `/`, or explicit defaults) unfurls as the static
  // bubble-chart hero; other views get their own card.
  const isHeroView = isDefaultView && view.gran === 'crossing'
  const arrow = view.dir === 'entering' ? 'NJ→NY' : 'NY→NJ'
  return {
    title: isDefaultView ? SITE_TITLE : `${arrow}, ${timeLabel} — ${SITE_TITLE}`,
    description: isDefaultView
      ? `${arrow} transit trends, ${YEARS}. ${SOURCE}`
      : `${arrow} transit trends, ${timeLabel}, ${YEARS}. ${SOURCE}`,
    url: pageUrl,
    image: isHeroView ? staticImage : image,
    imageAlt: isHeroView ? STATIC_IMAGE_ALT : imageAlt,
  }
}

const setContent = (value: string): HTMLRewriterElementContentHandlers => ({
  element(el) { el.setAttribute('content', value) },
})

/** A static asset as a data URI (Satori embeds images; it doesn't fetch them). */
async function assetDataUri(env: Env, origin: string, path: string): Promise<string> {
  const r = await env.ASSETS.fetch(new Request(`${origin}${path}`))
  if (!r.ok) throw new Error(`asset ${path}: ${r.status}`)
  const bytes = new Uint8Array(await r.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${r.headers.get('content-type') ?? 'image/jpeg'};base64,${btoa(bin)}`
}

async function handleOg(request: Request, page: OgPage, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default
  const hit = await cache.match(request)
  if (hit) return hit
  const url = new URL(request.url)
  const view = ogView(page, url.searchParams)
  const l = url.searchParams.get('layout')
  const layout: OgLayout = page === 'nyc' ? 'chart' : isOgLayout(l) ? l : DEFAULT_LAYOUT
  const mapUri = layout === 'chart'
    ? undefined
    : await assetDataUri(env, url.origin, mapCapture(view, layout === 'full' ? 1200 : MAP_COL_W))
  const response = await ogImage(view, layout, mapUri)
  ctx.waitUntil(cache.put(request, response.clone()))
  return response
}

const REVIEW_VIEWS: [string, OgPage, string][] = [
  ['NJ→NY, 8-9am (default)', 'index', ''],
  ['NY→NJ, 4-7pm', 'index', 'd=nynj&t=3h'],
  ['NJ→NY, 24hr', 'index', 't=1d'],
  ['/nyc (chart only)', 'nyc', ''],
]

function handleReview(version: string): Response {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const sections = REVIEW_VIEWS.map(([label, page, q]) => {
    const layouts = page === 'nyc' ? OG_LAYOUTS.filter(([l]) => l === 'chart') : OG_LAYOUTS
    const figs = layouts.map(([l, name]) => {
      const src = `/og/${page}.png?${q ? `${q}&` : ''}layout=${l}&v=${version}`
      const tag = page === 'index' && l === DEFAULT_LAYOUT ? ' <span class="tag">current default</span>' : ''
      return `<figure><a href="${esc(src)}"><img src="${esc(src)}" width="600" height="315" alt="${esc(`${label}: ${name}`)}" loading="lazy"></a><figcaption><b>${l}</b> · ${esc(name)}${tag}</figcaption></figure>`
    }).join('')
    const pageUrl = `/${page === 'nyc' ? 'nyc' : ''}${q ? `?${q}` : ''}`
    return `<h2>${esc(label)} <a href="${esc(pageUrl)}">${esc(pageUrl)}</a></h2><div class="row">${figs}</div>`
  }).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OG card layouts</title>
<style>
  :root { color-scheme: dark; --bg: #1a1a2e; --fg: #e0e0e0; --muted: #a0a0b0; --link: #7fb2ff; --tag: #2e4a7a }
  @media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { color-scheme: light; --bg: #f6f7fb; --fg: #16182a; --muted: #5a6478; --link: #1f5fbf; --tag: #d6e4ff } }
  :root[data-theme="light"] { color-scheme: light; --bg: #f6f7fb; --fg: #16182a; --muted: #5a6478; --link: #1f5fbf; --tag: #d6e4ff }
  body { background: var(--bg); color: var(--fg); font: 15px/1.5 Inter, system-ui, sans-serif; margin: 0 auto; padding: 16px; max-width: 1260px }
  h1 { font-size: 22px; margin: 0 0 8px } p, li { color: var(--muted); margin: 0 0 8px } ul { padding-left: 20px; margin: 0 0 16px }
  h2 { font-size: 16px; margin: 28px 0 10px } h2 a { font-weight: 400; font-size: 14px; margin-left: 6px }
  a { color: var(--link) } code { font-size: 13px }
  .row { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(560px, 100%), 1fr)); gap: 16px }
  figure { margin: 0 } img { width: 100%; height: auto; border-radius: 8px; display: block; background: #111 }
  figcaption { color: var(--muted); font-size: 13px; margin-top: 4px }
  .tag { background: var(--tag); color: var(--fg); border-radius: 4px; padding: 1px 6px; margin-left: 4px; font-size: 12px }
</style></head><body>
<h1>OG card layouts</h1>
<p>How <a href="/">hbt.hccs.dev</a> builds link previews (<code>og:image</code>):</p>
<ul>
  <li>The Worker rewrites each page's <code>og:*</code> tags per view (<code>d</code> direction, <code>t</code> time period, <code>g</code> grouping), pointing <code>og:image</code> at <code>/og/{index,nyc}.png</code> with only non-default params, plus <code>v=&lt;deploy version&gt;</code> so each deploy busts crawler caches. Bare <code>/</code> uses the static bubble-chart screenshot (<code>/og.png</code>) instead.</li>
  <li>Cards are rendered per request with Satori (HTML/CSS → SVG → PNG) and edge-cached. Chart data is a ~17KB summary built from the site's own data code (<code>pnpm og-data</code>).</li>
  <li>Map layouts embed pre-rendered captures of the flow map (<code>/og-maps/{1200,780}/&lt;dir&gt;-&lt;time&gt;.jpg</code>; 6 views × 2 widths, <code>pnpm og-maps</code>): the map varies only by direction and time period, at the latest year.</li>
</ul>
<p>Images below are live (<code>&amp;layout=</code> selects one); click to open full size.</p>
${sections}
</body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}

async function handleFiles(request: Request, env: Env): Promise<Response> {
  const handlers = createHandlers(
    R2Store(env.HBT_BUCKET, { prefixes: FILES_PREFIXES, bucketName: 'hbt' }),
    { basePath: FILES_API, corsOrigin: null },
  )
  return await handlers.handle(request) ?? new Response('not found', { status: 404 })
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith(`${FILES_API}/`)) {
      return handleFiles(request, env)
    }
    // `wrangler dev` has no version id.
    const version = env.CF_VERSION_METADATA.id.slice(0, 8) || 'dev'
    const og = url.pathname.match(/^\/og\/(index|nyc)\.png$/)
    if (og) {
      return handleOg(request, og[1] as OgPage, env, ctx)
    }
    if (url.pathname === '/og/review') {
      return handleReview(version)
    }
    const response = await env.ASSETS.fetch(request)
    if (!(response.headers.get('content-type') || '').includes('text/html')) {
      return response
    }
    const meta = resolveOgMeta(url, version)
    return new HTMLRewriter()
      .on('title', { element(el) { el.setInnerContent(meta.title) } })
      .on('meta[property="og:title"]', setContent(meta.title))
      .on('meta[property="og:description"]', setContent(meta.description))
      .on('meta[property="og:url"]', setContent(meta.url))
      .on('meta[property="og:image"]', setContent(meta.image))
      .on('meta[property="og:image:alt"]', setContent(meta.imageAlt))
      .transform(response)
  },
} satisfies ExportedHandler<Env>
