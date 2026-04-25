# `/nyc` bubble chart — all-sector passenger volumes

A NYC-wide counterpart to `/`'s `UnifiedChart`. Same general layout
(bubble grid, year on X, share of total on Y), but keyed by **sector**
rather than by NJ crossing.

## Data

All five inflows have multi-year, multi-sector data already extracted:

| Mode    | Source                                  | Coverage                              |
|---------|-----------------------------------------|---------------------------------------|
| Bus     | `appendix_iii.json` § A (`passengers`)  | All sectors, 2014–2024 (2022 missing) |
| Subway  | `appendix_iii.json` § B (`passengers`)  | All sectors, 2014–2024                |
| Rail    | `appendix_iii.json` § C (`passengers`)  | All sectors, 2014–2024                |
| Ferry   | `appendix_iii.json` § F (`passengers`)  | All sectors, 2014–2024                |
| Auto    | `vehicles.json`, `mode = "Auto"`        | All sectors, 2014–2024                |

Sectors:

- `nj` (W) — Hudson crossings
- `60th_street` (N) — N–S avenues + crosstown subways across the 60th St line
- `queens` (E) — East River bridges/tunnels + Queens-bound subway tunnels
- `brooklyn` (S) — Brooklyn-bound bridges + tunnels + subway tunnels
- `staten_island` — ferry only
- `roosevelt_island` — tramway + F train

## Caveats

- **Auto units mismatch.** `vehicles.json` has *vehicle* counts; the
  rest are *passenger* counts. Two options:
  1. Apply a per-sector occupancy multiplier (NYMTC uses ~1.4 for
     CBD-bound autos). Approximate but consistent.
  2. Show only transit modes (drop autos). Cleaner story, but loses
     the bus-vs-auto efficiency comparison.
  Default to option 1; surface the multiplier as a constant the
  reader can adjust if they want.
- **`60th_street` is internal**, not a river crossing. It still
  separates the CBD from the rest of Manhattan, so it's a legitimate
  inflow boundary for the analysis. Worth labeling clearly.
- **2022 § A bus gap.** Bus data missing for 2022 (per
  `extraction.md`). Show as a gap, not zero.

## Component shape

`NycBubbleChart.tsx`, parallel to `UnifiedChart.tsx` but accepting:

- `appendix_iii.json` (only sections A/B/C/F passengers, daily-summed
  from hourly)
- `vehicles.json` (mode === 'Auto')

Internal aggregation:

```ts
type NycRecord = {
  year: number
  sector: Sector
  mode: 'Auto' | 'Bus' | 'Subway' | 'Rail' | 'Ferry'
  direction: 'entering' | 'leaving'
  // Persons (autos: vehicles × OCCUPANCY)
  persons: number
}
```

Toggles (mirroring UnifiedChart where applicable):

- View: bubble | bar | pct | recovery (vs '19)
- Direction: entering | leaving
- Time period: peak_1hr | peak_period | 24hr
- Granularity: **sector** | **mode** (replaces "crossing | mode")
- Palette: existing Semantic / Tyler / Plotly schemes

URL params should mirror UnifiedChart's so users can deep-link views.
Use `useUrlState` with elision-of-defaults.

## Phasing

1. Extract a single `NycRecord[]` precomputed from the existing JSONs.
   Either generate at build time (`scripts/build-nyc-data.ts`) or
   compute lazily in the component.
2. Implement the 4 view modes incrementally; ship `bubble` first since
   it's the most directly comparable to `/`.
3. Add per-sector annotations: COVID dip, ferry growth from 2017, etc.

## Open questions

- Auto occupancy: 1.4 vs 1.5 vs derived per-sector ratio? Worth
  spending a half-hour computing it from NJ where we have both
  `crossings.json` (passengers) and `vehicles.json` (vehicles).
- Should `60th_street` get its own color or share NYC-internal styling
  to distinguish from the river-crossing sectors?
