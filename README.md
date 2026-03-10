# Hub Bound Travel Data

Analysis and visualization of [NYMTC's "Hub Bound Travel" reports][NYMTC HBT] — vehicle and passenger volumes into Manhattan's Central Business District (below 60th St), 2014–2024.

**Live site: [cbd.hudcostreets.org](https://cbd.hudcostreets.org)**

Reports are also mirrored in [Hudson County Complete Streets]' [Google Drive][gdrive].

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

The [web app][live] has 5 interactive charts built with [Plotly.js] and [pltly]:

| Chart | Description | Controls |
|-------|-------------|----------|
| **Unified Chart** | NJ→NY crossings: bubble scatter, grouped bars, stacked %, recovery index | View, direction, time period, granularity, palette |
| **Hourly Profile** | Stacked area of CBD entries/exits by hour | Mode vs sector, direction, year |
| **Mode Share** | Stacked bar of daily persons by mode across years | Absolute vs %, direction |
| **Sector Vehicles** | Motor vehicles by sector (stacked or grouped bars) | View, direction, time period |
| **Peak Accumulation** | 50-year timeline of max persons in Manhattan Hub | (annotated, no toggles) |

All charts support legend hover highlight and click-to-solo via [pltly].

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
[`specs/extraction.md`]: specs/extraction.md
