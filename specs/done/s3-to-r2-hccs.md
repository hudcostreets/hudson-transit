# hbt: migrate public data S3 → R2 (HCCS)

Follow the shared **playbook**: `$c/hccs/path/specs/s3-to-r2-hccs-playbook.md`
(reference impl: `path`, commits `4928858` + `adc022f`). This file is just hbt's
deltas. **Closest to path** of the three — same DVX/hudcostreets-S3 shape.

## Deltas

- **Data store:** DVX remote `s3://hudcostreets/hbt/.dvc/cache` → **`r2://hbt`**
  (HCCS). hbt currently shares the `hudcostreets` bucket with `path` (under the
  `hbt/` prefix); give it its own top-level R2 bucket. Small dataset — the
  local-mirror sync (playbook step 2) is quick.
- **Domain (easy — no zone move):** site is `hbt.hccs.dev` (GH Pages), and
  `hccs.dev` is already a CF zone. Serve blobs from a sibling host under it — e.g.
  **`data.hbt.hccs.dev`** (or `hbt-data.hccs.dev`) — a trivial R2 custom-domain
  attach; CF auto-creates the CNAME. No registrar/NS work.
- **FE data-loading — INVESTIGATE:** no `hyparquet` / `vite-plugin-dvc` /
  `asyncBufferFrom*` in `www/src` (unlike path). Find how the FE actually reaches
  the data (bundled? a data API/Worker? see this repo's `specs/data-api.md`).
  That determines whether playbook step 5 (repoint a base URL) is one constant or
  something else, and whether step 6 (HEAD-503) even applies (likely not, if it's
  not hyparquet doing range/HEAD reads).
- **CI:** deploy workflow is `.github/workflows/deploy.yml`; repo is
  `hudcostreets/hudson-transit` (remote `h`). Find where it reads S3 creds for
  `dvx pull`/`push` and swap to an hbt-scoped R2 token.

## Open decisions

- Blob hostname: `data.hbt.hccs.dev` vs other (user chose per-project own-domain;
  hbt's own domain is under hccs.dev, so this is the natural pick).
- Confirm nothing else references `s3://hudcostreets/hbt` (e.g. README asset links).

## Done (via `specs/workers-assets-r2-files.md`)

- **Data store:** DVX remote is `r2` = `s3://hbt/.dvc/cache` on the HCCS account (`9bafd5b`); its own top-level bucket `hbt`.
- **Domain:** no separate data host. The FE bundles its JSON at build time (no runtime blob reads, so the playbook's base-URL / HEAD-503 steps don't apply); public blobs are served by the site's own Worker at `hbt.hccs.dev/api/files/*`, browsable at `/files`.
- **CI:** GHP `deploy.yml` removed; `deploy-worker.yml` never runs `dvx pull` (JSON is tracked), so it needs only `CLOUDFLARE_API_TOKEN`.
- **Old store:** `s3://hudcostreets/hbt/` (RAC AWS, 9 objects): R2 parity checked 2026-09-27 (same keys + sizes; keys are content hashes) and nothing references it. Left for manual cleanup.
