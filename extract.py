#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = ["click", "openpyxl", "pandas", "utz"]
# ///
"""Extract NYMTC Hub Bound Travel data from Excel files into JSON."""

import json
from glob import glob
from math import nan
from os.path import basename, dirname, exists, join
from pathlib import Path

from click import group, option
from pandas import ExcelFile, concat, read_excel


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


def load_nj_crossings(year: int, year_dir: Path, time_period: str = 'peak_1hr'):
    """Parse AppendixII Table14A for NJ crossing-level peak hour data."""
    xl_path = find_excel(year_dir, r"AppendixII_")
    if xl_path is None:
        raise FileNotFoundError(f"No AppendixII file found for {year} in {year_dir}")

    cols = {
        0: 'Crossing',
        1: 'Autos',
        3: 'PATH',
        4: 'Bus',
        6: 'Rail',
    }

    if year < 2017:
        sheet_name = 'Table14A'
        cols[7] = 'Ferry'
    else:
        sheet_name = 'Table14A-1'

    a = load_nj_sector(xl_path, sheet_name)
    a = a[list(cols.keys())]
    a.columns = list(cols.values())

    if year < 2017:
        a.loc[a.Crossing == 'Uptown Path Tunnel', 'Crossing'] = 'Uptown PATH Tunnel'
        a.loc[a.Crossing == 'Downtown Path Tunnel', 'Crossing'] = 'Downtown PATH Tunnel'

    a = a.set_index('Crossing')

    if year >= 2017:
        a2 = load_nj_sector(xl_path, 'Table14A-2')
        a2 = a2[[0, 1]]
        a2.columns = ['Crossing', 'Ferry']
        a2 = a2.set_index('Crossing')
        a = a.join(a2, how='outer').fillna(0)

    a = a.astype(int)

    records = []
    for crossing, row in a.iterrows():
        for mode in ['Autos', 'PATH', 'Bus', 'Rail', 'Ferry']:
            val = int(row.get(mode, 0))
            if val > 0:
                records.append({
                    'year': year,
                    'sector': 'nj',
                    'crossing': str(crossing),
                    'mode': mode,
                    'time_period': time_period,
                    'passengers': val,
                })
    return records


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

    # Extract crossings (AppendixII Table14A)
    all_crossings = []
    for year, year_dir in sorted(years.items()):
        try:
            records = load_nj_crossings(year, year_dir)
            all_crossings.extend(records)
            print(f"  crossings {year}: {len(records)} records")
        except Exception as e:
            print(f"  crossings {year}: ERROR - {e}")

    crossings_path = join(output_dir, 'crossings.json')
    with open(crossings_path, 'w') as f:
        json.dump(all_crossings, f, indent=2)
        f.write('\n')
    print(f"Wrote {len(all_crossings)} crossing records to {crossings_path}")


if __name__ == '__main__':
    cli()
