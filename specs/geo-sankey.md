# Geo-Sankey: Flow Map Visualization

A map-based visualization showing passenger flows in/out of the Manhattan CBD, with directional arrows whose width is proportional to volume.

## Concept

Overlay on a map of Manhattan and surroundings:
- **Arrows/bands** from each crossing point toward the CBD (or outward), width ∝ passenger volume
- Colored by mode (bus, auto, rail, etc.) or stacked by mode within each crossing's arrow
- Direction toggle: entering vs. leaving (arrow direction flips)
- Time period toggle: peak 1hr / peak period / 24hr
- Year selector (single year at a time, or animation)

This is a "geographic Sankey" — the flows have real geographic origin/destination rather than abstract node positions.

## Design options

### Option A: Proportional arrows on map tiles

Leaflet/MapLibre base map with SVG overlay. Each crossing gets an arrow (or stacked set of arrows) from its geographic location toward the CBD centroid. Arrow width = `sqrt(passengers / maxPassengers) * maxWidth`.

**Pros:** Real geography, zoomable, familiar map context
**Cons:** Arrow routing on a map is tricky (overlapping paths, curved vs. straight)

### Option B: Schematic radial diagram

No base map. CBD in center, crossings arranged radially at correct compass bearings. Bands flow inward/outward. More like a classic Sankey but with geographic orientation.

**Pros:** Cleaner, no tile loading, easier to label, no routing issues
**Cons:** Less "map-like", loses neighborhood context

### Option C: Hybrid — map background, simplified geometry

Map tiles dimmed/desaturated as background. Crossing points placed at real coordinates. Straight or slightly curved bands between crossing and a CBD anchor point. No road-following routing.

**Pros:** Geographic context without routing complexity
**Cons:** Bands may cross water/land awkwardly

**Recommendation:** Start with Option C — easiest to implement, most informative.

## Crossing coordinates

### NJ Sector
| Crossing | Lat | Lon | Bearing |
|----------|-----|-----|---------|
| Lincoln Tunnel | 40.7627 | -74.0209 | W |
| Holland Tunnel | 40.7260 | -74.0117 | SW |
| PATH Uptown | 40.7329 | -74.0005 | W |
| PATH Downtown | 40.7136 | -74.0070 | SW |
| Amtrak/NJ Transit | 40.7505 | -73.9935 | W |
| Ferry | 40.7170 | -74.0110 | SW |

### 60th Street Sector
| Crossing | Lat | Lon | Bearing |
|----------|-----|-----|---------|
| FDR Drive | 40.7625 | -73.9530 | N/E |
| West Side Hwy | 40.7725 | -73.9920 | N/W |
| York Ave | 40.7640 | -73.9575 | N |
| 2nd Ave | 40.7645 | -73.9635 | N |
| Lexington Ave | 40.7650 | -73.9680 | N |
| Park Ave | 40.7655 | -73.9715 | N |
| 5th Ave | 40.7660 | -73.9750 | N |
| Broadway | 40.7665 | -73.9815 | N |
| Columbus Ave | 40.7680 | -73.9830 | N |
| West End Ave | 40.7700 | -73.9870 | N |

### Brooklyn Sector
| Crossing | Lat | Lon | Bearing |
|----------|-----|-----|---------|
| Williamsburg Bridge | 40.7133 | -73.9724 | SE |
| Manhattan Bridge | 40.7075 | -73.9908 | S |
| Brooklyn Bridge | 40.7060 | -73.9969 | S |
| Hugh L. Carey Tunnel | 40.6894 | -74.0134 | S |

### Queens Sector
| Crossing | Lat | Lon | Bearing |
|----------|-----|-----|---------|
| Queens Midtown Tunnel | 40.7437 | -73.9615 | E |
| Ed Koch Queensboro Bridge | 40.7568 | -73.9546 | E |

## CBD anchor point

Approximate centroid of the Manhattan CBD (south of 60th St):
- **Lat:** 40.7484, **Lon:** -73.9857 (≈ Times Square / Penn Station area)

Or use sector-specific anchor points (e.g., NJ sector arrows converge on West Midtown, Brooklyn arrows on Lower Manhattan).

## Technical approach

### Libraries
- `react-leaflet` + `leaflet` for map tiles (OpenStreetMap, no API key)
- SVG overlay for flow arrows — full React/CSS control
- Or: `react-map-gl` + MapLibre for smoother interactions

### Arrow rendering
- Each flow: `<path>` element with `stroke-width` ∝ volume
- Curved paths (quadratic Bezier) to avoid overlap
- Color = mode color from existing `colorMap`
- Stacked: multiple parallel paths per crossing, one per mode

### Interactivity
- Hover on arrow → tooltip with crossing name, mode, passenger count
- Click crossing → filter to that crossing's time series
- Year slider or play button for animation

## Data requirements

Needs [`specs/extraction.md`] Phase 1 (all-sector crossing-level data) at minimum. NJ-only data is enough for a proof-of-concept.

## Integration

- New view mode in toggle bar (map icon) or new section below chart
- Shares `direction`, `timePeriod` URL params with `UnifiedChart`
- Adds `year` param (single year selector, default = latest)
- Sector selector (show one sector at a time, or all)

[`specs/extraction.md`]: extraction.md
