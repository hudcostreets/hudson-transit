# hbt: GHP → Workers + Assets, public R2 mirror, `/files` browser, dynamic OGIs

Supersedes `specs/s3-to-r2-hccs.md` (whose FE/CI assumptions don't hold for hbt; see "Status quo").

## Status quo

- FE is a static Vite SPA on **GitHub Pages** (`.github/workflows/deploy.yml`, `www/public/CNAME` → `hbt.hccs.dev`). `404.html` is a copy of `index.html` for SPA routes (`/nyc`), so non-root routes are served with status 404.
- **Data is bundled**, not fetched: `www/src/data` → `../../data`, and `App.tsx` imports `data/*.json` directly (the main chunk is ~18MB). The JSONs are git-tracked *and* DVX-tracked.
- **DVX remote** is `s3://hudcostreets/hbt/.dvc/cache` (RAC AWS, shared bucket with `path`). CI never reads it: `deploy.yml` doesn't `dvx pull`, and no workflow reads AWS creds.
- **Raw NYMTC reports** (PDFs + xlsx appendices, 2014–2024, ~62MB) are git-tracked under `20??/`.
- One global `og:image` (`https://hbt.hccs.dev/og.png`); every URL unfurls the same card.

## Goals

1. **Workers + Assets ("W+A")**: one Worker serves the SPA from `assets`, with OG logic as ordinary Worker code (Cloudflare's forward path; matches `crashes`, `watchy`, etc.).
2. **Public R2 mirror** (HCCS account): raw NYMTC reports + our extracted/processed data, and the DVX cache.
3. **`/files`** browser over that bucket, via [`@rdub/file-tree`].
4. **Dynamic OGIs**: a shared link's `og:image` is rendered per request for *that* view (page, direction, time window, year, chart view, …).

## 1. R2 bucket `hbt` (HCCS account)

- Credentials (user creates in the CF dashboard; Claude drives the forms, user confirms, user copies secrets into `.envrc` / `gh secret set` — secrets never pass through the chat):
  - **R2 token**, bucket-scoped to `hbt`, Object Read & Write → `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (+ `R2_ENDPOINT`). Used by DVX (local + CI) and by CI uploads (e.g. the NYMTC cron mirroring a new report).
  - **Account API token** for deploys: Workers Scripts Edit, plus whatever `wrangler deploy` needs to attach the `hbt.hccs.dev` custom domain (Zone `hccs.dev`: Workers Routes Edit + DNS Edit). → GH secret `CLOUDFLARE_API_TOKEN` (+ var `CLOUDFLARE_ACCOUNT_ID`).
- Layout:
  - `raw/<year>/…` — NYMTC originals, mirrored from `20??/` with the original filenames.
  - `data/…` — extracted/processed outputs (`data/*.json`, and any future parquet/CSV).
  - `.dvc/cache/…` — DVX cache (`.dvc/config` remote `r2`: `url = s3://hbt/.dvc/cache` + `endpointurl`, same shape as `path`).
- No public r2.dev / bucket custom domain needed: the Worker reads the bucket via a binding and serves listings + downloads.
- Retire `s3://hudcostreets/hbt` after a few green days.

### Done (2026-09-27)

- Bucket `hbt` created (HCCS account `2363…937e`, Automatic location, Standard, private).
- Tokens (Account API tokens, HCCS):
  - `hbt RW` — R2 Object Read & Write, bucket `hbt` only. Local: `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_TOKEN` in `hbt/.envrc`, `R2_ENDPOINT` in `$hccs/.envrc`. GH secrets `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`. Verified: lists `hbt`, denied on `path`.
  - `hbt deploy` — zone `hccs.dev`: Workers Routes Write, DNS Write, Zone Read; account: Workers Scripts Write, Workers Tail Read, Workers Observability Edit, Account Settings Read. Local `CLOUDFLARE_API_TOKEN` in `hbt/.envrc`; GH secret `CLOUDFLARE_API_TOKEN`, GH var `CLOUDFLARE_ACCOUNT_ID`. Verified: DNS/routes OK on `hccs.dev`, denied on `ctbk.dev`; R2 denied. Add Browser Rendering when §4 needs it.
- Uploaded (with the `hbt RW` keys): `.dvc/cache/files/**` (9 objects; identical set to `s3://hudcostreets/hbt/.dvc/cache`, so pushed from the local cache instead of mirroring S3), `raw/20??/**` (123: 13 PDFs + 110 xlsx, original paths), `data/*.json` (8). Key+size parity with local: 140/140.
- `.dvc/config` → remote `r2`. Cold `dvx pull` in a fresh clone (empty cache, JSON deleted, `AWS_*` = the `hbt RW` keys) fetched all 8 files; md5s match.
- Local `dvx` needs `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` = the R2 keys (and `AWS_PROFILE` unset).

## 2. W+A Worker `hbt-www`

- `www/wrangler.jsonc`: `main = "worker/index.ts"`, `assets: { directory: "./dist", binding: "ASSETS", not_found_handling: "single-page-application" }` (drop the `404.html` copy), R2 binding `HBT_BUCKET` → `hbt`.
- `run_worker_first`: HTML routes (`/`, `/nyc`, `/nyc/*`, `/files`, `/files/*`) + `/og/*` + `/api/*`. Hashed `/assets/*` bypass the Worker; `_headers` gives them `Cache-Control: public, max-age=31536000, immutable` (W+A's default is `max-age=0`).
- `worker/index.ts`: `env.ASSETS.fetch(request)` for the shell, then `HTMLRewriter` sets `og:title` / `og:description` / `og:url` / `og:image` (→ the dynamic OG route with the page's normalized params) per request.
- Custom domain `hbt.hccs.dev` → Worker (`hccs.dev` is already a CF zone; no second-domain complications like `crashes.hudcostreets.org`). Expect a short gap when the hostname moves from GHP.
- CI: replace `deploy.yml`'s Pages steps with build + `wrangler deploy` (`cloudflare/wrangler-action`). Remove `www/public/CNAME` and disable GHP after cutover.

### Implemented (2026-09-27; `workers.dev` only, GHP still serves `hbt.hccs.dev`)

- `www/wrangler.jsonc`: `hbt-www`, HCCS `account_id`, `workers_dev: true`, assets `./dist` + SPA fallback, `run_worker_first: ["/", "/nyc", "/nyc/*"]` (extend with `/files*`, `/og/*`, `/api/*` in §3/§4), R2 binding `HBT_BUCKET` → `hbt`, observability on.
- `www/worker/index.ts`: `env.ASSETS.fetch` + `HTMLRewriter` for `<title>`, `og:title`, `og:description`, `og:url`, `og:image` (origin-relative, so `workers.dev` previews are self-consistent). `resolveOgMeta` decodes `d` / `t` with the FE's encodings: `/` with no view params keeps today's tags exactly; e.g. `/?d=nynj` → "NY→NJ, 5-6pm — Hub Bound Travel"; `/nyc?d=nynj&t=3h` → "All sectors — …", "Travel out of Manhattan's CBD from all sectors, 4-7pm, …". `og:image` stays `/og.png` until §4.
- `www/worker/_headers` (copied into `dist/` by `pnpm deploy:worker`): `/assets/*` immutable (verified `max-age=31536000, immutable`).
- `www/package.json`: `wrangler` + `@cloudflare/workers-types` devDeps; `deploy:worker` (build + `_headers` + `wrangler deploy`), `typecheck:worker`.
- `.github/workflows/deploy-worker.yml`: typecheck + `pnpm deploy:worker` on push (secret `CLOUDFLARE_API_TOKEN`, var `CLOUDFLARE_ACCOUNT_ID`), alongside `deploy.yml` (GHP) until cutover.
- Deployed → <https://hbt-www.hccs-ctbk.workers.dev>. Curl sweep (`/`, `/?d=nynj`, `/?t=3h`, `/?d=nynj&t=1d&yr=2019`, `/?fs=1`, `/nyc`, `/nyc?d=nynj&t=3h`, `/nonexistent/x`): all 200 (GHP: `/nyc*` and unknown paths are 404s). CIC: `/` renders chart + map, `/nyc` all 6 sections; Carto basemap style/tiles.json/sprites 200 from `workers.dev` (no domain allowlist, unlike crashes' Stadia).
- Fixed along the way: `NycFlowMap`'s map-kick poll called `isSourceLoaded('carto')` before the style added the source, which throws (and killed the poll); now guarded with `getSource('carto')`.
- `wrangler deploy` warns it can't auto-provision-check `HBT_BUCKET` (the deploy token has no R2 perms); harmless, the bucket exists.

### Cutover (2026-09-27, 04:14:31–04:15:03 UTC)

- Deleted the DNS-only `CNAME hbt.hccs.dev → hudcostreets.github.io` (record `ad968cd5…`; re-create it to roll back), then `wrangler deploy` with `routes: [{ pattern: "hbt.hccs.dev", custom_domain: true }]` (CF created the record + cert). ~30s gap; first 200 from CF at 04:15:03.
- OG sweep on `hbt.hccs.dev`: `/`, `/?d=nynj`, `/?t=3h`, `/nyc`, `/nyc?d=nynj&t=3h`, `/nonexistent/x`, `/og.png`, `/favicon.svg` all 200 from `server: cloudflare`, tags as on `workers.dev` (with `hbt.hccs.dev` origins).
- GHP: custom domain cleared (`cname: null`), `www/public/CNAME` + `.github/workflows/deploy.yml` deleted, `404.html` copy dropped from `build`. The Pages site itself (at `hudcostreets.github.io/hudson-transit`) can be unpublished once the Worker has a few green days.

## 3. `/files`

- Server: `createHandlers(R2Store(env.HBT_BUCKET, { prefixes: ["raw/", "data/"] }), { basePath: "/api/files" })` from `@rdub/file-tree` (same shape as `crashes/cells-api` `/v1/files/*`, but same-origin, so no CORS).
- FE: `/files/*` route rendering `<FileTree store={HttpStore("/api/files")} routeBase="/files" />` (as `crashes/www/src/routes/FilesPage.tsx`). Previews: PDFs, xlsx (download), JSON.
- OG for `/files/*`: `@rdub/file-tree/og` (`renderOgCard` / `injectOgTags`) → per-path cards.
- Link it from the site header/footer and README.

### Implemented (2026-09-27)

- `www/worker/index.ts`: `/api/files/*` → `createHandlers(R2Store(env.HBT_BUCKET, { prefixes: ['raw/', 'data/'], bucketName: 'hbt' }), { basePath: '/api/files', corsOrigin: null })` (same-origin; downloads via Worker proxy — largest object is 20MB). `/files*` gets per-path `<title>` / OG tags (e.g. "raw/2024 — Hub Bound Travel files"); `og:image` is still the static one (§4 can use `@rdub/file-tree/og` cards). `run_worker_first` += `/files`, `/files/*`, `/api/*`.
- PDFs: file-tree `ca0c1d8` (upstream `specs/done/http-store-pdf-inline-and-prefix-403.md`) has the viewers request `/get?…&inline=1` (`Content-Disposition: inline`) while the download link keeps `attachment`, and out-of-prefix requests (e.g. `.dvc/`) are 404s. That replaced an interim Worker rewrite of `attachment`→`inline` for `*.pdf` (`a685b4b` always sent `attachment`, so `PdfViewer`'s `<iframe>` downloaded; `.dvc/` was a 500).
- FE: `src/main.tsx` lazy-loads `FilesPage` for `/files*` and `App` otherwise, so `/files` is a 62KB chunk instead of the ~18MB data-laden `App`. `src/FilesPage.tsx`: `<BrowserRouter>` (file-tree needs a router; the rest of the app routes on `location.pathname`) + `<FileTree store={HttpStore('/api/files', { describe: 'r2://hbt/' })} routeBase="/files" />`. `App.scss`: `color-scheme` per theme (file-tree inherits UA colors), `.files-page` styles. Footer links `/files`.
- Deps: `@rdub/file-tree` via `pds` (GH dist `ca0c1d8`), `react-router-dom`. Its dist `package.json` lost `peerDependenciesMeta` (only 3 of 12 peers optional), so pnpm tried to auto-install `@rdub/treemap` (not on npm → 404); worked around with `pnpm.packageExtensions` re-marking them optional. Upstream: `$c/js/npm-dist/specs/preserve-peer-dependencies-meta.md`.
- Verified with `wrangler dev --remote` (real R2 binding): root lists `data/` + `raw/` only; `raw/2024/` 11 entries; PDF renders in the viewer (`inline`, `application/pdf`, 130 pages); `crossings.json` renders; `.dvc/` list/get refused; `/`, `/?d=nynj`, `/nyc` unchanged (chart/map/6 sections), no console errors.

## 4. Dynamic OGIs

- Route: `GET /og/<page>.png?<the page's own query params>` (e.g. `/og/index.png?d=nynj&t=3h&yr=2019`, `/og/nyc.png?…`). The HTMLRewriter pass points `og:image` there.
- Rendering — **open decision**:
  - **Satori** (`workers-og`, as `rac/mortgage-viz/functions/og.ts`): draw the view from the bundled JSON in the Worker (no browser). Good fit for the bubble/line charts. The GeoSankey map is harder: ribbons can be projected to SVG paths, but no basemap tiles.
  - **Browser Rendering** (`@cloudflare/puppeteer`, `browser` binding): screenshot the real page in a chrome-less `?og=1` mode at 1200×630, waiting for a "map idle" signal (as `crashes/specs/workers-assets-and-map-ogi.md` §2 proposes). Pixel-faithful for every view including the map; metered by browser-seconds, slower cold renders.
  - Possibly both: Satori for chart views, Browser Rendering for map views.
- Normalize params (sort; drop UI-only ones like `fs`, `ws`/`gs`/`hp`; round `ll`) so near-identical links share a render. Cache in R2 `og/<hash(normalized params + build id)>.jpg` + the edge cache. Invalid params → the static `og.png`.
- Fallback: if a render fails or exceeds a crawler-friendly budget (~5s), 302 to the static `og.png` and render in `ctx.waitUntil` so the next fetch is warm.

### Implemented (2026-09-27): Satori

- Renderer decision: Satori (`workers-og`) to start; Browser Rendering (map views) can come later.
- `/og/index.png` and `/og/nyc.png`, params `d` / `t` / `g` (same encodings as the pages). Card: eyebrow + title ("NJ→NY passengers by crossing", "Entering Manhattan's CBD, by sector") + subtitle ("8-9am, Fall business day · 2014–2024"), stacked bars of passengers per year (SVG data-URI `<img>`, shapes only), y/x labels and a legend (stack order, latest-year values) as HTML. `/`: by crossing (default) or mode (`g=m`); `/nyc`: by mode (default) or sector (`g=s`).
- Data: `scripts/og-data.ts` (`pnpm og-data`, run by `typecheck:worker` + `deploy:worker`) reuses the FE's own aggregation (`buildNycRecords`), labels (`CROSSING_LABELS`, `SECTOR_LABELS`) and colors (`DEFAULT_SCHEME`, `lib/nyc-colors.ts`, moved out of `NycBubbleChart`) → `worker/og-data.json` (~17KB, gitignored), instead of bundling ~4MB of source JSON into the Worker. 2024 values match the site (e.g. Lincoln (Bus) 28,883).
- Font: full Inter v3.19 woff (regular + bold) from jsDelivr (`rsms/inter`); the `@fontsource` "latin" subset lacks `→`. Fetched once per isolate, `cf.cacheTtl` 30d.
- Caching: `caches.default` keyed on the request URL; `Cache-Control: public, max-age=604800`. `og:image` URLs carry only non-default params in fixed order plus `v=<version id prefix>` (`version_metadata` binding), so each deploy busts crawler/edge caches. `og:image:alt` = card title + subtitle.
- Renders in ~0.3–0.9s uncached (via `wrangler dev --remote`).
- `/files/*` keeps the static `og.png`: `@rdub/file-tree/og` `renderOgCard` needs `@rdub/treemap` (not on npm).

### Map cards (2026-09-27, pending layout review)

- Browser Rendering dropped: the flow map only varies by direction × time period (6 views, latest year; data changes ~yearly), so the map is pre-rendered and Satori composes it. (ctbk's per-station cards have no map; its homepage OGI is a static mosaic regenerated in CI.)
- Captures: `pnpm og-maps` (`scripts/og-maps.sh`, headful scrns against the dev server) → `public/og-maps/{1200,780}/<nj-ny|ny-nj>-<1h|3h|1d>.jpg` (12, ~2.8MB, committed). Page mode `?fs=1&clean` = map only (GeoSankey `clean` hides the info panel + controls; fullscreen now locks page scroll).
- The Worker reads a capture via `env.ASSETS` and inlines it as a data URI. Layouts (`&layout=`, `OG_LAYOUTS` in `worker/og.ts`): `chart` (default, unchanged), `full` (1200 map + caption chip), `map` (780 map + title / total / % vs. 2019), `mosaic` (780 map + title / mini stacked bars). `/nyc` stays `chart`.
- `/og/review`: live grid of layouts × a few views, plus notes on how OGIs are built. Pick a default there; then map layouts can drop `g` from canonical `og:image` URLs (the map ignores grouping).
- Found along the way: the map's initial fit reserved label space only on the east, so NY→NJ labels clipped at narrow widths; `defaultView(direction)` now reserves it on the label side (only as much as needed), and re-centers on direction toggle when `ll` is unset.

## Related

- `.github/workflows/check-nymtc-2025.yml`: on a hit, also mirror the 2025 report into `raw/2025/` (needs the R2 token in GH secrets).

## Open decisions

- OGI renderer (§4).
- Whether to move data out of the JS bundle (fetch from R2 / assets) — not required by this spec, but would shrink the 18MB chunk.

[`@rdub/file-tree`]: https://github.com/runsascoded/file-tree
