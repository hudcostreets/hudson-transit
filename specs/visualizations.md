# Additional Visualizations

New chart types and views beyond the current `UnifiedChart` scatter/bar/pct/recovery views.

## 1. Hourly heatmap

**Data source:** Tables 21-27 (hourly data, requires [`specs/extraction.md`] Phase 2)

A 24-hour × year heatmap showing total passenger volume (or per-mode/sector) by hour of day. Color intensity = volume.

**Dimensions:**
- Rows: hours (12am–11pm)
- Columns: years (2014–2024)
- Color: passenger volume (sequential colorscale)
- Toggles: direction, sector, mode filter

**Use case:** Visualize how peak-hour concentration has changed (e.g., post-COVID flattening of peaks).

## 2. Mode share area chart

Stacked area chart showing mode share over time (2014–2024). Each mode's band height = its share of total volume.

**Dimensions:**
- X: year
- Y: % of total (stacked to 100%)
- Colors: mode colors
- Toggles: direction, time period, sector

**Use case:** See long-term mode shift trends (e.g., PATH growth, auto decline).

Already partially available via the `%` stacked bar view, but an area chart makes trends smoother and continuous.

## 3. Sector comparison (small multiples)

Side-by-side scatter or bar charts for each sector, sharing axes. Requires all-sector extraction.

**Layout:** 2×2 grid (60th St, Brooklyn, Queens, NJ), each a mini version of the current chart. Shared y-axis scale for comparison.

**Use case:** Compare recovery rates, mode mix, and volume across sectors at a glance.

## 4. Recovery waterfall

A waterfall chart showing the contribution of each crossing/mode to the overall recovery from 2019 to latest year.

**Structure:**
- Start bar: 2019 total
- Intermediate bars: change per crossing/mode (positive = recovered, negative = still down)
- End bar: latest year total

**Use case:** Show which crossings/modes are driving or lagging recovery.

## 5. Year-over-year change (diverging bar)

Horizontal diverging bar chart: each crossing/mode as a row, bar extends left (decline) or right (growth) from center.

**Dimensions:**
- Rows: crossings or modes
- Bar length: % change from selected baseline year
- Color: red (decline) / green (growth)
- Toggles: baseline year, comparison year, direction, time period

## Priority

1. **Mode share area chart** — easy to build, high value, data already available
2. **Hourly heatmap** — compelling but needs hourly extraction
3. **Sector comparison** — needs all-sector extraction
4. **Recovery waterfall** — niche but insightful
5. **Year-over-year diverging bar** — useful for presentations

## Technical notes

All can be built with Plotly.js (already a dependency). The area chart is `type: 'scatter'` with `stackgroup`. Heatmap is `type: 'heatmap'`. Waterfall is `type: 'waterfall'`. Small multiples use Plotly subplots or separate `<Plot>` instances in a CSS grid.

[`specs/extraction.md`]: extraction.md
