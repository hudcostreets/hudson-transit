# Hub Bound Travel - Roadmap

Rename from `hudson-transit` to `hub-bound-travel`. Host at `cbd.hccs.dev`.

## Phase 1: `use-prms` integration (URL state)

Replace `useSS` (sessionStorage) with `use-prms` for all plot toggle state. This makes views deep-linkable and shareable.

### Param encoding

Short single-char keys, `codeParam` for enums:

| Param | Key | Values |
|-------|-----|--------|
| view | `v` | `s` (scatter), `b` (bar), `p` (pct), `r` (recovery) |
| direction | `d` | `e` (entering), `l` (leaving) |
| time period | `t` | `1` (peak_1hr), `3` (peak_period), `d` (24hr) |
| granularity | `g` | `c` (crossing), `m` (mode) |
| annotations | `a` | bool (present = on) |

### Single unified chart

Recovery is a 4th view mode alongside scatter/bar/pct — not a separate chart. All 4 views share the same direction, time period, and granularity controls. One chart, one toggle bar.

This means:
- `RecoveryLine` becomes `renderRecovery()` inside `UnifiedChart`
- The "Recovery" nav section and `<h2>` go away
- View toggle: `[bubbles] [#] [%] [recovery]`
- Annotations toggle only shown for scatter view

### Implementation

- `pnpm add use-prms` (or `pds local use-prms` for dev)
- Replace `useSS` calls with `useUrlState` / `codeParam`
- Merge `RecoveryLine` logic into `UnifiedChart` as `renderRecovery()`
- Delete `RecoveryLine.tsx`
- Single toggle bar, single set of URL params
- Remove `sessionStorage` persistence entirely

## Phase 2: `use-kbd` integration (keyboard shortcuts)

Register actions for all toggleable controls. Enables command-palette discovery and power-user keyboard navigation.

### Actions

| Action ID | Label | Default binding | Handler |
|-----------|-------|----------------|---------|
| `view:scatter` | Scatter view | `1` | setView('scatter') |
| `view:bar` | Bar view | `2` | setView('bar') |
| `view:pct` | Percent view | `3` | setView('pct') |
| `view:recovery` | Recovery view | `4` | setView('recovery') |
| `dir:toggle` | Toggle direction | `d` | toggle entering/leaving |
| `time:cycle` | Cycle time period | `t` | cycle 1hr → 3hr → day |
| `gran:toggle` | Toggle granularity | `g` | toggle crossing/mode |
| `ann:toggle` | Toggle annotations | `a` | toggle annotations |
| `nav:chart` | Go to Chart | `g c` | scroll to #chart |
| `nav:map` | Go to Map | `g m` | scroll to #map (Phase 4) |

### Implementation

- `pnpm add use-kbd`
- Wrap app in `<HotkeysProvider>`
- Add `<Omnibar />` + `<ShortcutsModal />` (Cmd+K / ?)
- Register actions in the shared `<Controls>` component
- Import `use-kbd/styles.css`

## Phase 3: Full NYMTC extraction (all sectors)

Expand `extract.py` to extract all 4 entry sectors, not just NJ. This is the "canonical normalized multi-year distillation" of NYMTC Hub Bound Travel reports.

### Sectors

| Sector | Key crossings | Modes |
|--------|--------------|-------|
| 60th Street | Subway lines, bridges | Subway, Auto, Bus, Rail, Ferry, Bicycle |
| Brooklyn | Subway, bridges, battery tunnel | Subway, Auto, Bus, Rail, Ferry, Bicycle |
| Queens | Subway, bridges, tunnel, LIRR | Subway, Auto, Bus, Rail, Tramway, Bicycle |
| New Jersey | Lincoln, Holland, PATH, rail, ferry | Auto, Bus, PATH, Rail, Ferry |
| Staten Island | Ferry | Ferry |

### Data quality: isna-mask verification

**Hard requirement**: For every newly extracted table, compare isna masks across the 3 time-period variants (A/B/C) to detect shifted/garbled data, as was found in Table14B-1. Specifically:

- For each `(year, sector)`: load raw versions of all 3 time-period sheets
- Verify isna masks match column-by-column (excluding fully-NaN columns)
- If mismatches detected, characterize the shift pattern and apply correction
- Verify corrected values via ratio bounds (3hr/1hr in [1.5, 4.0], 24hr/1hr in [2.0, 30.0])
- Log warnings for any anomalies that can't be auto-corrected

### Output schema

```json
{
  "year": 2024,
  "sector": "nj",
  "crossing": "Lincoln Tunnel",
  "mode": "Bus",
  "direction": "entering",
  "time_period": "peak_1hr",
  "passengers": 28883
}
```

Same schema as today, but `sector` now includes `60th_street`, `brooklyn`, `queens`, `staten_island`.

### Extraction plan

1. Survey all AppendixII sheet names across all 11 years, build table→sector mapping
2. Generalize `load_nj_sector` → `load_sector(sector, ...)` with sector-specific row/column parsing
3. Handle pre-2017 vs 2017+ sheet naming differences
4. Handle mode naming normalization (e.g. "SUBWAY and PATH" → separate entries)
5. Run isna-mask verification across all sector × time-period pairs
6. Output single `crossings.json` with all sectors

## Phase 4: Geographic map view ("Geo Bar Chart")

A map visualization with proportional bars/rectangles overlaid at each CBD entry point, sized by passenger volume.

### Concept

Not a traditional Sankey — more like a **proportional symbol map** where each crossing gets stacked or grouped bars (one per mode), with width/area proportional to volume. Toggles for direction, time period, year work the same as the scatter/bar views.

### Approach: Reusable `<GeoBarMap>` component

Build as a standalone, reusable React component (potentially its own npm package) since multiple apps could use it.

**Props:**
```tsx
interface GeoBarMapProps<T> {
  data: T[]
  locations: Record<string, { lat: number, lon: number, label?: string }>
  locationKey: keyof T        // field mapping to location ID
  valueKey: keyof T           // field mapping to numeric value
  groupKey?: keyof T          // field mapping to color group (e.g., mode)
  colorMap?: Record<string, string>
  layout?: 'stacked' | 'grouped'
  maxBarWidth?: number        // in pixels at default zoom
}
```

### Library choice

**React Leaflet + SVG overlay** for simplicity:
- `react-leaflet` + `leaflet` for the base map
- SVG overlay for bars — full CSS/React control, easy interactivity
- Lightweight, no API key needed (OpenStreetMap tiles)

Alternative: `react-map-gl` (Mapbox/MapLibre) if we want smoother zoom/pan or 3D later.

### Crossing coordinates (approximate, NJ sector)

| Crossing | Lat | Lon |
|----------|-----|-----|
| Lincoln Tunnel | 40.7580 | -73.9855 |
| Holland Tunnel | 40.7216 | -73.9857 |
| PATH Downtown | 40.7142 | -74.0067 |
| PATH Uptown | 40.7325 | -74.0088 |
| Amtrak/NJ Transit | 40.7508 | -73.9963 |
| Ferry (aggregate) | 40.7128 | -74.0060 |

Need to add coordinates for 60th St, Brooklyn, Queens sector crossings once those are extracted.

### Integration

- New section: "Map" (below the main chart)
- Shares same direction/time/granularity controls
- Year selector (slider or dropdown) since map shows one year at a time
- Optional: animation across years

## Phase 5: Crossing/mode icons

Add recognizable icons for each crossing and mode, rendered inline in charts:

- **Scatter (bubble)**: Draw icon to the right of the last-year circle for each trace
- **Bar (#)**: Icon above each bar group
- **Stacked bar (%)**: Icon inside each segment (where space allows)
- **Recovery**: Icon at end of each line

### Icon sources

| Crossing/Mode | Icon idea |
|---------------|-----------|
| Lincoln (Bus) | Bus silhouette |
| Lincoln (Autos) | Car silhouette |
| Holland (Bus) | Bus silhouette (smaller/different color) |
| Holland (Autos) | Car silhouette |
| PATH (Downtown/Uptown) | PATH logo or train icon |
| Amtrak / NJ Transit | Rail/train icon |
| Ferry | Ferry/boat icon |

Options: SVG icons (hand-drawn or from icon libraries like Lucide, Heroicons, or MTA/NJT brand assets), or small raster logos. Prefer SVG for scalability.

Can be implemented as Plotly layout images or as an SVG overlay layer.

## Phase 6: Project rename and deploy

- Rename repo `hudson-transit` → `hub-bound-travel`
- Update `package.json` name, vite config, etc.
- Set up `cbd.hccs.dev` hosting
- Update all internal references

## Dependency order

```
Phase 3 (extraction) ──→ Phase 4 (map, needs all sectors)
Phase 1 (use-prms)   ──→ Phase 2 (use-kbd, actions need state setters)
Phase 5 (rename)     ── can happen anytime
```

Phases 1-2 and Phase 3 are independent and can proceed in parallel.
