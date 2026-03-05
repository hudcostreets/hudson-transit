# Hub Bound Travel - Roadmap

Rename from `hudson-transit` to `hub-bound-travel`. Host at `cbd.hccs.dev`.

## Phase 1: `use-prms` integration (URL state) ✅

Done. All chart toggle state persisted in URL params:

| Param | Key | Values |
|-------|-----|--------|
| view | `y` | (default: bubble), `n` (bar), `p` (pct), `c` (recovery) |
| direction | `d` | (default: NJ→NY), `nynj` (NY→NJ) |
| time period | `t` | (default: 1h), `3h`, `1d` |
| granularity | `g` | `c` (crossing, default), `m` (mode) |
| annotations | `A` | (default: on), present = off |

Recovery merged as 4th view mode in `UnifiedChart`. Single chart, single toggle bar.

## Phase 2: `use-kbd` + dark mode ✅

Done. Keyboard shortcuts, SpeedDial (GitHub link + theme toggle), Omnibar (Cmd+K), and dark/light/system theming via CSS custom properties. Theme in URL as `?T=[l|s]`, inline `<script>` in `index.html` prevents flash.

## Phase 3: Unified hover info ✅

Done. All views now show enriched hover with passenger count, mode share %, and recovery % (when post-2019 data exists). Uses Plotly `customdata` + `hovertemplate` (option 3). Trace name and year shown in the `<extra>` tag.

## Phase 4: Full NYMTC extraction (all sectors)

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

## Phase 5: Geographic map view ("Geo Bar Chart")

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
- Shares same direction/time/granularity controls via URL params
- Year selector (slider or dropdown) since map shows one year at a time
- Optional: animation across years

## Phase 6: Crossing/mode icons (in progress)

SVG data-URI icons (bus, car, train, ferry) placed as Plotly `layout.images` in scatter view, positioned after each trace's last-year bubble. Icons defined in `crossing-icons.ts`.

TODO:
- Tune icon positioning and sizing (needs visual verification)
- Add icons to bar, pct, and recovery views
- Consider upgrading to higher-quality or branded icons (PATH logo, NJT logo, etc.)

## Phase 7: Project rename and deploy

- Rename repo `hudson-transit` → `hub-bound-travel`
- Update `package.json` name, vite config, etc.
- Set up `cbd.hccs.dev` hosting
- Update all internal references

## Dependency order

```
Phase 1 (use-prms) ✅
Phase 2 (use-kbd + dark mode) ✅
Phase 3 (hover widget) ✅
Phase 4 (extraction) ──→ Phase 5 (map, needs all sectors)
Phase 6 (icons) ── in progress (scatter done, other views TODO)
Phase 7 (rename) ── can happen anytime
```
