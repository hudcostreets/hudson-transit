# Adopt geo-sankey: new arrow defaults + compiled `react/` subpath

## Status

- [x] Phase 1 — `pds l geo-sankey`: verified `tsc -b --noEmit` clean (modulo
      pre-existing `strictNullChecks` issues in `geo-sankey/src/{flow,graph}.ts`,
      noted as out-of-scope below). `vite build` clean. Visual sweep on `/`
      and `/nyc` clean.
- [x] Pushed `geo-sankey` `2173f20` + `a532f75` to `r/main`. CI run
      [25020779671](https://github.com/runsascoded/geo-sankey/actions/runs/25020779671)
      published dist `3af38f7` (tag `geo-sankey@0.1.0-dist.a532f75`).
- [x] Phase 2 — `pds g geo-sankey`: pinned new SHA in
      `www/package.json`. `tsc -b --noEmit` clean (zero errors — the
      pre-existing strict-null issues in lib source are hidden behind
      `skipLibCheck` once dist ships compiled `.d.ts`). `vite build` clean.
      Visual sweep on `/` + `/nyc` clean.
- [x] `tsconfig.app.json` `paths` shim removed; `src/types/geo-sankey-react.d.ts`
      deleted; `MapControls.tsx` switched from hand-computed
      `ARROW_WING`/`ARROW_LEN` to `resolveArrowDefaults()` from the lib.

## Context

`geo-sankey` just shipped two changes that were originally specced from
this project (`hbt`):

1. **Arrow defaults** (`specs/done/arrow-defaults.md` in geo-sankey, commit
   `2173f20`): library defaults bumped from `wing = 0.4, angle = 45` to
   `wing = 0.65, angle = 60`. `RibbonArrowOpts.{arrowWingFactor,
   arrowLenFactor}` are now optional — bare `ribbonArrow*` calls inherit
   the new defaults. New named exports: `resolveArrowDefaults({ wing?,
   angle? })`, `DEFAULT_WING`, `DEFAULT_ANGLE`.

2. **Compiled `react/` subpath** (`specs/done/react-subpath-dist.md`,
   commit `a532f75`): the dist branch now ships
   `react/index.{js,d.ts}` instead of raw `.ts(x)` source. Resolves the
   strict-`tsc` errors hbt was seeing on dist commit `2ddd8a6`:

   ```
   geo-sankey/react/components/NodeOverlay.tsx(22,7): error TS6133: 'HANDLE_MIN_PX' is declared but its value is never read.
   geo-sankey/react/components/SelectionSection.tsx(75,10): error TS6133: 'selections' is declared but its value is never read.
   geo-sankey/react/hooks/useGraphMutations.ts(2,1): error TS6133: 'FlowGraph' is declared but its value is never read.
   geo-sankey/react/hooks/useGraphMutations.ts(4,34): error TS6196: 'SelectionRef' is declared but never used.
   geo-sankey/react/hooks/useMapInteraction.ts(2,34): error TS6196: 'SelectionRef' is declared but never used.
   geo-sankey/react/hooks/useNodeDrag.ts(2,1): error TS6133: 'FlowGraph' is declared but its value is never read.
   ```

   Both the offending lines were cleaned up *and* the dist branch will
   no longer expose raw `.ts(x)` to consumer `tsc` runs (`skipLibCheck`
   only skips `.d.ts`, not source). Belt + suspenders.

## Goal

Validate the changes against `hbt`'s actual usage, both **locally**
(via `pdsl`/`pds l`, pointing at the workspace clone of geo-sankey)
**and** **via the published dist branch** (`pdsg`/`pds g`), and bump
the pinned dist SHA in `www/.pds.json` (or wherever it lives) so the
fix is in effect by default.

## Pre-conditions

- `geo-sankey` `main` HEAD is at `a532f75` or later. Two new commits to
  pull: `2173f20` (arrow defaults) and `a532f75` (react/ compilation).
- For the `pdsg` half: `geo-sankey`'s CI workflow has run on the new
  HEAD and published a fresh `dist`-branch SHA. The CI run prints the
  `pnpm add github:runsascoded/geo-sankey#<sha>` install command in its
  notice. The dist branch should contain
  `index.{js,d.ts}` + `react/index.{js,d.ts}` + a small shared chunk
  (e.g. `graph-XXXXX.js`).

## Plan

### Phase 1 — `pdsl` local test (no GH round-trip)

`hbt`'s `www/.pds.json` already declares `geo-sankey` with
`localPath: "../../../js/geo-sankey"` and `distBranch: "dist"`.

1. From `~/c/hccs/hbt/www/`:
   ```
   pds l geo-sankey
   pnpm install
   ```
   pds points the dep at the workspace source via pnpm's `link:`
   protocol. The build will follow into `geo-sankey/src/` and
   `geo-sankey/react/`.

2. **Strict-`tsc` check.** Run whatever HBT's main type-check command
   is (likely `pnpm -C www tsc --noEmit` or `pnpm -C www build`).
   Expected: zero errors from `node_modules/.../geo-sankey/**`.
   Specifically the six errors listed in the Context above must be
   gone. (If any new ones surface, file back as a follow-up spec on
   geo-sankey.)

3. **Build the site:** `pnpm -C www build`. Should succeed.

4. **Visual regression sweep.** The arrow defaults shifted from
   `wing 0.4 / angle 45` to `wing 0.65 / angle 60`. Spec rationale:
   wider, more "arrowy" defaults read better at small ribbon widths.
   The screenshot in the geo-sankey readme regenerates with no visible
   regression, but `hbt` has different scenes:

   - `/` (homepage)
   - `/nyc` (the page that motivated the spec — was getting "stubby /
     pinched" arrows when devs picked smaller numbers manually)
   - any other live pages

   Walk each one. Acceptable outcomes:
   - Arrows look the same or better → done, no callsite change.
   - Arrows now look *wrong* on a page that was previously hand-tuned
     to the old defaults → pass `{ wing: 0.4, angle: 45 }` (or whatever
     was working) explicitly at that callsite. The spec was explicit:
     "If a project wants the prior 'spearier' look, they pass `wing =
     0.4, angle = 45` explicitly — the change is opt-out, not opt-in."

   Where `hbt` was hand-picking `arrowWingFactor`/`arrowLenFactor`
   directly (bare `ribbonArrow*` calls), consider switching to the new
   `resolveArrowDefaults({ wing, angle })` helper for consistency
   between the `FlowGraph*` codepath and the bare-ribbon codepath.

### Phase 2 — `pdsg` published-dist test

After `geo-sankey` CI publishes the dist branch:

1. From `~/c/hccs/hbt/www/`:
   ```
   pds g geo-sankey
   pnpm install
   ```
   `pds g` resolves the latest dist SHA from
   `runsascoded/geo-sankey#dist` and pins it. Confirm the resolved
   SHA matches what `geo-sankey`'s CI printed.

2. Repeat the strict-`tsc` and build checks from Phase 1. No errors
   expected.

3. Spot-check the dist artifacts directly if it's quick:
   ```
   ls node_modules/.pnpm/geo-sankey@*/node_modules/geo-sankey
   # expect: index.js index.d.ts react/index.js react/index.d.ts
   #         graph-XXXXX.js (shared chunk)
   ```
   If `react/index.ts` (raw `.ts`) is still there instead of
   `react/index.js`, the dist build is mis-configured — file back to
   geo-sankey.

4. Same visual sweep as Phase 1.

### Phase 3 — commit the bump

Commit the updated `.pds.json` (or whatever pds wrote) on a branch and
push. The dist SHA is the trustworthy reference; once it's pinned, the
next dev who clones the repo gets the same artifacts.

## Implementation notes

- `pds.json` already lists `geo-sankey`. No new entry needed.
- The new `wing=0.65, angle=60` defaults flow through both the
  `renderFlowGraph*` family **and** the bare `ribbonArrow*` family
  (which `hbt` reportedly uses directly per the original spec).
- If `hbt` has its own `wing`/`angle` UI controls anywhere, default
  them to `0.65 / 60` to match what consumers using the lib defaults
  see. (The geo-sankey demo's slider default was bumped accordingly in
  the same commit.)
- New named exports `DEFAULT_WING` and `DEFAULT_ANGLE` are useful if
  hbt wants to surface the same defaults in its own controls without
  hardcoding numbers.

## Acceptance

- `pds l geo-sankey` → `pnpm tsc --noEmit` passes with no
  `geo-sankey/**` errors.
- `pds g geo-sankey` → same.
- All hbt pages render flow maps with no visual regression (or with a
  documented improvement).
- `.pds.json` updated to a fresh dist SHA and committed.

## Out of scope

- Any changes to geo-sankey itself — both source specs are in
  `specs/done/` already; further work goes in new specs.
- Surfacing `wing`/`angle` as user controls if `hbt` doesn't already
  have them — that's product UX, not a regression check.
- The pre-existing `n.bearing | undefined` ambiguity in
  `geo-sankey/src/graph.ts` (suppressed via `strictNullChecks: false`
  in the dts plugin). Not blocking; tracked separately.
