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
