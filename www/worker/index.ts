/**
 * FE Worker (Workers + static Assets): serves the SPA from `env.ASSETS`, and
 * rewrites `<title>` + OG meta on HTML responses per route and view params.
 *
 * `run_worker_first` (see `wrangler.jsonc`) sends only SPA navigation routes
 * here; hashed `/assets/*` and other static files go straight to the asset
 * server. Anything that reaches the Worker and isn't HTML passes through.
 */

interface Env {
  ASSETS: Fetcher
  HBT_BUCKET: R2Bucket
}

interface OgMeta {
  title: string
  description: string
  url: string
  image: string
}

type Direction = 'entering' | 'leaving'
type TimePeriod = 'peak_1hr' | 'peak_period' | '24hr'

// Same encodings as the FE's `useUrlState` params (`d`, `t`).
const direction = (p: URLSearchParams): Direction => p.get('d') === 'nynj' ? 'leaving' : 'entering'
const timePeriod = (p: URLSearchParams): TimePeriod => {
  const t = p.get('t')
  return t === '3h' ? 'peak_period' : t === '1d' ? '24hr' : 'peak_1hr'
}

const TIME_LABELS: Record<Direction, Record<TimePeriod, string>> = {
  entering: { peak_1hr: '8-9am', peak_period: '7-10am', '24hr': '24hr' },
  leaving: { peak_1hr: '5-6pm', peak_period: '4-7pm', '24hr': '24hr' },
}

const YEARS = '2014-2024'
const SOURCE = 'From NYMTC Hub Bound Travel reports.'
const SITE_TITLE = 'Hub Bound Travel'

export function resolveOgMeta(url: URL): OgMeta {
  const params = url.searchParams
  const dir = direction(params)
  const time = timePeriod(params)
  const isDefaultView = dir === 'entering' && time === 'peak_1hr'
  const timeLabel = TIME_LABELS[dir][time]
  const image = `${url.origin}/og.png`
  const pageUrl = `${url.origin}${url.pathname}${url.search}`

  if (/^\/nyc\/?$/.test(url.pathname)) {
    const verb = dir === 'entering' ? 'into' : 'out of'
    return {
      title: `All sectors — ${SITE_TITLE}`,
      description: `Travel ${verb} Manhattan's Central Business District from all sectors, ${timeLabel}, ${YEARS}. ${SOURCE}`,
      url: pageUrl,
      image,
    }
  }

  const arrow = dir === 'entering' ? 'NJ→NY' : 'NY→NJ'
  return {
    title: isDefaultView ? SITE_TITLE : `${arrow}, ${timeLabel} — ${SITE_TITLE}`,
    description: isDefaultView
      ? `${arrow} transit trends, ${YEARS}. ${SOURCE}`
      : `${arrow} transit trends, ${timeLabel}, ${YEARS}. ${SOURCE}`,
    url: pageUrl,
    image,
  }
}

const setContent = (value: string): HTMLRewriterElementContentHandlers => ({
  element(el) { el.setAttribute('content', value) },
})

export default {
  async fetch(request, env): Promise<Response> {
    const response = await env.ASSETS.fetch(request)
    if (!(response.headers.get('content-type') || '').includes('text/html')) {
      return response
    }
    const og = resolveOgMeta(new URL(request.url))
    return new HTMLRewriter()
      .on('title', { element(el) { el.setInnerContent(og.title) } })
      .on('meta[property="og:title"]', setContent(og.title))
      .on('meta[property="og:description"]', setContent(og.description))
      .on('meta[property="og:url"]', setContent(og.url))
      .on('meta[property="og:image"]', setContent(og.image))
      .transform(response)
  },
} satisfies ExportedHandler<Env>
