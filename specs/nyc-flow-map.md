# `/nyc` flow map — all-sector geographic Sankey

A NYC-wide counterpart to `/`'s `GeoSankey`. Ribbons enter the CBD
(below 60th St) from all four cardinal sectors plus Staten Island /
Roosevelt Island, sized by passenger volume.

## Data

Same `NycRecord[]` as the bubble chart (see [nyc-bubble.md]).
At the map level we collapse to per-(sector, mode, year, time, direction)
totals.

[nyc-bubble.md]: nyc-bubble.md

## Geographic anchors

The trick is finding a single representative path per (sector, mode)
that's correct enough to read but not so detailed it becomes unreadable.

### `nj` (W)
Already covered by `/`'s GeoSankey. Reuse the existing `CROSSING_PATHS`
+ ferry graph.

### `60th_street` (N)
A horizontal boundary at lat ≈ 40.7644 (60th St) crossing Manhattan.
Inflow modes:

- **Auto / Bus** (avenue traffic): one ribbon per direction-pair of
  avenues. Plausible aggregation:
  - West side: Broadway / Columbus / Amsterdam / WSH / 9th–11th avenues
    → single SW-bound ribbon entering CBD around Columbus Circle
  - Mid: 5th / Madison / Park / Lex avenues → single S-bound ribbon
  - East side: 1st / 2nd / 3rd / FDR → single S-bound ribbon
- **Subway**: lines crossing 60th, grouped by trunk:
  - 1/2/3 (West Side)
  - A/C/B/D/E (8th Ave)
  - N/Q/R/W (Broadway)
  - 4/5/6 (Lexington)
  - F/M (6th Ave) — through Roosevelt Island

  Or simpler: one aggregate "Manhattan subway crossing 60th" ribbon.
- **Rail**: terminates at GCT (Park Ave & 42nd). LIRR/Metro-North
  passengers technically arrive *from* the north on tracks but their
  origins are E/N suburbs. NYMTC counts them under § C.

### `queens` (E)
Crossings:

- **Queens Midtown Tunnel** (37th St)
- **Ed Koch Queensboro Bridge** (59th St) — straddles 60th but counted
  as Queens
- **Subway tunnels** (E/F/M/R/N/W/7) — under East River around 53rd /
  60th / 42nd Sts
- **LIRR tunnels** — to Penn / GCT

A reasonable simplification: one ribbon per facility group (autos via
QMT/Queensboro, buses via QMT/Queensboro, subway via tunnels, LIRR via
tunnels). Maybe 4-5 ribbons total from Queens.

### `brooklyn` (S)
Crossings:

- **Brooklyn Bridge** (Park Row)
- **Manhattan Bridge** (Canal St)
- **Williamsburg Bridge** (Delancey)
- **Hugh L. Carey Tunnel** (Battery)
- **Subway tunnels** (Lex / 7th / B'way / 6th / 8th Aves) — under East
  River
- Possibly **LIRR via Atlantic Branch** (terminating Atlantic Ave/B'klyn)

### `staten_island` (S)
- **SI Ferry** to Whitehall — single ribbon to Battery
- (Hugh L. Carey Tunnel handles Brooklyn-bound autos *from* SI but
  those are double-counted with Brooklyn sector — TBD)

### `roosevelt_island`
- **F train** (already counted in subway group)
- **Tramway** to 59th & 2nd Ave — single thin ribbon
- Negligible volume; consider folding into queens or omitting

## Component shape

`NycFlowMap.tsx`, structurally similar to `GeoSankey.tsx` but with:

- A wider default view (BB extends from NJ approach W to LIE/Queens E,
  from ~50th St S in the CBD to ~80th St N for the 60th St inflows
  to be visible).
- A `SECTOR_PATHS: Record<Sector, Record<Mode, LatLon[]>>` lookup.
  Either inline (like the existing `CROSSING_PATHS`) or factored into
  `data/nyc-paths.ts`.
- Per-sector ferry sub-graphs analogous to `FERRY_GRAPH` for the
  Queens/Brooklyn ferry routes (NYC Ferry has a real network — Astoria,
  Soundview, RR, etc.). Could be deferred to v2.

Reuse:

- `geo-sankey` library: `renderFlowGraphSinglePoly`, `ribbonArrow`,
  `offsetPath`, `smoothPath`, the LI compose layer.
- `defaultView()` BB-fitting logic. The BB constants change.

## Editorializing hooks

The whole point of `/nyc` is making clear how dwarfed autos are by transit.
Some annotations the chart should prefer to surface:

- **Total persons entering CBD per peak hour**, with the auto share
  shown as a tiny sliver next to the transit modes.
- **Bus lanes vs. auto lanes**: per-lane-mile passenger throughput
  callouts (Lincoln XBL ~25k/hr/lane vs. typical auto lane ~2k/hr/lane).
  Probably as an editorial section *next to* the map, not on it.
- **Subway dominance from N/E/S**: hovering a sector should expose the
  per-mode breakdown via the LI panel.

## Phasing

1. Stub: `NycFlowMap` rendering NJ-only (reuse `GeoSankey`'s data).
   Verify the sector aggregation works.
2. Add Queens (Queensboro + QMT, all modes via § A/B/C/F + auto). Pick
   2-3 paths for verification.
3. Add Brooklyn (Brooklyn / Manhattan / Williamsburg bridges + Battery
   Tunnel + subway tunnels).
4. Add 60th_street avenues + crosstown subways. This is the
   geographically densest sector, may need careful path simplification.
5. Add Staten Island ferry + Roosevelt Island (small).
6. Polish: legend, color scheme, default view tuning.

## Open questions

- Should this REPLACE `/`'s map (with a direction-toggle that flips
  between NJ-only and all-sectors)? Or be a separate chart on `/nyc`?
  Probably separate — different default zoom, different audiences.
- Subway under-river paths: draw them as straight lines through the
  river (technically inaccurate but readable) or curve through real
  tunnel alignments? Lean toward straight lines + a small annotation
  near the crossing.
- How granular for Manhattan avenue traffic (60th_street sector)? One
  aggregate ribbon vs. left/center/right ribbons. Lean toward 3 (W /
  Mid / E) so the geographic story stays legible.
- Does the `geo-sankey` library handle the increased graph size well?
  Current ferry graph has 10 nodes; an all-NYC version would have
  dozens. May need optimization or batched rendering.
