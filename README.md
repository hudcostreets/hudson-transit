# Hub Bound Travel Data

Analysis and visualization of [NYMTC's "Hub Bound Travel" reports][NYMTC HBT] — vehicle and passenger volumes into Manhattan's Central Business District (below 60th St), 2014–2024.

**Live site: [cbd.hudcostreets.org](https://cbd.hudcostreets.org)**

Reports are also mirrored in [Hudson County Complete Streets]' [Google Drive][gdrive].

## Charts

| NJ→NY (entering) | NY→NJ (leaving) |
|:-:|:-:|
| [![NJ→NY][nj-ny-gif]][nj-ny-live] | [![NY→NJ][ny-nj-gif]][ny-nj-live] |

Each GIF cycles through peak 1hr, peak period (3hr), and 24hr views. Click to open the interactive chart.

## Flow Map

| NJ→NY (entering) | NY→NJ (leaving) |
|:-:|:-:|
| [![NJ→NY map][map-nj-ny]][map-nj-ny-live] | [![NY→NJ map][map-ny-nj]][map-ny-nj-live] |

Geographic Sankey of CBD crossings and ferry routes. Ribbon widths are proportional to passenger counts; flows merge/split at the ferry interchanges. Hovering or pinning a flow brings it to the top of the z-stack persistently.

| | NJ→NY | NY→NJ |
|---|:-:|:-:|
| Peak 1hr | [![][nj-ny-1h]][nj-ny-1h-live] | [![][ny-nj-1h]][ny-nj-1h-live] |
| Peak period | [![][nj-ny-3h]][nj-ny-3h-live] | [![][ny-nj-3h]][ny-nj-3h-live] |
| 24hr | [![][nj-ny-1d]][nj-ny-1d-live] | [![][ny-nj-1d]][ny-nj-1d-live] |

## Data

8 normalized JSON files extracted from NYMTC AppendixII and AppendixIII Excel workbooks, totaling ~133k records. All extractions are idempotent, DVX-tracked, and cached to S3.

| File | Records | Source | Description |
|------|---------|--------|-------------|
| `crossings.json` | 528 | Tables 14A-C, 15A-C | NJ sector per-crossing volumes by mode, direction, time period |
| `modes.json` | 165 | Quick Reference Table | NJ sector day volumes by mode |
| `vehicles.json` | 2,158 | Tables 16-17 | All 4 sectors, per-crossing motor vehicle + bus counts |
| `bus_passengers.json` | 1,191 | Tables 18-19 | All 4 sectors, local/express bus passenger counts |
| `hourly.json` | 8,736 | Tables 21A-27 | Hourly profiles by mode, sector, and aggregate category |
| `peak_accumulation.json` | 148 | Tables 21B-23B | Peak persons in Manhattan Hub, 1973–2024 |
| `appendix_iii.json` | 17,606 | AppendixIII A-F | Sector-level hourly data (bus, subway, rail, ferry) |
| `appendix_iii_detail.json` | 102,581 | AppendixIII B-G | Per-facility/line hourly data (subway lines, rail, roads, bikes) |

See [`specs/extraction.md`] for full schema documentation and extraction notes.

## Visualizations

The [web app][live] has 6 interactive views — the Plotly charts use [Plotly.js] / [pltly]; the flow map uses [MapLibre GL] + [geo-sankey]:

| Chart | Description | Controls |
|-------|-------------|----------|
| **Unified Chart** | NJ→NY crossings: bubble scatter, grouped bars, stacked %, recovery index | View, direction, time period, granularity, palette |
| **Flow Map** | Geographic Sankey ribbons over a basemap of NJ↔Manhattan, width-proportional to passengers per crossing/mode (incl. multi-source ferry network) | Direction, time period, year, inline-legend, geo-scale, width-scale, hover-padding |
| **Hourly Profile** | Stacked area of CBD entries/exits by hour | Mode vs sector, direction, year |
| **Mode Share** | Stacked bar of daily persons by mode across years | Absolute vs %, direction |
| **Sector Vehicles** | Motor vehicles by sector (stacked or grouped bars) | View, direction, time period |
| **Peak Accumulation** | 50-year timeline of max persons in Manhattan Hub | (annotated, no toggles) |

Plotly charts support legend hover highlight and click-to-solo via [pltly]; the flow map highlights on hover and pins on click, with the most recently engaged flow drawn on top.

## Extraction

```bash
pip install -e .
./extract.py extract    # Extract all tables → data/*.json
dvx push                # Push to S3 cache
```

Requires the source Excel files in `data/source/` (see `.dvc` files for provenance).

## Web app

```bash
cd www
pnpm install
pnpm dev                # Dev server on port 3847
```

## License

Data sourced from publicly available [NYMTC Hub Bound Travel reports][NYMTC HBT].

[NYMTC HBT]: https://www.nymtc.org/en-us/Data-and-Modeling/Transportation-Data-and-Statistics/Publications/Hub-Bound-Travel
[Hudson County Complete Streets]: https://hudcostreets.org
[gdrive]: https://drive.google.com/drive/folders/16YYlcHoCA3scyvCNXfBKEf0P_41IRpJS
[live]: https://cbd.hudcostreets.org
[Plotly.js]: https://plotly.com/javascript/
[pltly]: https://github.com/runsascoded/pltly
[MapLibre GL]: https://maplibre.org/
[geo-sankey]: https://github.com/runsascoded/geo-sankey
[`specs/extraction.md`]: specs/done/extraction.md
[nj-ny-gif]: www/public/screenshots/nj-ny.gif
[ny-nj-gif]: www/public/screenshots/ny-nj.gif
[nj-ny-live]: https://cbd.hudcostreets.org
[ny-nj-live]: https://cbd.hudcostreets.org?d=nynj
[nj-ny-1h]: www/public/screenshots/bubble-nj-ny-1h.png
[nj-ny-3h]: www/public/screenshots/bubble-nj-ny-3h.png
[nj-ny-1d]: www/public/screenshots/bubble-nj-ny-1d.png
[ny-nj-1h]: www/public/screenshots/bubble-ny-nj-1h.png
[ny-nj-3h]: www/public/screenshots/bubble-ny-nj-3h.png
[ny-nj-1d]: www/public/screenshots/bubble-ny-nj-1d.png
[nj-ny-1h-live]: https://cbd.hudcostreets.org
[nj-ny-3h-live]: https://cbd.hudcostreets.org?t=3h
[nj-ny-1d-live]: https://cbd.hudcostreets.org?t=1d
[ny-nj-1h-live]: https://cbd.hudcostreets.org?d=nynj
[ny-nj-3h-live]: https://cbd.hudcostreets.org?d=nynj&t=3h
[ny-nj-1d-live]: https://cbd.hudcostreets.org?d=nynj&t=1d
[map-nj-ny]: www/public/screenshots/map-nj-ny.png
[map-ny-nj]: www/public/screenshots/map-ny-nj.png
[map-nj-ny-live]: https://cbd.hudcostreets.org/#map
[map-ny-nj-live]: https://cbd.hudcostreets.org/?d=nynj#map
