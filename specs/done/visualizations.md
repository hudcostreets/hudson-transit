# Additional Visualizations

New chart types and views beyond the current `UnifiedChart` scatter/bar/pct/recovery views.

## Implemented

### Hourly profile (stacked area) ✅

Built as `HourlyChart.tsx` — stacked area chart showing CBD entries/exits by hour of day, with toggles for mode vs sector breakdown, entering/leaving direction, and year selection ('14, '19, '20, '24).

Originally specced as a heatmap (hour × year), but stacked area per single year turned out to be more readable and interactive.

### Mode share (stacked bar) ✅

Built as `ModeShareChart.tsx` — stacked bar chart showing daily persons by mode across all years (2014–2024). Toggles for absolute vs percentage view and entering/leaving direction.

### Peak accumulation timeline ✅

Built as `PeakChart.tsx` — 50-year line chart (1975–2024) showing peak accumulation (max persons present in Manhattan Hub on a fall business day). Three lines: total persons, transit riders, motor vehicles. Annotated with 1984 peak, COVID dip, and 2024 recovery percentage.

### Sector vehicles (stacked/grouped bar) ✅

Built as `SectorChart.tsx` — motor vehicles entering the CBD by sector (60th St, Brooklyn, Queens, NJ). Toggles for stacked vs grouped view, direction, and time period.

## Not implemented

### Sector comparison (small multiples)

2×2 grid of mini-charts per sector. Superseded by the per-sector toggle in HourlyChart and SectorChart.

### Recovery waterfall

Waterfall showing per-crossing/mode contribution to post-2019 recovery. Still potentially interesting but lower priority; the recovery index view in UnifiedChart covers similar ground.

### Year-over-year diverging bar

Horizontal diverging bars for % change from baseline. Useful for presentations but not yet built.

## Technical notes

All built with Plotly.js via `pltly/react`'s `Plot` component, which provides legend hover highlight and click-to-solo out of the box.

[`specs/extraction.md`]: ../extraction.md
