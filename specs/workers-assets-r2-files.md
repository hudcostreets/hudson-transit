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

### Remaining cutover steps

1. Add `"routes": [{ "pattern": "hbt.hccs.dev", "custom_domain": true }]` to `wrangler.jsonc`; remove the GHP custom domain (repo Settings → Pages) and `www/public/CNAME`; deploy. Expect a short gap while the hostname moves.
2. Verify on `hbt.hccs.dev` (curl OG sweep, CIC).
3. Delete `deploy.yml` (GHP) and the `404.html` copy in `build`; disable Pages.

## 3. `/files`

- Server: `createHandlers(R2Store(env.HBT_BUCKET, { prefixes: ["raw/", "data/"] }), { basePath: "/api/files" })` from `@rdub/file-tree` (same shape as `crashes/cells-api` `/v1/files/*`, but same-origin, so no CORS).
- FE: `/files/*` route rendering `<FileTree store={HttpStore("/api/files")} routeBase="/files" />` (as `crashes/www/src/routes/FilesPage.tsx`). Previews: PDFs, xlsx (download), JSON.
- OG for `/files/*`: `@rdub/file-tree/og` (`renderOgCard` / `injectOgTags`) → per-path cards.
- Link it from the site header/footer and README.

## 4. Dynamic OGIs

- Route: `GET /og/<page>.png?<the page's own query params>` (e.g. `/og/index.png?d=nynj&t=3h&yr=2019`, `/og/nyc.png?…`). The HTMLRewriter pass points `og:image` there.
- Rendering — **open decision**:
  - **Satori** (`workers-og`, as `rac/mortgage-viz/functions/og.ts`): draw the view from the bundled JSON in the Worker (no browser). Good fit for the bubble/line charts. The GeoSankey map is harder: ribbons can be projected to SVG paths, but no basemap tiles.
  - **Browser Rendering** (`@cloudflare/puppeteer`, `browser` binding): screenshot the real page in a chrome-less `?og=1` mode at 1200×630, waiting for a "map idle" signal (as `crashes/specs/workers-assets-and-map-ogi.md` §2 proposes). Pixel-faithful for every view including the map; metered by browser-seconds, slower cold renders.
  - Possibly both: Satori for chart views, Browser Rendering for map views.
- Normalize params (sort; drop UI-only ones like `fs`, `ws`/`gs`/`hp`; round `ll`) so near-identical links share a render. Cache in R2 `og/<hash(normalized params + build id)>.jpg` + the edge cache. Invalid params → the static `og.png`.
- Fallback: if a render fails or exceeds a crawler-friendly budget (~5s), 302 to the static `og.png` and render in `ctx.waitUntil` so the next fetch is warm.

## Related

- `.github/workflows/check-nymtc-2025.yml`: on a hit, also mirror the 2025 report into `raw/2025/` (needs the R2 token in GH secrets).

## Open decisions

- OGI renderer (§4).
- Whether to move data out of the JS bundle (fetch from R2 / assets) — not required by this spec, but would shrink the 18MB chunk.

[`@rdub/file-tree`]: https://github.com/runsascoded/file-tree
