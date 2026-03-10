#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = ["click", "openpyxl", "pandas", "utz"]
# ///
"""Extract NYMTC Hub Bound Travel data from Excel files into JSON."""

import json
import re
from glob import glob
from math import nan
from os.path import basename, join
from pathlib import Path

from click import group, option
from pandas import isna, read_excel


def discover_years(base: str = ".") -> dict[int, Path]:
    """Find year directories containing Excel data."""
    years = {}
    for d in sorted(glob(join(base, "[0-9][0-9][0-9][0-9]"))):
        year = int(basename(d))
        years[year] = Path(d)
    return years


def find_excel(year_dir: Path, pattern: str) -> Path | None:
    """Find an Excel file matching a pattern in a year directory (recursive)."""
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


def load_nj_sector(xl_path: Path, sheet_name: str, raw: bool = False):
    """Load NJ sector rows from an AppendixII sheet.

    If raw=True, return rows before SECTOR TOTAL without dropping blank-name
    rows or replacing '-' with 0 (needed for shift detection/correction).
    """
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

    if raw:
        return a.iloc[:end]

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

    if table_base == 'Table14B' and year >= 2017:
        a = fix_14b_shift(xl_path, year)
    else:
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
    sector: str = 'nj',
) -> dict:
    return {
        'year': year,
        'sector': sector,
        'crossing': crossing,
        'mode': mode,
        'direction': direction,
        'time_period': time_period,
        'passengers': passengers,
    }


def fix_14b_shift(xl_path: Path, year: int):
    """Fix Table14B-1 NJ sector data shifted up by 1 row.

    In 2018-2024, non-auto values in Table14B-1 are circularly shifted up by 1
    row relative to their correct positions (which match Table14A-1's layout).
    For each data column, we detect the shift by comparing null patterns against
    14A-1, and un-shift (rotate values down by 1) where needed.

    Returns the corrected dataframe in the same format as load_nj_sector()
    (blank-name rows dropped, '-' replaced with 0).

    2017 is unaffected (14A and 14B have identical null patterns).
    """
    def has_data(val):
        if isna(val):
            return False
        try:
            return int(val) > 0
        except (ValueError, TypeError):
            return val != '-' and val != 0

    # Load raw (pre-dropna) data to preserve wrapped values in blank-name rows
    b14 = load_nj_sector(xl_path, 'Table14B-1', raw=True)
    a14 = load_nj_sector(xl_path, 'Table14A-1', raw=True)
    ncols = min(len(b14.columns), len(a14.columns))

    # Determine the shift window: rows 0..N where N is the last row with any
    # data value in either 14A or 14B. Fully-NaN trailing rows are excluded.
    max_data_row = 0
    for ri in range(min(len(b14), len(a14))):
        for ci in range(1, ncols):
            if has_data(a14.iloc[ri, ci]) or has_data(b14.iloc[ri, ci]):
                max_data_row = ri
    nrows = max_data_row + 1

    shifted_cols = []
    for ci in range(1, ncols):
        a14_pos = [ri for ri in range(nrows) if has_data(a14.iloc[ri, ci])]
        b14_pos = [ri for ri in range(nrows) if has_data(b14.iloc[ri, ci])]

        if a14_pos == b14_pos:
            continue

        # Verify this is a shift-up-by-1: each 14A position minus 1 (mod nrows)
        # should match 14B's positions
        expected_shifted = sorted((ri - 1) % nrows for ri in a14_pos)
        if sorted(b14_pos) != expected_shifted:
            raise ValueError(
                f"Table14B-1 col {ci} year {year}: unexpected null pattern. "
                f"14A positions={a14_pos}, 14B positions={b14_pos}, "
                f"expected shift-up-by-1={expected_shifted}"
            )
        shifted_cols.append(ci)

    if shifted_cols:
        b14 = b14.copy()
        for ci in shifted_cols:
            old_vals = [b14.iloc[ri, ci] for ri in range(nrows)]
            new_vals = [old_vals[-1]] + old_vals[:-1]
            for ri in range(nrows):
                b14.iloc[ri, ci] = new_vals[ri]

        # Verify corrected positions match 14A
        for ci in shifted_cols:
            a14_pos = [ri for ri in range(nrows) if has_data(a14.iloc[ri, ci])]
            b14_pos = [ri for ri in range(nrows) if has_data(b14.iloc[ri, ci])]
            if a14_pos != b14_pos:
                raise ValueError(
                    f"Table14B-1 col {ci} year {year}: post-fix positions "
                    f"{b14_pos} still don't match 14A {a14_pos}"
                )

        # Verify 3hr/1hr ratios are reasonable (1.5-4.0x)
        for ci in shifted_cols:
            for ri in range(nrows):
                if has_data(a14.iloc[ri, ci]) and has_data(b14.iloc[ri, ci]):
                    v1 = int(a14.iloc[ri, ci])
                    v3 = int(b14.iloc[ri, ci])
                    if v1 > 0:
                        ratio = v3 / v1
                        if not (1.5 <= ratio <= 4.0):
                            crossing = str(b14.iloc[ri, 0])
                            raise ValueError(
                                f"Table14B-1 col {ci} year {year} {crossing}: "
                                f"3hr/1hr ratio {ratio:.2f} outside [1.5, 4.0] "
                                f"(1hr={v1}, 3hr={v3})"
                            )

        print(f"  Table14B {year}: fixed shift-up-by-1 in cols {shifted_cols}")

    # Apply same finalization as load_nj_sector (drop blank rows, replace '-')
    return b14.dropna(subset=[0]).replace('-', 0)


# --- Tables 16-17: all-sector motor vehicle + bus data ---

SECTOR_HEADERS = {
    '60TH STREET SECTOR': '60th_street',
    'BROOKLYN SECTOR': 'brooklyn',
    'QUEENS SECTOR': 'queens',
    'NEW JERSEY SECTOR': 'nj',
}

# Normalize crossing names across years
CROSSING_NAME_ALIASES: dict[str, str] = {
    'ED KOCH QUEENSBORO BRIDGE RAMP': 'Ed Koch Queensboro Bridge Ramp',
    'CENTRAL PARK DRIVE AND 7TH AVENUE': 'Central Park Drive / 7th Ave',
    'HENRY HUDSON BRIDGE': 'Henry Hudson Bridge',
}


def normalize_crossing_name(raw: str) -> str:
    """Clean up crossing names for consistent output."""
    name = re.sub(r'\s*\*+\s*$', '', str(raw).strip())  # strip trailing asterisks
    if name in CROSSING_NAME_ALIASES:
        return CROSSING_NAME_ALIASES[name]
    # Title-case, preserving known abbreviations
    parts = name.split()
    result = []
    for p in parts:
        if p in ('FDR', 'LIRR', 'NJ'):
            result.append(p)
        elif p == 'ED':
            result.append('Ed')
        elif p in ('L.', 'AM', 'PM'):
            result.append(p)
        else:
            result.append(p.capitalize())
    return ' '.join(result)


def load_all_sector_vehicles(
    year: int,
    year_dir: Path,
    table: str,
    direction: str,
):
    """Parse Table16 or Table17 for all-sector motor vehicle + bus counts.

    Returns records with mode='Auto' or mode='Bus' per crossing, per time period.
    """
    xl_path = find_excel(year_dir, r"AppendixII_")
    if xl_path is None:
        raise FileNotFoundError(f"No AppendixII file found for {year} in {year_dir}")

    ws = read_excel(xl_path, sheet_name=table, header=None)

    # Detect column layout: pre-2017 has names in col 0, 2017+ in col 1
    # Find the name column by looking for a sector header
    name_col = None
    for ci in range(min(3, len(ws.columns))):
        if ws[ci].astype(str).str.contains('60TH STREET SECTOR', case=False, na=False).any():
            name_col = ci
            break
    if name_col is None:
        raise ValueError(f"Could not find sector headers in {table} for {year}")

    data_offset = name_col + 1  # first numeric column

    # Columns: Auto(1hr, 3hr, 24hr), Bus(1hr, 3hr, 24hr), Total(1hr, 3hr, 24hr)
    # We extract Auto and Bus columns (skip Total, it's derived)
    auto_cols = [data_offset, data_offset + 1, data_offset + 2]
    bus_cols = [data_offset + 3, data_offset + 4, data_offset + 5]
    time_periods = ['peak_1hr', 'peak_period', '24hr']

    records = []
    current_sector = None

    for _, row in ws.iterrows():
        name = str(row.get(name_col, '')).strip()
        if not name or name == 'nan':
            continue

        # Check for sector header
        name_upper = name.upper()
        if name_upper in SECTOR_HEADERS:
            current_sector = SECTOR_HEADERS[name_upper]
            continue

        # Skip totals and headers
        if 'SECTOR TOTAL' in name_upper or 'TOTAL, ALL' in name_upper:
            continue
        if 'LOCATION' in name_upper or 'TABLE' in name_upper:
            continue
        if 'AUTOS' in name_upper or 'VANS' in name_upper:
            continue
        if 'FALL BUSINESS' in name_upper or 'WHERE' in name_upper:
            continue
        if name_upper.startswith('NOTE') or name_upper.startswith('-'):
            continue
        # Skip time-period header rows (e.g. "8-9 AM", "5-6 PM", "24 HOURS")
        # but not crossing names that happen to contain "AM" (e.g. "WILLIAMSBURG")
        if re.match(r'^\d+[- ]\d+\s*(AM|PM)$', name_upper) or name_upper in ('24 HOURS', '24 HOUR'):
            continue

        if current_sector is None:
            continue

        crossing = normalize_crossing_name(name)

        for i, tp in enumerate(time_periods):
            # Auto
            auto_val = row.get(auto_cols[i])
            try:
                auto_val = int(auto_val)
                if auto_val > 0:
                    records.append(_rec(year, crossing, 'Auto', auto_val, direction, tp, current_sector))
            except (ValueError, TypeError):
                pass

            # Bus
            bus_val = row.get(bus_cols[i])
            try:
                bus_val = int(bus_val)
                if bus_val > 0:
                    records.append(_rec(year, crossing, 'Bus', bus_val, direction, tp, current_sector))
            except (ValueError, TypeError):
                pass

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

    # Extract all-sector vehicle/bus data (Tables 16-17)
    all_vehicles = []
    for table, direction in [('Table16', 'entering'), ('Table17', 'leaving')]:
        for year, year_dir in sorted(years.items()):
            try:
                records = load_all_sector_vehicles(year, year_dir, table, direction)
                all_vehicles.extend(records)
                print(f"  {table} {year}: {len(records)} records")
            except Exception as e:
                print(f"  {table} {year}: ERROR - {e}")

    vehicles_path = join(output_dir, 'vehicles.json')
    with open(vehicles_path, 'w') as f:
        json.dump(all_vehicles, f, indent=2)
        f.write('\n')
    print(f"Wrote {len(all_vehicles)} vehicle records to {vehicles_path}")


if __name__ == '__main__':
    cli()
