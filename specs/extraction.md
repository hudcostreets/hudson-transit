# Full NYMTC Extraction (All Sectors)

Expand `extract.py` to extract all CBD entry sectors, not just NJ. The goal is a canonical normalized multi-year distillation of the NYMTC Hub Bound Travel reports (2014–2024).

## Current state

`extract.py` produces two files:
- **`crossings.json`** (528 records): NJ sector only, Tables 14A-C / 15A-C, 6 crossings × 5 modes (ish) × 2 directions × 3 time periods × 11 years
- **`modes.json`** (165 records): NJ sector day volumes from Quick Reference Table

## Available data in AppendixII

### Tables 14–15 (NJ sector, currently extracted)

Per-crossing mode breakdown. Already handled, including Table14B shift-correction.

### Tables 16–17 (all sectors: motor vehicles entering/leaving)

All 4 sectors, per-crossing, 3 time periods (1hr/3hr/24hr) in one sheet. Columns: Autos+Taxis+Vans+Trucks, Bus, Total. Rows grouped by sector header ("60TH STREET SECTOR", "BROOKLYN SECTOR", etc.).

**Crossings per sector:**
| Sector | Crossings |
|--------|-----------|
| 60th St | FDR Drive, York Ave, 2nd Ave, Lexington Ave, Park Ave, 5th Ave, Broadway, Columbus Ave, West End Ave, West Side Hwy |
| Brooklyn | Williamsburg Bridge, Manhattan Bridge, Brooklyn Bridge, Hugh L. Carey Tunnel |
| Queens | Queens Midtown Tunnel, Ed Koch Queensboro Bridge |
| NJ | Holland Tunnel, Lincoln Tunnel |

### Tables 18–19 (all sectors: bus passengers entering/leaving)

Similar structure: Local Bus, Express Bus, Total per crossing. More granular bus breakdown than Tables 14-15.

### Tables 20 (service levels)

Comfort/frequency metrics, not volume data. **Skip for now.**

### Tables 21A/B (total persons by hour, 3 years)

Hourly inbound/outbound totals. 24 hours × inbound/outbound × 3 years per sheet. Rich time-of-day data.

### Tables 22A/B (transit passengers by hour)

Same as 21 but transit-only.

### Tables 23A/B (motor vehicles by hour)

Same as 21 but vehicles-only.

### Tables 24–25 (persons by hour and mode, single year)

24 hours × modes (Auto, Subway, Bus, Rail, Ferry, etc.). One year per sheet.

### Tables 26–27 (persons by hour and sector, single year)

24 hours × 4 sectors. One year per sheet.

## Extraction plan

### Phase 1: Tables 16–17 (all-sector motor vehicle + bus counts) ✅

Done. `load_all_sector_vehicles()` in `extract.py` parses Tables 16 (entering) and 17 (leaving) for all 4 sectors, outputting to `vehicles.json` (2,158 records). Per-crossing Auto and Bus vehicle counts across 3 time periods × 2 directions × 11 years.

Note: these are **vehicle counts**, not passenger counts. Table14A gives passengers; Table16 gives vehicles.

26 unique crossings across sectors:
- 60th St: 18 crossings (FDR Drive, avenues, West Side Hwy, etc.)
- Brooklyn: 4 (Williamsburg, Manhattan, Brooklyn bridges + Hugh L. Carey Tunnel)
- Queens: 2 (Queens Midtown Tunnel, Ed Koch Queensboro Bridge)
- NJ: 2 (Holland Tunnel, Lincoln Tunnel)

### Phase 1b: Tables 18–19 (all-sector bus passengers) ✅

Done. Same parser (`load_all_sector_table`) with `mode_a='Local Bus'`, `mode_b='Express Bus'`. 1,191 records in `data/bus_passengers.json`. These are **passenger counts** (not vehicles).

### Phase 2: Tables 21–27 (hourly data) ✅

Done. 8,736 records in `data/hourly.json`. Five categories:

| Category | Source | Records | Years |
|----------|--------|---------|-------|
| `total_persons` | Table 21A | 624 | 2012–2024 |
| `transit_passengers` | Table 22A | 624 | 2012–2024 |
| `motor_vehicles` | Table 23A | 624 | 2017–2024 |
| `mode` | Tables 24–25 | 3,696 | 2014–2024 |
| `sector` | Tables 26–27 | 3,168 | 2014–2024 |

Schema:
```json
{
  "year": 2024,
  "hour": 8,
  "direction": "entering",
  "category": "mode",
  "key": "Subway",
  "persons": 280381
}
```

Notes:
- Tables 21A–23A provide 3-year rolling windows; deduplication prefers earliest publication year.
- Table 23A pre-2017 sheets (`Table23A-23B`) not available in 2014–2016 files.
- Tables 26–27 have split-row headers in 2017+; matched via keyword search.
- 7 modes: Auto, Subway, Bus, Rail, Ferry, Tramway, Bicycle.
- 6 sectors: 60th_street, brooklyn, queens, nj, staten_island, roosevelt_island.

### Phase 2b: Tables 21B–23B (peak accumulation history) ✅

Done. 148 records in `data/peak_accumulation.json`. Historical peak accumulation (max persons/vehicles in Manhattan Hub at any point during a fall business day).

- `total_persons`: 49 records, 1975–2024
- `transit_passengers`: 49 records, 1975–2024
- `motor_vehicles`: 50 records, 1973–2024

Pre-2017 files have deeper history (back to 1973/1975); 2017+ only go to 1994. Deduplication prefers earliest publication for maximum history.

Schema:
```json
{
  "year": 2024,
  "category": "total_persons",
  "peak_accumulation": 988343,
  "peak_hour": 14
}
```

### Phase 3: AppendixIII summary data (Sections A, B, C, F) ✅

Done. 17,606 records in `data/appendix_iii.json`. Sector-level hourly data from AppendixIII summary sheets.

| Section | Description | Measures | Records |
|---------|-------------|----------|---------|
| A | Bus transit | buses, passengers | 3,840 |
| B | Subway/PATH | trains, cars, passengers | 6,336 |
| C | Suburban/intercity rail | trains, cars, passengers | 4,752 |
| F | Ferry/tramway | passengers | 2,678 |

Schema:
```json
{
  "year": 2024,
  "hour": 8,
  "direction": "entering",
  "section": "B",
  "sector": "brooklyn",
  "measure": "passengers",
  "value": 108823
}
```

Notes:
- Section A 2022 file missing (all other years 2014–2024 complete).
- Section C outbound sheet name varies (`Rec-Suburban_Rail-Outbound` with hyphen, not underscore).
- Section F grows over time: 2014 has 3 ferry sectors, 2017+ adds 60th St/Queens, 2022+ adds separate tramway.
- Pre-2017 files combine inbound/outbound on single sheets; parsed by splitting on "OUTBOUND" marker.
- Cross-validated: III-B subway passengers at 8am 2024 sum to 280,381, matching Table 24 exactly.

### Phase 3b: AppendixIII route-level detail ✅

Done. 74,069 records in `data/appendix_iii_detail.json`. Per-facility/line hourly data.

| Section | Description | Records | Facilities |
|---------|-------------|---------|------------|
| B | Subway lines | 34,416 | 36 lines (Lex Express, 8th Ave, Broadway, PATH, etc.) |
| C | Rail lines | 13,482 | 7 lines (Metro-North Hudson/Harlem/New Haven, LIRR, NJ Transit, Amtrak) |
| D | Auto occupants | 8,543 | 10 roads (FDR, avenues) + 8 crossings (bridges, tunnels) |
| E | Vehicle counts | 7,608 | Same roads/crossings as D |
| G | Bicycle volumes | 10,020 | 15 avenues + 4 bridge/ferry crossings |

Schema:
```json
{
  "year": 2024,
  "hour": 8,
  "direction": "entering",
  "section": "B",
  "sector": "60th_street",
  "facility": "Lexington Ave Express",
  "measure": "passengers",
  "value": 24539
}
```

Notes:
- Pre-2017 combined sheets use both stacked and side-by-side layouts for inbound/outbound.
- Facility names vary across years (e.g. "VIA 4, 5 LINES (Express)" vs "4, 5 Lines"); future normalization pass needed.
- Section A detail (bus routes by corridor/operator) extracted: 28,512 records, 51 facilities.
- Cross-validated: subway passengers sum matches Table 24 and III summary (280,381 at 8am 2024).

## Data quality

### isna-mask verification (existing, extend)

For every newly extracted table:
- Load raw data for all time-period variants
- Compare isna masks column-by-column to detect garbled/shifted data
- Apply corrections as needed (see Table14B precedent)
- Verify via ratio bounds: 3hr/1hr ∈ [1.5, 4.0], 24hr/1hr ∈ [2.0, 30.0]

### Cross-table consistency

- Tables 16/17 motor vehicle totals should match Tables 14-15 auto+bus columns for NJ sector
- Quick Reference Table totals should match Table 14C/15C 24hr entering/leaving
- Flag discrepancies but don't block extraction

## Output schema

Same as current `crossings.json`, extended:
```json
{
  "year": 2024,
  "sector": "60th_street",
  "crossing": "FDR Drive",
  "mode": "Auto",
  "direction": "entering",
  "time_period": "peak_1hr",
  "passengers": 4891
}
```

Sector values: `60th_street`, `brooklyn`, `queens`, `nj`, `staten_island`.

## Record counts

| File | Records |
|------|---------|
| `crossings.json` | 528 |
| `modes.json` | 165 |
| `vehicles.json` | 2,158 |
| `bus_passengers.json` | 1,191 |
| `hourly.json` | 8,736 |
| `peak_accumulation.json` | 148 |
| `appendix_iii.json` | 17,606 |
| `appendix_iii_detail.json` | 102,581 |
| **Total** | **133,113** |

All files served as static JSON imports in the web app.
