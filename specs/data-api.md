# Data API and Explorer

Expose the cleaned Hub Bound Travel dataset in user-friendly, machine-readable formats.

## Goals

1. Make the extracted data downloadable and queryable without cloning the repo
2. Provide a paginated table UI for browsing the data in-browser
3. Serve Parquet for efficient downstream analysis (notebooks, DuckDB, etc.)

## Approach: Static files + client-side Parquet

No backend server needed. All data served as static assets from the Vite build, with client-side Parquet reading via [hyparquet].

[hyparquet]: https://github.com/hyparam/hyparquet

### Data files served

```
/data/crossings.parquet    # All crossing-level records
/data/modes.parquet        # Sector-level mode totals
/data/hourly.parquet       # Hourly data (when extracted)
/data/crossings.json       # JSON mirror (for simpler consumers)
/data/modes.json
```

### Build pipeline

Add to `extract.py`:
```python
@cli.command()
def parquet():
    """Convert JSON data to Parquet format."""
    # Read JSON, write Parquet with pyarrow
```

Or use a Makefile target:
```makefile
data/crossings.parquet: data/crossings.json
    python -c "import pandas as pd; pd.read_json('$<').to_parquet('$@')"
```

Copy Parquet files to `www/public/data/` so Vite serves them as static assets.

## In-browser data table

### hyparquet integration

[hyparquet] reads Parquet files directly in the browser (no server needed). Use it to:
- Fetch `/data/crossings.parquet` as an ArrayBuffer
- Read schema and row groups
- Paginate through rows client-side

### Table component

New route/section: `/data` or a "Data" tab.

```tsx
<DataExplorer
  files={[
    { name: 'Crossings', path: '/data/crossings.parquet' },
    { name: 'Modes', path: '/data/modes.parquet' },
  ]}
/>
```

Features:
- **Column headers** with sort (client-side, per-page or full)
- **Filters**: dropdowns for sector, direction, time_period, mode; range for year
- **Pagination**: 50-100 rows per page
- **Download**: buttons for Parquet, JSON, CSV export
- **Schema display**: column names, types, record count

### UI considerations

- Use a simple `<table>` with sticky headers (no heavy table library needed for ~15k rows)
- Filter controls above table, matching the toggle bar style
- Dark mode support (inherits from existing theme)
- Mobile: horizontal scroll for wide tables

## Download links

Simple download section (can be a card below the table or standalone):

```
📊 Download Hub Bound Travel Data
├── Crossings (Parquet) — 528 records, 12 KB
├── Crossings (JSON) — 528 records, 99 KB
├── Crossings (CSV) — 528 records, 28 KB
├── Modes (Parquet) — 165 records, 4 KB
└── Modes (JSON) — 165 records, 24 KB
```

CSV can be generated client-side from the Parquet/JSON data (no need to pre-generate).

## API-like access

Since everything is static files on GitHub Pages, "API" access is just direct URLs:

```
https://cbd.hccs.dev/data/crossings.parquet
https://cbd.hccs.dev/data/crossings.json
```

Document these in a `/data` page with usage examples:

```python
# Python
import pandas as pd
df = pd.read_parquet("https://cbd.hccs.dev/data/crossings.parquet")

# DuckDB
SELECT * FROM read_parquet('https://cbd.hccs.dev/data/crossings.parquet')
WHERE sector = 'nj' AND time_period = 'peak_1hr';
```

```js
// JavaScript
const resp = await fetch("https://cbd.hccs.dev/data/crossings.json")
const data = await resp.json()
```

## Dependencies

- `pyarrow` or `pandas` (extraction-side, for Parquet write)
- [hyparquet] (frontend, for in-browser Parquet reading)
- No backend/server infrastructure

## Implementation order

1. Add Parquet output to `extract.py` (or Makefile)
2. Serve Parquet + JSON from `www/public/data/`
3. Build `<DataExplorer>` component with hyparquet
4. Add route/navigation for `/data` page
5. Add download buttons and usage docs
