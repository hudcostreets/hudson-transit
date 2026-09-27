/**
 * FE Worker (Workers + static Assets): serves the SPA from `env.ASSETS`, and
 * rewrites `<title>` + OG meta on HTML responses per route and view params.
 * Also serves:
 * - `/og/{index,nyc}.png?d=&t=&g=`: per-view OG images (`og.ts`, Satori).
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
import { ogImage, titles, TIME_LABELS, type Direction, type OgPage, type OgView, type TimePeriod } from './og'

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

async function handleOg(request: Request, page: OgPage, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await ogImage(ogView(page, new URL(request.url).searchParams))
  ctx.waitUntil(cache.put(request, response.clone()))
  return response
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
    const og = url.pathname.match(/^\/og\/(index|nyc)\.png$/)
    if (og) {
      return handleOg(request, og[1] as OgPage, ctx)
    }
    const response = await env.ASSETS.fetch(request)
    if (!(response.headers.get('content-type') || '').includes('text/html')) {
      return response
    }
    // `wrangler dev` has no version id.
    const meta = resolveOgMeta(url, env.CF_VERSION_METADATA.id.slice(0, 8) || 'dev')
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
