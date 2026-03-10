# Hub Bound Travel — Web App

Interactive visualizations of NYMTC Hub Bound Travel data (2014–2024).

## Stack

- [Vite] + [React] + [TypeScript]
- [Plotly.js] via [pltly] (legend hover/solo, theme, mobile fixes)
- [use-prms] for URL-synced toggle state
- [use-kbd] for keyboard shortcuts, omnibar, speed dial
- [SASS] for styling

## Development

```bash
pnpm install
pnpm dev       # http://localhost:3847
pnpm build     # Production build → dist/
pnpm tsc -b    # Type check
```

## Structure

```
src/
  components/
    UnifiedChart.tsx     # NJ crossings: scatter/bar/pct/recovery views
    HourlyChart.tsx      # Stacked area by mode/sector
    ModeShareChart.tsx   # Mode share stacked bars
    SectorChart.tsx      # All-sector vehicle bars
    PeakChart.tsx        # 50-year peak accumulation timeline
    LogoLegend.tsx       # Custom icon legend for UnifiedChart
    Toggle.tsx           # Shared toggle button group
  lib/
    types.ts             # CrossingRecord, dimension types
    hourly-types.ts      # HourlyRecord, PeakRecord
    transform.ts         # Data filtering and aggregation
    colors.ts            # Color schemes and palettes
  data/                  # Static JSON (from extract.py)
```

[Vite]: https://vite.dev
[React]: https://react.dev
[TypeScript]: https://www.typescriptlang.org
[Plotly.js]: https://plotly.com/javascript/
[pltly]: https://github.com/runsascoded/pltly
[use-prms]: https://github.com/runsascoded/use-prms
[use-kbd]: https://github.com/runsascoded/use-kbd
[SASS]: https://sass-lang.com
