#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = ["click", "openpyxl", "pandas", "utz"]
# ///
"""Extract NYMTC Hub Bound Travel data from Excel files into JSON."""

import json
from glob import glob
from math import nan
from os.path import basename, join
from pathlib import Path

from click import group, option
from pandas import read_excel


def discover_years(base: str = ".") -> dict[int, Path]:
    """Find year directories containing Excel data."""
    years = {}
    for d in sorted(glob(join(base, "[0-9][0-9][0-9][0-9]"))):
        year = int(basename(d))
        years[year] = Path(d)
    return years


def find_excel(year_dir: Path, pattern: str) -> Path | None:
    """Find an Excel file matching a pattern in a year directory (recursive)."""
    import re
    matches = [
        p for p in year_dir.rglob("*.xlsx")
        if re.search(pattern, p.name)
    ]
    if matches:
        return matches[0]
    return None


def load_nj_day_modes(year: int, year_dir: Path):
    """Parse Quick Reference Table for NJ sector day volumes."""
    path = find_excel(year_dir, "Quick Reference Table")
    if path is None:
        raise FileNotFoundError(f"No Quick Reference Table found for {year} in {year_dir}")

    qr = read_excel(path)
    qr.columns = list(range(len(qr.columns)))

    if year == 2016:
        qr = qr[[0, 1, 3, 5]]
    elif year < 2016:
        pass
    else:
        qr = qr[[1, 2, 4, 6]]

    qr.columns = ['Mode'] + qr.loc[5].tolist()[1:]

    start_matches = qr[qr.Mode == 'NEW JERSEY'].index.tolist()
    if not start_matches:
        raise ValueError(f"Could not find 'NEW JERSEY' section in {year} Quick Reference Table")
    start = start_matches[0]

    end_matches = qr[qr.Mode == 'TOTAL  NEW JERSEY SECTOR - ALL MODES'].index.tolist()
    if not end_matches:
        end_matches = qr[qr.Mode.str.contains('TOTAL.*NEW JERSEY', na=False, case=False)].index.tolist()
    if not end_matches:
        raise ValueError(f"Could not find NJ total row in {year} Quick Reference Table")
    end = end_matches[0]

    qr = qr.iloc[start + 1:end].set_index('Mode')
    qr = qr.replace('-', nan).dropna(how='all')

    # Drop "ALL TRANSIT" row (appears in 2021)
    qr = qr[~qr.index.str.contains('ALL TRANSIT', na=False)]
    # Drop BICYCLE row if present
    qr = qr[~qr.index.str.contains('BICYCLE', na=False)]

    records = []
    for mode_raw, row in qr.iterrows():
        mode = normalize_mode(mode_raw)
        for direction, col_name in [('entering', 'Entering'), ('leaving', 'Leaving'), ('total', 'Total')]:
            val = row.get(col_name)
            if val is not None and val == val:  # not NaN
                records.append({
                    'year': year,
                    'sector': 'nj',
                    'mode': mode,
                    'direction': direction,
                    'time_period': '24hr',
                    'passengers': int(val),
                })
    return records


def normalize_mode(mode_raw: str) -> str:
    """Normalize mode names across years."""
    mode = str(mode_raw).strip()
    if mode in ('SUBWAY and PATH', 'SUBWAY/PATH'):
        return 'PATH'
    if mode == 'AUTOS, TAXIS, VANS AND TRUCKS':
        return 'AUTO'
    if mode == 'SUBURBAN AND INTERCITY RAIL':
        return 'RAIL'
    if mode.startswith('FERRY'):
        return 'FERRY'
    if mode == 'BUS':
        return 'BUS'
    return mode


def load_nj_sector(xl_path: Path, sheet_name: str):
    """Load NJ sector rows from an AppendixII sheet."""
    a = read_excel(xl_path, sheet_name=sheet_name)
    a = a.dropna(how='all', axis=1)
    a.columns = list(range(len(a.columns)))

    start_matches = a[a[0] == 'NEW JERSEY SECTOR'].index.tolist()
    if not start_matches:
        raise ValueError(f"Could not find 'NEW JERSEY SECTOR' in {sheet_name} of {xl_path}")
    start = start_matches[0]

    a = a.iloc[start + 1:].reset_index(drop=True)
    end_matches = a[a[0] == 'SECTOR TOTAL'].index.tolist()
    if not end_matches:
        raise ValueError(f"Could not find 'SECTOR TOTAL' in {sheet_name} of {xl_path}")
    end = end_matches[0]

    a = a.iloc[:end - 1].dropna(subset=[0]).replace('-', 0)
    return a


TABLE_CONFIG = [
    ('Table14A', 'entering', 'peak_1hr'),
    ('Table14B', 'entering', 'peak_period'),
    ('Table14C', 'entering', '24hr'),
    ('Table15A', 'leaving',  'peak_1hr'),
    ('Table15B', 'leaving',  'peak_period'),
    ('Table15C', 'leaving',  '24hr'),
]

# Known modes for each NJ sector crossing. Column indices in the source Excel
# are unreliable (some years have data in wrong columns), so we extract by
# summing all numeric values and assigning to known modes per crossing.
# Autos is always column 1 (first data column); the "non-auto" mode is
# whichever other column holds the remaining value.
CROSSING_MODES: dict[str, list[str]] = {
    'Lincoln Tunnel':                ['Autos', 'Bus'],
    'Holland Tunnel':                ['Autos', 'Bus'],
    'Amtrak/N.J. Transit Tunnels':   ['Rail'],
    'Uptown PATH Tunnel':            ['PATH'],
    'Downtown PATH Tunnel':          ['PATH'],
}
# Pre-2017 variant names
CROSSING_ALIASES: dict[str, str] = {
    'Uptown Path Tunnel':   'Uptown PATH Tunnel',
    'Downtown Path Tunnel': 'Downtown PATH Tunnel',
}


def load_nj_crossings(
    year: int,
    year_dir: Path,
    table_base: str = 'Table14A',
    direction: str = 'entering',
    time_period: str = 'peak_1hr',
):
    """Parse AppendixII table for NJ crossing-level data."""
    xl_path = find_excel(year_dir, r"AppendixII_")
    if xl_path is None:
        raise FileNotFoundError(f"No AppendixII file found for {year} in {year_dir}")

    if year < 2017:
        sheet_name = table_base
    else:
        sheet_name = f'{table_base}-1'

    a = load_nj_sector(xl_path, sheet_name)

    # Pre-2017 single sheets have 12+ columns (modes + Tramway, Bicycle, totals).
    # Mode data occupies columns 1-7 (Autos..Ferry). 2017+ -1 sheets have 7 cols
    # (modes only, Ferry on -2 sheet). Cap iteration to exclude total columns.
    max_mode_col = 8 if year < 2017 else len(a.columns)

    # Sheet-2 ferry data (2017+) or column 7 (pre-2017)
    ferry_data: dict[str, int] = {}
    if year < 2017:
        for _, row in a.iterrows():
            crossing = str(row[0])
            crossing = CROSSING_ALIASES.get(crossing, crossing)
            val = row.get(7, 0)
            if val and val != 0:
                ferry_data[crossing] = int(val)
    else:
        a2 = load_nj_sector(xl_path, f'{table_base}-2')
        for _, row in a2.iterrows():
            crossing = str(row[0])
            val = row.get(1, 0)
            if val and val != 0:
                ferry_data[crossing] = int(val)

    records = []
    for _, row in a.iterrows():
        crossing = str(row[0])
        crossing = CROSSING_ALIASES.get(crossing, crossing)
        modes = CROSSING_MODES.get(crossing)
        if modes is None:
            continue

        # Collect positive numeric values from mode columns only (skip col 0 = name)
        nums = []
        for ci in range(1, max_mode_col):
            v = row[ci]
            try:
                v = int(v)
                if v > 0:
                    nums.append((ci, v))
            except (ValueError, TypeError):
                pass

        if 'Autos' in modes:
            # First data column is always Autos
            autos = nums[0][1] if nums else 0
            other_mode = [m for m in modes if m != 'Autos'][0]
            other_val = sum(v for ci, v in nums[1:])
            if autos > 0:
                records.append(_rec(year, crossing, 'Autos', autos, direction, time_period))
            if other_val > 0:
                records.append(_rec(year, crossing, other_mode, other_val, direction, time_period))
        else:
            # Single non-auto mode: sum all values
            total = sum(v for _, v in nums)
            if total > 0:
                records.append(_rec(year, crossing, modes[0], total, direction, time_period))

    # Ferry records
    for crossing, val in ferry_data.items():
        if val > 0:
            records.append(_rec(year, 'All Ferry Points', 'Ferry', val, direction, time_period))

    return records


def _rec(
    year: int,
    crossing: str,
    mode: str,
    passengers: int,
    direction: str,
    time_period: str,
) -> dict:
    return {
        'year': year,
        'sector': 'nj',
        'crossing': crossing,
        'mode': mode,
        'direction': direction,
        'time_period': time_period,
        'passengers': passengers,
    }


@group()
def cli():
    """Extract NYMTC Hub Bound Travel data."""


@cli.command()
@option('-o', '--output-dir', default='data', help='Output directory for JSON files.')
@option('-y', '--year', 'years_filter', multiple=True, type=int, help='Filter to specific years.')
def extract(output_dir: str, years_filter: tuple[int, ...]):
    """Extract all data from Excel files into JSON."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    years = discover_years()

    if years_filter:
        years = {y: d for y, d in years.items() if y in years_filter}

    # Extract modes (Quick Reference Table)
    all_modes = []
    for year, year_dir in sorted(years.items()):
        try:
            records = load_nj_day_modes(year, year_dir)
            all_modes.extend(records)
            print(f"  modes {year}: {len(records)} records")
        except Exception as e:
            print(f"  modes {year}: ERROR - {e}")

    modes_path = join(output_dir, 'modes.json')
    with open(modes_path, 'w') as f:
        json.dump(all_modes, f, indent=2)
        f.write('\n')
    print(f"Wrote {len(all_modes)} mode records to {modes_path}")

    # Extract crossings (AppendixII Tables 14A-C, 15A-C)
    all_crossings = []
    for table_base, direction, time_period in TABLE_CONFIG:
        for year, year_dir in sorted(years.items()):
            try:
                records = load_nj_crossings(year, year_dir, table_base, direction, time_period)
                all_crossings.extend(records)
                print(f"  {table_base} {year}: {len(records)} records")
            except Exception as e:
                print(f"  {table_base} {year}: ERROR - {e}")

    crossings_path = join(output_dir, 'crossings.json')
    with open(crossings_path, 'w') as f:
        json.dump(all_crossings, f, indent=2)
        f.write('\n')
    print(f"Wrote {len(all_crossings)} crossing records to {crossings_path}")


if __name__ == '__main__':
    cli()
