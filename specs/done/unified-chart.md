# Unified Multi-Dimensional Chart

Single `UnifiedChart` component replacing 3 separate chart components (`PeakScatter`, `PeakBar`, `PeakPctBar`).

## Toggle dimensions

| Dimension | Options | Default |
|-----------|---------|---------|
| **View** | bubble scatter · grouped bars · stacked % · recovery | bubble |
| **Direction** | NJ→NY · NY→NJ | NJ→NY |
| **Time** | Peak hour · Peak period · 24hr | Peak hour |
| **Granularity** | By crossing · By mode | By crossing |

Subtitle updates dynamically (e.g. "NJ→NY, 8-9am, Fall business day").

## Key features

- Per-view jitter configs in `scatter-config.ts` (hand-tuned x-offsets per year/trace)
- Per-view `maxSize` config (bubble sizing varies by time period)
- Canonical annotations with dotted-line connectors (bus lane / car lane callouts)
- `repelLabels` with line/rect obstacles from canonical annotations
- Trace highlight on legend hover/click via `useTraceHighlight` from pltly
- Branded SVG logos in legend (PATH, NJT, etc.)
- Responsive: narrow/wide breakpoints, mobile-friendly annotation sizing

## Data flow

Excel → `extract.py` → `crossings.json` (528 records) → `filterCrossings()` → `crossingSeriesArrays()` / `aggregateByMode()` → view renderer

## Files

| File | Role |
|------|------|
| `UnifiedChart.tsx` | Main component, toggle state, view dispatch |
| `scatter-config.ts` | Jitter maps, maxSize maps, canonical annotations |
| `JitteredPlot.tsx` | Plotly wrapper applying x-jitter offsets |
| `LogoLegend.tsx` | Branded icon legend (bottom grid + right-side) |
