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


def load_all_sector_table(
    year: int,
    year_dir: Path,
    table: str,
    direction: str,
    mode_a: str = 'Auto',
    mode_b: str = 'Bus',
):
    """Parse an all-sector AppendixII table with 3-column-group layout.

    Tables 16-17 have Auto/Bus/Total; Tables 18-19 have Local Bus/Express Bus/Total.
    We extract the first two groups (mode_a, mode_b), skip Total (derived).
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

    # Columns: GroupA(1hr, 3hr, 24hr), GroupB(1hr, 3hr, 24hr), Total(1hr, 3hr, 24hr)
    # We extract GroupA and GroupB columns (skip Total, it's derived)
    a_cols = [data_offset, data_offset + 1, data_offset + 2]
    b_cols = [data_offset + 3, data_offset + 4, data_offset + 5]
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
        if 'AUTOS' in name_upper or 'VANS' in name_upper or 'LOCAL BUS' in name_upper or 'EXPRESS BUS' in name_upper:
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
            for cols, mode in [(a_cols, mode_a), (b_cols, mode_b)]:
                val = row.get(cols[i])
                try:
                    val = int(val)
                    if val > 0:
                        records.append(_rec(year, crossing, mode, val, direction, tp, current_sector))
                except (ValueError, TypeError):
                    pass

    return records


# --- Tables 24-27: hourly by mode / sector (single year per file) ---

MODE_COLUMNS = {
    'AUTO/TAXI VAN/TRUCK': 'Auto',
    'AUTO/TAXI\nVAN/TRUCK': 'Auto',
    'SUBWAY': 'Subway',
    'BUSES': 'Bus',
    'SUBURBAN RAIL': 'Rail',
    'SUBURBAN\nRAIL': 'Rail',
    'FERRY': 'Ferry',
    'TRAMWAY': 'Tramway',
    'BICYCLE (1)': 'Bicycle',
    'BICYCLE': 'Bicycle',
    'BICYCLE(1)': 'Bicycle',
}

# Partial-match patterns for sector column headers (split across rows in 2017+)
SECTOR_KEYWORDS: list[tuple[str, str]] = [
    ('60TH', '60th_street'),
    ('BROOKLYN', 'brooklyn'),
    ('QUEENS', 'queens'),
    ('NEW JERSEY', 'nj'),
    ('N. J.', 'nj'),
    ('N.J.', 'nj'),
    ('STATEN', 'staten_island'),
    ('S. I.', 'staten_island'),
    ('S.I.', 'staten_island'),
    ('ROOSEVELT', 'roosevelt_island'),
]


def parse_hour(raw: str) -> int | None:
    """Parse hour string like '8:00am' or '12:00pm' to 0-23."""
    m = re.match(r'(\d{1,2}):?\d*\s*(am|pm)', str(raw).strip().lower())
    if not m:
        return None
    h = int(m.group(1))
    ap = m.group(2)
    if ap == 'am':
        return h % 12
    else:
        return (h % 12) + 12


def load_hourly_by_mode(year: int, year_dir: Path, table: str, direction: str):
    """Parse Tables 24/25: hourly persons by mode for a single year."""
    xl_path = find_excel(year_dir, r"AppendixII_")
    if xl_path is None:
        raise FileNotFoundError(f"No AppendixII file found for {year} in {year_dir}")

    # Pre-2017: combined sheet "Table24-25"
    if year < 2017:
        sheet = 'Table24-25'
    else:
        sheet = table

    ws = read_excel(xl_path, sheet_name=sheet, header=None)

    # For combined sheets, find the right table section
    if year < 2017 and table == 'Table25':
        # Find second "TABLE 25" or "LEAVING" marker
        for ri in range(len(ws)):
            cell = str(ws.iloc[ri, 0]).upper() if not isna(ws.iloc[ri, 0]) else ''
            if 'TABLE 25' in cell or ('LEAVING' in cell and ri > 5):
                ws = ws.iloc[ri:].reset_index(drop=True)
                break

    # Find header row with mode names
    header_ri = None
    mode_col_map: dict[int, str] = {}
    for ri in range(min(15, len(ws))):
        for ci in range(len(ws.columns)):
            cell = str(ws.iloc[ri, ci]).strip() if not isna(ws.iloc[ri, ci]) else ''
            cell_upper = cell.upper()
            for pattern, mode in MODE_COLUMNS.items():
                if cell_upper == pattern.upper():
                    mode_col_map[ci] = mode
                    header_ri = ri
    if not mode_col_map:
        raise ValueError(f"Could not find mode headers in {table} for {year}")

    records = []
    for ri in range(header_ri + 1, len(ws)):
        # Find hour in first few columns
        hour = None
        for ci in range(min(3, len(ws.columns))):
            val = ws.iloc[ri, ci]
            if not isna(val):
                hour = parse_hour(str(val))
                if hour is not None:
                    break
        if hour is None:
            # Check if it's a TOTAL row — stop
            cell = str(ws.iloc[ri, 0] if not isna(ws.iloc[ri, 0]) else ws.iloc[ri, 1] if len(ws.columns) > 1 and not isna(ws.iloc[ri, 1]) else '')
            if 'TOTAL' in cell.upper():
                break
            continue

        for ci, mode in mode_col_map.items():
            val = ws.iloc[ri, ci]
            try:
                val = int(val)
                if val >= 0:
                    records.append({
                        'year': year,
                        'hour': hour,
                        'direction': direction,
                        'category': 'mode',
                        'key': mode,
                        'persons': val,
                    })
            except (ValueError, TypeError):
                pass

    return records


def load_hourly_by_sector(year: int, year_dir: Path, table: str, direction: str):
    """Parse Tables 26/27: hourly persons by sector for a single year."""
    xl_path = find_excel(year_dir, r"AppendixII_")
    if xl_path is None:
        raise FileNotFoundError(f"No AppendixII file found for {year} in {year_dir}")

    if year < 2017:
        sheet = 'Table26-27'
    else:
        sheet = table

    ws = read_excel(xl_path, sheet_name=sheet, header=None)

    # For combined sheets, find Table 27 section
    if year < 2017 and table == 'Table27':
        for ri in range(len(ws)):
            cell = str(ws.iloc[ri, 0]).upper() if not isna(ws.iloc[ri, 0]) else ''
            if 'TABLE 27' in cell or ('LEAVING' in cell and ri > 5):
                ws = ws.iloc[ri:].reset_index(drop=True)
                break

    # Find header row with sector names (may be split across 2 rows in 2017+)
    header_ri = None
    sector_col_map: dict[int, str] = {}
    for ri in range(min(15, len(ws))):
        for ci in range(len(ws.columns)):
            cell = str(ws.iloc[ri, ci]).strip().upper() if not isna(ws.iloc[ri, ci]) else ''
            if not cell:
                continue
            for keyword, sector in SECTOR_KEYWORDS:
                if keyword in cell and ci not in sector_col_map:
                    sector_col_map[ci] = sector
                    header_ri = ri
    if not sector_col_map:
        raise ValueError(f"Could not find sector headers in {table} for {year}")

    records = []
    for ri in range(header_ri + 1, len(ws)):
        hour = None
        for ci in range(min(3, len(ws.columns))):
            val = ws.iloc[ri, ci]
            if not isna(val):
                hour = parse_hour(str(val))
                if hour is not None:
                    break
        if hour is None:
            cell = str(ws.iloc[ri, 0] if not isna(ws.iloc[ri, 0]) else ws.iloc[ri, 1] if len(ws.columns) > 1 and not isna(ws.iloc[ri, 1]) else '')
            if 'TOTAL' in cell.upper():
                break
            continue

        for ci, sector in sector_col_map.items():
            val = ws.iloc[ri, ci]
            try:
                val = int(val)
                if val >= 0:
                    records.append({
                        'year': year,
                        'hour': hour,
                        'direction': direction,
                        'category': 'sector',
                        'key': sector,
                        'persons': val,
                    })
            except (ValueError, TypeError):
                pass

    return records


def load_hourly_totals(year: int, year_dir: Path, table: str, measure: str):
    """Parse Tables 21A/22A/23A: hourly totals (3 years per file).

    Returns records for up to 3 years found in the table.
    measure is 'total_persons', 'transit_passengers', or 'motor_vehicles'.
    """
    xl_path = find_excel(year_dir, r"AppendixII_")
    if xl_path is None:
        raise FileNotFoundError(f"No AppendixII file found for {year} in {year_dir}")

    if year < 2017:
        # e.g. Table21A -> Table21A-21B
        num = re.search(r'(\d+)', table).group(1)
        sheet = f'{table}-{num}B'
    else:
        sheet = table

    ws = read_excel(xl_path, sheet_name=sheet, header=None)

    # Find years row: scan for a row with multiple 4-digit year values
    years_row = None
    year_cols: dict[int, tuple[int, int, int]] = {}  # year -> (inbound_col, outbound_col, total_col)
    for ri in range(min(12, len(ws))):
        found_years = []
        for ci in range(len(ws.columns)):
            val = ws.iloc[ri, ci]
            try:
                v = int(val)
                if 1990 <= v <= 2030:
                    found_years.append((ci, v))
            except (ValueError, TypeError):
                pass
        if len(found_years) >= 2:
            years_row = ri
            # Each year has 3 columns: inbound, outbound, total
            for ci, y in found_years:
                year_cols[y] = (ci, ci + 1, ci + 2)
            break

    if years_row is None:
        raise ValueError(f"Could not find year headers in {table} for {year}")

    # Find data start: first row after years_row with an hour value
    data_start = None
    for ri in range(years_row + 1, min(years_row + 5, len(ws))):
        for ci in range(min(3, len(ws.columns))):
            val = ws.iloc[ri, ci]
            if not isna(val) and parse_hour(str(val)) is not None:
                data_start = ri
                break
        if data_start is not None:
            break

    if data_start is None:
        raise ValueError(f"Could not find data rows in {table} for {year}")

    records = []
    for ri in range(data_start, len(ws)):
        hour = None
        for ci in range(min(3, len(ws.columns))):
            val = ws.iloc[ri, ci]
            if not isna(val):
                hour = parse_hour(str(val))
                if hour is not None:
                    break
        if hour is None:
            cell = str(ws.iloc[ri, 0] if not isna(ws.iloc[ri, 0]) else ws.iloc[ri, 1] if len(ws.columns) > 1 and not isna(ws.iloc[ri, 1]) else '')
            if 'TOTAL' in cell.upper():
                break
            continue

        for y, (in_col, out_col, _tot_col) in year_cols.items():
            for direction, col in [('entering', in_col), ('leaving', out_col)]:
                val = ws.iloc[ri, col]
                try:
                    val = int(val)
                    if val >= 0:
                        records.append({
                            'year': y,
                            'hour': hour,
                            'direction': direction,
                            'category': measure,
                            'key': 'all',
                            'persons': val,
                        })
                except (ValueError, TypeError):
                    pass

    return records


# --- AppendixIII: granular hourly data by sector ---

# Sector keyword matching for AppendixIII headers
APPIII_SECTOR_KEYWORDS: list[tuple[str, str]] = [
    ('60TH', '60th_street'),
    ('BROOKLYN', 'brooklyn'),
    ('QUEENS', 'queens'),
    ('NEW JERSEY', 'nj'),
    ('N. J.', 'nj'),
    ('N.J.', 'nj'),
    ('STATEN', 'staten_island'),
    ('S. I.', 'staten_island'),
    ('ROOSEVEL', 'roosevelt_island'),  # handles "ROOSEVEL ISLAND" typo in 2014
]

# AppendixIII section configs
APPIII_SECTIONS = {
    'A': {
        'description': 'Bus transit',
        'file_pattern': r'SectionA',
        'sub_cols': ['buses', 'passengers'],
        'sheets_2017': {'entering': 'Total by Sector-In-bound', 'leaving': 'Total by Sector-Out-bound'},
        'sheets_pre2017': 'By Sector',
    },
    'B': {
        'description': 'Subway/PATH',
        'file_pattern': r'SectionB',
        'sub_cols': ['trains', 'cars', 'passengers'],
        'sheets_2017': {'entering': 'Rec_Sec-Inbound', 'leaving': 'Rec_Sec-Outbound'},
        'sheets_pre2017': 'REC SEC',
    },
    'C': {
        'description': 'Suburban/intercity rail',
        'file_pattern': r'SectionC',
        'sub_cols': ['trains', 'cars', 'passengers'],
        'sheets_2017': {'entering': 'Rec-Suburban_Rail_Inbound', 'leaving': 'Rec-Suburban_Rail-Outbound'},
        'sheets_pre2017': 'Rec',
    },
    'D': {
        'description': 'Auto occupants',
        'file_pattern': r'SectionD',
        'sub_cols': ['occupants'],
        'sheets_2017': {'entering': 'REC-Inbound', 'leaving': 'REC-Outbound'},
        'sheets_pre2017': 'REC',
    },
    'E': {
        'description': 'Vehicle counts',
        'file_pattern': r'SectionE',
        'sub_cols': ['vehicles'],
        'sheets_2017': {'entering': 'Rec', 'leaving': 'Rec'},
        'sheets_pre2017': 'Rec',
    },
    'F': {
        'description': 'Ferry/tramway',
        'file_pattern': r'SectionF',
        'sub_cols': ['passengers'],
        'sheets_2017': {'entering': 'Ferry-Inbound', 'leaving': 'Ferry-Outbound'},
        'sheets_pre2017': 'ferry',
    },
    'G': {
        'description': 'Bicycle volumes',
        'file_pattern': r'SectionG',
        'sub_cols': ['bicycles'],
        'sheets_2017': {'entering': 'REC-Inbound', 'leaving': 'REC-Outbound'},
        'sheets_pre2017': 'REC',
    },
}


def load_appiii_summary(
    year: int,
    year_dir: Path,
    section: str,
    direction: str,
):
    """Parse an AppendixIII summary sheet for sector-level hourly data.

    Returns records with: year, hour, direction, section, sector, and
    sub-column values (e.g. buses/passengers, trains/cars/passengers).
    """
    cfg = APPIII_SECTIONS[section]
    xl_path = find_excel(year_dir, cfg['file_pattern'])
    if xl_path is None:
        raise FileNotFoundError(f"No AppendixIII Section {section} file found for {year}")

    # Determine sheet name
    if year >= 2017:
        sheet = cfg['sheets_2017'][direction]
    else:
        sheet = cfg['sheets_pre2017']

    ws = read_excel(xl_path, sheet_name=sheet, header=None)

    # For pre-2017 combined sheets, split on direction
    if year < 2017:
        if direction == 'leaving':
            # Find OUTBOUND marker
            out_start = None
            for ri in range(len(ws)):
                for ci in range(min(5, len(ws.columns))):
                    cell = str(ws.iloc[ri, ci]).upper() if not isna(ws.iloc[ri, ci]) else ''
                    if 'OUTBOUND' in cell:
                        out_start = ri
                        break
                if out_start is not None:
                    break
            if out_start is None:
                raise ValueError(f"Could not find OUTBOUND section in {sheet} for {year}")
            ws = ws.iloc[out_start:].reset_index(drop=True)
        # For inbound, just use the sheet as-is (inbound comes first)

    sub_cols = cfg['sub_cols']
    stride = len(sub_cols)

    # Find sector headers by scanning for keywords
    sector_col_map: dict[int, str] = {}  # col_index -> sector_key
    header_ri = None
    for ri in range(min(12, len(ws))):
        for ci in range(len(ws.columns)):
            cell = str(ws.iloc[ri, ci]).strip().upper() if not isna(ws.iloc[ri, ci]) else ''
            if not cell:
                continue
            # Skip "TOTAL" columns
            if 'TOTAL' in cell:
                continue
            for keyword, sector in APPIII_SECTOR_KEYWORDS:
                if keyword in cell and ci not in sector_col_map:
                    sector_col_map[ci] = sector
                    header_ri = ri

    if not sector_col_map:
        raise ValueError(f"Could not find sector headers in Section {section} {sheet} for {year}")

    # Find data start: first row after headers with an hour value
    data_start = None
    for ri in range(header_ri + 1, min(header_ri + 6, len(ws))):
        for ci in range(min(3, len(ws.columns))):
            val = ws.iloc[ri, ci]
            if not isna(val) and parse_hour(str(val)) is not None:
                data_start = ri
                break
        if data_start is not None:
            break

    if data_start is None:
        raise ValueError(f"Could not find data rows in Section {section} {sheet} for {year}")

    records = []
    for ri in range(data_start, len(ws)):
        hour = None
        for ci in range(min(3, len(ws.columns))):
            val = ws.iloc[ri, ci]
            if not isna(val):
                hour = parse_hour(str(val))
                if hour is not None:
                    break
        if hour is None:
            # Stop at TOTAL row
            for ci in range(min(3, len(ws.columns))):
                cell = str(ws.iloc[ri, ci]).upper() if not isna(ws.iloc[ri, ci]) else ''
                if 'TOTAL' in cell:
                    break
            else:
                continue
            break

        for start_ci, sector in sector_col_map.items():
            for offset, sub_name in enumerate(sub_cols):
                ci = start_ci + offset
                if ci >= len(ws.columns):
                    continue
                val = ws.iloc[ri, ci]
                try:
                    val = int(float(val))
                    if val >= 0:
                        records.append({
                            'year': year,
                            'hour': hour,
                            'direction': direction,
                            'section': section,
                            'sector': sector,
                            'measure': sub_name,
                            'value': val,
                        })
                except (ValueError, TypeError):
                    pass

    return records


# AppendixIII detail sheet configs per section and sector
# Each entry: (sector, sheet_name_2017+_inbound, sheet_name_2017+_outbound, sheet_name_pre2017, sub_cols)
APPIII_DETAIL_SHEETS = {
    'B': {  # Subway/PATH
        '60th_street': {
            'sheets_2017': ('60th ST Sec-Inbound', '60th ST Sec-Outbound'),
            'sheets_pre2017': '60TH ST SEC',
            'sub_cols': ['trains', 'cars', 'passengers'],
            'header_row_hint': 'TRAINS',  # look for this in sub-header row
        },
        'brooklyn': {
            'sheets_2017': (['Brooklyn-Inbound_pg1', 'Brooklyn-Inbound_pg2'],
                            ['Brooklyn-Outbound_pg1', 'Brooklyn-Outbound_pg2']),
            'sheets_pre2017': 'BRKLN',
            'sub_cols': ['trains', 'cars', 'passengers'],
            'header_row_hint': 'TRAINS',
        },
        'queens': {
            'sheets_2017': ('Queens-Inbound', 'Queens-Outbound'),
            'sheets_pre2017': 'QNS',
            'sub_cols': ['trains', 'cars', 'passengers'],
            'header_row_hint': 'TRAINS',
        },
        'nj': {
            'sheets_2017': ('NJ-Inbound', 'NJ-Outbound'),
            'sheets_pre2017': 'NJ',
            'sub_cols': ['trains', 'cars', 'passengers'],
            'header_row_hint': 'TRAINS',
        },
    },
    'C': {  # Suburban/intercity rail
        '60th_street': {
            'sheets_2017': ('60th_St-Inbound', '60th_St-Outbound'),
            'sheets_pre2017': '60th',
            'sub_cols': ['trains', 'cars', 'passengers'],
            'header_row_hint': 'TRAINS',
        },
        'queens': {
            'sheets_2017': ('Queens-Inbound', 'Queens-Outbound'),
            'sheets_pre2017': 'Qns',
            'sub_cols': ['trains', 'cars', 'passengers'],
            'header_row_hint': 'TRAINS',
        },
        'nj': {
            'sheets_2017': ('NJ-Inbound', 'NJ-Outbound'),
            'sheets_pre2017': 'NJ',
            'sub_cols': ['trains', 'cars', 'passengers'],
            'header_row_hint': 'TRAINS',
        },
    },
    'D': {  # Auto occupants
        '60th_street': {
            'sheets_2017': ('60TH ST-Inbound', '60TH ST-Outbound'),
            'sheets_pre2017': '60TH ST SEC',
            'sub_cols': ['occupants'],
            'header_row_hint': None,
        },
        'bqnj': {
            'sheets_2017': ('BQNJ-Inbound', 'BQNJ-Outbound'),
            'sheets_pre2017': 'BQNJSI',
            'sub_cols': ['occupants'],
            'header_row_hint': None,
        },
    },
    'E': {  # Vehicle counts
        '60th_street': {
            'sheets_2017': ('60TH ST-Inbound', '60TH ST-Outbound'),
            'sheets_pre2017': '60TH STREET',
            'sub_cols': ['vehicles'],
            'header_row_hint': None,
        },
        'bqnj': {
            'sheets_2017': ('BQNJSI-Inbound', 'BQNJSI-Outbound'),
            'sheets_pre2017': 'BQNJSI',
            'sub_cols': ['vehicles'],
            'header_row_hint': None,
        },
    },
    'G': {  # Bicycle
        '60th_street': {
            'sheets_2017': ('60th_St-Inbound', '60th_St-Outbound'),
            'sheets_pre2017': '60th st',
            'sub_cols': ['bicycles'],
            'header_row_hint': None,
        },
        'bqsi': {
            'sheets_2017': ('BQSI-Inbound', 'BQSI-Outbound'),
            'sheets_pre2017': 'BQSI',
            'sub_cols': ['bicycles'],
            'header_row_hint': None,
        },
    },
}

# Normalize facility/line names
FACILITY_ALIASES: dict[str, str] = {
    "B'WAY/7TH AVE EXPESS": "Broadway/7th Express",
    "B'WAY/7TH AVE LOCAL": "Broadway/7th Local",
    "B'WAY/7TH AVE EXPRESS": "Broadway/7th Express",
}


def normalize_facility_name(raw: str) -> str:
    """Normalize facility/line names from AppendixIII detail sheets."""
    name = re.sub(r'\s*\*+\s*$', '', str(raw).strip())
    name = re.sub(r'\s+', ' ', name)
    if name in FACILITY_ALIASES:
        return FACILITY_ALIASES[name]
    # Title-case, preserving known abbreviations
    if name.isupper() and len(name) > 3:
        parts = name.split()
        result = []
        for p in parts:
            if p in ('FDR', 'LIRR', 'NJ', 'PATH', 'NEC', 'NJCL', 'MTA', 'RI'):
                result.append(p)
            elif p in ('ST.', 'ST', 'AVE', 'AVE.'):
                result.append(p.capitalize())
            elif re.match(r'^\d', p):
                result.append(p.lower())
            else:
                result.append(p.capitalize())
        return ' '.join(result)
    return name


def parse_detail_sheet(
    ws,
    year: int,
    direction: str,
    section: str,
    sector: str,
    sub_cols: list[str],
    header_hint: str | None,
) -> list[dict]:
    """Parse an AppendixIII detail sheet with facility/line columns.

    Finds facility name columns, maps their TRAINS/CARS/PSGRS (or single-value)
    sub-columns, and extracts 24 hours of data.
    """
    stride = len(sub_cols)

    # Find the sub-header row (TRAINS/CARS/PSGRS or similar)
    # For single-column sections (D, E, G), look for facility names directly
    sub_header_ri = None
    facility_col_map: dict[int, str] = {}  # start_col -> facility_name

    if header_hint and stride > 1:
        # Multi-column: find TRAINS/CARS/PSGRS row
        for ri in range(min(15, len(ws))):
            for ci in range(len(ws.columns)):
                cell = str(ws.iloc[ri, ci]).strip().upper() if not isna(ws.iloc[ri, ci]) else ''
                if cell == header_hint:
                    sub_header_ri = ri
                    break
            if sub_header_ri is not None:
                break

        if sub_header_ri is None:
            raise ValueError(f"Could not find '{header_hint}' sub-header row")

        # Facility names may be above OR below the sub-header row
        search_rows = []
        for delta in range(-1, -4, -1):
            ri = sub_header_ri + delta
            if 0 <= ri < len(ws):
                search_rows.append(ri)
        for delta in range(1, 4):
            ri = sub_header_ri + delta
            if 0 <= ri < len(ws):
                search_rows.append(ri)

        for name_ri in search_rows:
            for ci in range(len(ws.columns)):
                cell = ws.iloc[name_ri, ci]
                if isna(cell):
                    continue
                cell_str = str(cell).strip()
                if not cell_str or cell_str.upper() == 'HOURS':
                    continue
                # Check this column aligns with a sub-header column
                # Look for the hint keyword at this col in any nearby row
                found_sub = False
                for sub_ri in range(max(0, name_ri - 3), min(len(ws), name_ri + 4)):
                    sub_val = str(ws.iloc[sub_ri, ci]).strip().upper() if not isna(ws.iloc[sub_ri, ci]) else ''
                    if sub_val == header_hint:
                        found_sub = True
                        break
                if found_sub and 'TOTAL' not in cell_str.upper():
                    facility_col_map[ci] = normalize_facility_name(cell_str)
            if facility_col_map:
                break
    else:
        # Single-column sections: facility names in header row, one value per facility
        # Find the row with facility names (look for known road/crossing names)
        for ri in range(min(12, len(ws))):
            found = {}
            for ci in range(1, len(ws.columns)):
                cell = ws.iloc[ri, ci]
                if isna(cell):
                    continue
                cell_str = str(cell).strip()
                if not cell_str or cell_str.upper() in ('HOURS', 'TOTAL', 'SECTOR TOTAL'):
                    continue
                if len(cell_str) > 2 and cell_str.upper() not in ('NAN',):
                    found[ci] = cell_str
            if len(found) >= 3:
                facility_col_map = {ci: normalize_facility_name(name) for ci, name in found.items()
                                    if 'TOTAL' not in name.upper()}
                sub_header_ri = ri
                break

    if not facility_col_map:
        raise ValueError(f"Could not find facility names in detail sheet")

    # Find data start
    search_start = sub_header_ri + 1 if sub_header_ri is not None else 0
    data_start = None
    for ri in range(search_start, min(search_start + 5, len(ws))):
        for ci in range(min(3, len(ws.columns))):
            val = ws.iloc[ri, ci]
            if not isna(val) and parse_hour(str(val)) is not None:
                data_start = ri
                break
        if data_start is not None:
            break

    if data_start is None:
        raise ValueError(f"Could not find data rows")

    records = []
    for ri in range(data_start, len(ws)):
        hour = None
        for ci in range(min(3, len(ws.columns))):
            val = ws.iloc[ri, ci]
            if not isna(val):
                hour = parse_hour(str(val))
                if hour is not None:
                    break
        if hour is None:
            for ci in range(min(3, len(ws.columns))):
                cell = str(ws.iloc[ri, ci]).upper() if not isna(ws.iloc[ri, ci]) else ''
                if 'TOTAL' in cell:
                    break
            else:
                continue
            break

        for start_ci, facility in facility_col_map.items():
            for offset, sub_name in enumerate(sub_cols):
                ci = start_ci + offset
                if ci >= len(ws.columns):
                    continue
                val = ws.iloc[ri, ci]
                try:
                    val = int(float(val))
                    if val >= 0:
                        records.append({
                            'year': year,
                            'hour': hour,
                            'direction': direction,
                            'section': section,
                            'sector': sector,
                            'facility': facility,
                            'measure': sub_name,
                            'value': val,
                        })
                except (ValueError, TypeError):
                    pass

    return records


def load_appiii_detail(
    year: int,
    year_dir: Path,
    section: str,
    sector: str,
    direction: str,
) -> list[dict]:
    """Load an AppendixIII detail sheet for a specific section/sector/direction."""
    file_pattern = APPIII_SECTIONS[section]['file_pattern']
    xl_path = find_excel(year_dir, file_pattern)
    if xl_path is None:
        raise FileNotFoundError(f"No AppendixIII Section {section} file found for {year}")

    cfg = APPIII_DETAIL_SHEETS[section][sector]
    sub_cols = cfg['sub_cols']
    header_hint = cfg['header_row_hint']

    if year >= 2017:
        sheets_cfg = cfg['sheets_2017']
        dir_idx = 0 if direction == 'entering' else 1
        sheet_names = sheets_cfg[dir_idx]
        if isinstance(sheet_names, str):
            sheet_names = [sheet_names]
    else:
        sheet_names = [cfg['sheets_pre2017']]

    all_records = []
    for sheet in sheet_names:
        ws = read_excel(xl_path, sheet_name=sheet, header=None)

        # For pre-2017 combined sheets, handle direction
        if year < 2017 and direction == 'leaving':
            # Try stacked layout first (outbound below inbound)
            out_start_row = None
            out_start_col = None
            for ri in range(len(ws)):
                for ci in range(len(ws.columns)):
                    cell = str(ws.iloc[ri, ci]).upper() if not isna(ws.iloc[ri, ci]) else ''
                    if 'OUTBOUND' in cell:
                        if ci < 5:
                            # Stacked: outbound section starts at this row
                            out_start_row = ri
                        else:
                            # Side-by-side: outbound in right half
                            out_start_col = ci
                        break
                if out_start_row is not None or out_start_col is not None:
                    break
            if out_start_row is not None:
                ws = ws.iloc[out_start_row:].reset_index(drop=True)
            elif out_start_col is not None:
                # Shift columns: drop left half, keep right half
                # Find the HOURS column in the right half
                hours_col = None
                for ci in range(out_start_col - 2, out_start_col + 3):
                    for ri in range(min(10, len(ws))):
                        cell = str(ws.iloc[ri, ci]).strip().upper() if ci < len(ws.columns) and not isna(ws.iloc[ri, ci]) else ''
                        if cell == 'HOURS':
                            hours_col = ci
                            break
                    if hours_col is not None:
                        break
                if hours_col is not None:
                    ws = ws.iloc[:, hours_col:].reset_index(drop=True)
                    ws.columns = list(range(len(ws.columns)))
                else:
                    raise ValueError(f"Could not find HOURS column for outbound in {sheet} for {year}")
            else:
                raise ValueError(f"Could not find OUTBOUND section in {sheet} for {year}")

        records = parse_detail_sheet(ws, year, direction, section, sector, sub_cols, header_hint)
        all_records.extend(records)

    return all_records


# --- Section A bus detail: corridor → operator → BUSES/PSGRS ---

SECTION_A_DETAIL = {
    '60th_street': {
        'sheets_2017': (['60th-In-bound_1', '60th-In-bound_2'],
                        ['60th-Out-bound_1', '60th-Out-bound_2']),
        'sheets_pre2017': '60th Street',
    },
    'brooklyn': {
        'sheets_2017': ('Brooklyn-In-bound', 'Brooklyn-Out-bound'),
        'sheets_pre2017': 'Brooklyn',
    },
    'queens': {
        'sheets_2017': ('Queens-In-bound', 'Queens-Out-bound'),
        'sheets_pre2017': 'Queens',
    },
    'nj': {
        'sheets_2017': ('New_Jersey-Inbound', 'New Jersey-Outbound'),
        'sheets_pre2017': 'New Jersey',
    },
    'express': {
        'sheets_2017': ('Express_Bus_In-bound', 'Express_Bus-Out-bound'),
        'sheets_pre2017': 'Express',
    },
}


def parse_bus_detail_sheet(ws, year: int, direction: str, sector: str) -> list[dict]:
    """Parse a Section A bus detail sheet with corridor→operator→BUSES/PSGRS headers.

    Finds the BUSES/PSGRS row, maps corridor and operator names from rows above,
    then extracts 24 hours of buses + passengers data.
    """
    # Find BUSES/PSGRS sub-header row
    buses_ri = None
    for ri in range(min(15, len(ws))):
        for ci in range(1, len(ws.columns)):
            cell = str(ws.iloc[ri, ci]).strip().upper() if not isna(ws.iloc[ri, ci]) else ''
            if cell in ('BUSES', 'BUS'):
                buses_ri = ri
                break
        if buses_ri is not None:
            break
    if buses_ri is None:
        raise ValueError("Could not find BUSES sub-header row")

    # Map BUSES columns — each pair is (BUSES, PSGRS)
    bus_cols: list[int] = []
    for ci in range(1, len(ws.columns)):
        cell = str(ws.iloc[buses_ri, ci]).strip().upper() if not isna(ws.iloc[buses_ri, ci]) else ''
        if cell in ('BUSES', 'BUS'):
            bus_cols.append(ci)

    # Get corridor names from 1-3 rows above buses_ri
    # and operator names from the row just above buses_ri
    corridor_map: dict[int, str] = {}  # col -> corridor name
    operator_map: dict[int, str] = {}  # col -> operator name

    # Scan rows above for corridor and operator names
    for ri in range(max(0, buses_ri - 3), buses_ri):
        for ci in bus_cols:
            cell = ws.iloc[ri, ci]
            if isna(cell):
                continue
            cell_str = str(cell).strip()
            if not cell_str or cell_str.upper() in ('HOURS', 'NAN'):
                continue
            # Operator row is typically buses_ri - 1
            if ri == buses_ri - 1:
                operator_map[ci] = cell_str
            else:
                corridor_map[ci] = cell_str

    # Forward-fill corridor names (corridor spans multiple operator columns)
    sorted_cols = sorted(bus_cols)
    last_corridor = None
    for ci in sorted_cols:
        if ci in corridor_map:
            last_corridor = corridor_map[ci]
        elif last_corridor is not None:
            corridor_map[ci] = last_corridor

    # Find data start
    data_start = None
    for ri in range(buses_ri + 1, min(buses_ri + 4, len(ws))):
        for ci in range(min(3, len(ws.columns))):
            val = ws.iloc[ri, ci]
            if not isna(val) and parse_hour(str(val)) is not None:
                data_start = ri
                break
        if data_start is not None:
            break
    if data_start is None:
        raise ValueError("Could not find data rows in bus detail sheet")

    records = []
    for ri in range(data_start, len(ws)):
        hour = None
        for ci in range(min(3, len(ws.columns))):
            val = ws.iloc[ri, ci]
            if not isna(val):
                hour = parse_hour(str(val))
                if hour is not None:
                    break
        if hour is None:
            for ci in range(min(3, len(ws.columns))):
                cell = str(ws.iloc[ri, ci]).upper() if not isna(ws.iloc[ri, ci]) else ''
                if 'TOTAL' in cell:
                    break
            else:
                continue
            break

        for bus_ci in bus_cols:
            psgr_ci = bus_ci + 1
            corridor = corridor_map.get(bus_ci, '')
            operator = operator_map.get(bus_ci, '')

            # Skip TOTAL columns
            if 'TOTAL' in corridor.upper() or 'ALL' in corridor.upper():
                continue
            if 'TOTAL' in operator.upper() or 'ALL' in operator.upper():
                continue

            # Build facility name from corridor + operator
            corridor_clean = normalize_facility_name(corridor) if corridor else ''
            operator_clean = operator.strip() if operator else ''
            if corridor_clean and operator_clean:
                facility = f"{corridor_clean} / {operator_clean}"
            elif corridor_clean:
                facility = corridor_clean
            elif operator_clean:
                facility = operator_clean
            else:
                continue

            for measure, ci in [('buses', bus_ci), ('passengers', psgr_ci)]:
                if ci >= len(ws.columns):
                    continue
                val = ws.iloc[ri, ci]
                try:
                    val = int(float(val))
                    if val >= 0:
                        records.append({
                            'year': year,
                            'hour': hour,
                            'direction': direction,
                            'section': 'A',
                            'sector': sector,
                            'facility': facility,
                            'measure': measure,
                            'value': val,
                        })
                except (ValueError, TypeError):
                    pass

    return records


def load_section_a_detail(
    year: int,
    year_dir: Path,
    sector: str,
    direction: str,
) -> list[dict]:
    """Load Section A bus detail for a specific sector/direction."""
    xl_path = find_excel(year_dir, r'SectionA')
    if xl_path is None:
        raise FileNotFoundError(f"No AppendixIII Section A file found for {year}")

    cfg = SECTION_A_DETAIL[sector]

    if year >= 2017:
        dir_idx = 0 if direction == 'entering' else 1
        sheet_names = cfg['sheets_2017'][dir_idx]
        if isinstance(sheet_names, str):
            sheet_names = [sheet_names]
    else:
        sheet_names = [cfg['sheets_pre2017']]

    all_records = []
    for sheet in sheet_names:
        ws = read_excel(xl_path, sheet_name=sheet, header=None)

        if year < 2017 and direction == 'leaving':
            # Handle stacked or side-by-side outbound
            out_start_row = None
            out_start_col = None
            for ri in range(len(ws)):
                for ci in range(len(ws.columns)):
                    cell = str(ws.iloc[ri, ci]).upper() if not isna(ws.iloc[ri, ci]) else ''
                    if 'OUTBOUND' in cell:
                        if ci < 5:
                            out_start_row = ri
                        else:
                            out_start_col = ci
                        break
                if out_start_row is not None or out_start_col is not None:
                    break
            if out_start_row is not None:
                ws = ws.iloc[out_start_row:].reset_index(drop=True)
            elif out_start_col is not None:
                hours_col = None
                for ci in range(out_start_col - 2, out_start_col + 3):
                    for ri in range(min(10, len(ws))):
                        cell = str(ws.iloc[ri, ci]).strip().upper() if 0 <= ci < len(ws.columns) and not isna(ws.iloc[ri, ci]) else ''
                        if cell == 'HOURS':
                            hours_col = ci
                            break
                    if hours_col is not None:
                        break
                if hours_col is not None:
                    ws = ws.iloc[:, hours_col:].reset_index(drop=True)
                    ws.columns = list(range(len(ws.columns)))
                else:
                    raise ValueError(f"Could not find HOURS column for outbound in {sheet} for {year}")
            else:
                raise ValueError(f"Could not find OUTBOUND section in {sheet} for {year}")

        records = parse_bus_detail_sheet(ws, year, direction, sector)
        all_records.extend(records)

    return all_records


def load_peak_accumulation(year: int, year_dir: Path, table_b: str, measure: str):
    """Parse Tables 21B/22B/23B: peak accumulation historical series.

    Returns records with year, peak_accumulation, and peak_hour fields.
    measure is 'total_persons', 'transit_passengers', or 'motor_vehicles'.
    """
    xl_path = find_excel(year_dir, r"AppendixII_")
    if xl_path is None:
        raise FileNotFoundError(f"No AppendixII file found for {year} in {year_dir}")

    num = re.search(r'(\d+)', table_b).group(1)
    if year < 2017:
        sheet = f'Table{num}A-{num}B'
    else:
        sheet = table_b

    ws = read_excel(xl_path, sheet_name=sheet, header=None)

    # For combined sheets, find where the B table starts
    if year < 2017:
        b_start = None
        for ri in range(len(ws)):
            for ci in range(min(5, len(ws.columns))):
                cell = str(ws.iloc[ri, ci]).upper() if not isna(ws.iloc[ri, ci]) else ''
                if f'TABLE {num}B' in cell or f'TABLE{num}B' in cell:
                    b_start = ri
                    break
            if b_start is not None:
                break
        if b_start is None:
            raise ValueError(f"Could not find {table_b} boundary in combined sheet for {year}")
        ws = ws.iloc[b_start:].reset_index(drop=True)

    # Find the YEAR header row and column positions
    year_col = None
    accum_col = None
    hour_col = None
    header_ri = None
    for ri in range(min(15, len(ws))):
        for ci in range(len(ws.columns)):
            cell = str(ws.iloc[ri, ci]).strip().upper() if not isna(ws.iloc[ri, ci]) else ''
            if cell == 'YEAR':
                year_col = ci
                header_ri = ri
            elif 'ACCUMULATION' in cell:
                accum_col = ci
            elif cell == 'AT':
                hour_col = ci

    if year_col is None or accum_col is None:
        raise ValueError(f"Could not find YEAR/ACCUMULATION headers in {table_b} for {year}")

    records = []
    for ri in range(header_ri + 1, len(ws)):
        yr_val = ws.iloc[ri, year_col]
        try:
            yr = int(yr_val)
            if not (1970 <= yr <= 2030):
                continue
        except (ValueError, TypeError):
            continue

        accum_val = ws.iloc[ri, accum_col]
        try:
            accum = round(float(accum_val))
        except (ValueError, TypeError):
            continue

        peak_hour = None
        if hour_col is not None:
            h_val = ws.iloc[ri, hour_col]
            if not isna(h_val):
                peak_hour = parse_hour(str(h_val))

        rec = {
            'year': yr,
            'category': measure,
            'peak_accumulation': accum,
        }
        if peak_hour is not None:
            rec['peak_hour'] = peak_hour
        records.append(rec)

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

    # Extract all-sector vehicle counts (Tables 16-17)
    all_vehicles = []
    for table, direction in [('Table16', 'entering'), ('Table17', 'leaving')]:
        for year, year_dir in sorted(years.items()):
            try:
                records = load_all_sector_table(year, year_dir, table, direction, 'Auto', 'Bus')
                all_vehicles.extend(records)
                print(f"  {table} {year}: {len(records)} records")
            except Exception as e:
                print(f"  {table} {year}: ERROR - {e}")

    vehicles_path = join(output_dir, 'vehicles.json')
    with open(vehicles_path, 'w') as f:
        json.dump(all_vehicles, f, indent=2)
        f.write('\n')
    print(f"Wrote {len(all_vehicles)} vehicle records to {vehicles_path}")

    # Extract all-sector bus passengers (Tables 18-19)
    all_bus = []
    for table, direction in [('Table18', 'entering'), ('Table19', 'leaving')]:
        for year, year_dir in sorted(years.items()):
            try:
                records = load_all_sector_table(year, year_dir, table, direction, 'Local Bus', 'Express Bus')
                all_bus.extend(records)
                print(f"  {table} {year}: {len(records)} records")
            except Exception as e:
                print(f"  {table} {year}: ERROR - {e}")

    bus_path = join(output_dir, 'bus_passengers.json')
    with open(bus_path, 'w') as f:
        json.dump(all_bus, f, indent=2)
        f.write('\n')
    print(f"Wrote {len(all_bus)} bus passenger records to {bus_path}")

    # Extract hourly data (Tables 21A-23A, 24-27)
    all_hourly = []

    # Tables 21A-23A: 3-year rolling totals
    totals_tables = [
        ('Table21A', 'total_persons'),
        ('Table22A', 'transit_passengers'),
        ('Table23A', 'motor_vehicles'),
    ]
    seen_totals: set[tuple] = set()  # deduplicate overlapping 3-year windows
    for table, measure in totals_tables:
        for year, year_dir in sorted(years.items()):
            try:
                records = load_hourly_totals(year, year_dir, table, measure)
                # Deduplicate: prefer data from the most recent publication
                new_records = []
                for r in records:
                    key = (r['year'], r['hour'], r['direction'], r['category'], r['key'])
                    if key not in seen_totals:
                        seen_totals.add(key)
                        new_records.append(r)
                all_hourly.extend(new_records)
                print(f"  {table} {year}: {len(records)} records ({len(new_records)} new)")
            except Exception as e:
                print(f"  {table} {year}: ERROR - {e}")

    # Tables 24-25: hourly by mode (one year per file)
    for table, direction in [('Table24', 'entering'), ('Table25', 'leaving')]:
        for year, year_dir in sorted(years.items()):
            try:
                records = load_hourly_by_mode(year, year_dir, table, direction)
                all_hourly.extend(records)
                print(f"  {table} {year}: {len(records)} records")
            except Exception as e:
                print(f"  {table} {year}: ERROR - {e}")

    # Tables 26-27: hourly by sector (one year per file)
    for table, direction in [('Table26', 'entering'), ('Table27', 'leaving')]:
        for year, year_dir in sorted(years.items()):
            try:
                records = load_hourly_by_sector(year, year_dir, table, direction)
                all_hourly.extend(records)
                print(f"  {table} {year}: {len(records)} records")
            except Exception as e:
                print(f"  {table} {year}: ERROR - {e}")

    hourly_path = join(output_dir, 'hourly.json')
    with open(hourly_path, 'w') as f:
        json.dump(all_hourly, f, indent=2)
        f.write('\n')
    print(f"Wrote {len(all_hourly)} hourly records to {hourly_path}")

    # Extract peak accumulation (Tables 21B-23B)
    # Use oldest available file for deepest history, then newer files for recent years
    all_peak = []
    seen_peak: set[tuple] = set()
    accum_tables = [
        ('Table21B', 'total_persons'),
        ('Table22B', 'transit_passengers'),
        ('Table23B', 'motor_vehicles'),
    ]
    for table, measure in accum_tables:
        for year, year_dir in sorted(years.items()):
            try:
                records = load_peak_accumulation(year, year_dir, table, measure)
                new_records = []
                for r in records:
                    key = (r['year'], r['category'])
                    if key not in seen_peak:
                        seen_peak.add(key)
                        new_records.append(r)
                all_peak.extend(new_records)
                print(f"  {table} {year}: {len(records)} records ({len(new_records)} new)")
            except Exception as e:
                print(f"  {table} {year}: ERROR - {e}")

    peak_path = join(output_dir, 'peak_accumulation.json')
    with open(peak_path, 'w') as f:
        json.dump(all_peak, f, indent=2)
        f.write('\n')
    print(f"Wrote {len(all_peak)} peak accumulation records to {peak_path}")

    # Extract AppendixIII summary data (Sections A, B, C, F)
    all_appiii = []
    for section in ('A', 'B', 'C', 'F'):
        for direction in ('entering', 'leaving'):
            for year, year_dir in sorted(years.items()):
                try:
                    records = load_appiii_summary(year, year_dir, section, direction)
                    all_appiii.extend(records)
                    print(f"  III-{section} {direction} {year}: {len(records)} records")
                except Exception as e:
                    print(f"  III-{section} {direction} {year}: ERROR - {e}")

    appiii_path = join(output_dir, 'appendix_iii.json')
    with open(appiii_path, 'w') as f:
        json.dump(all_appiii, f, indent=2)
        f.write('\n')
    print(f"Wrote {len(all_appiii)} AppendixIII records to {appiii_path}")

    # Extract AppendixIII detail data (per-facility/line)
    all_detail = []
    for section, sectors in APPIII_DETAIL_SHEETS.items():
        for sector in sectors:
            for direction in ('entering', 'leaving'):
                for year, year_dir in sorted(years.items()):
                    try:
                        records = load_appiii_detail(year, year_dir, section, sector, direction)
                        all_detail.extend(records)
                        print(f"  III-{section}/{sector} {direction} {year}: {len(records)} records")
                    except Exception as e:
                        print(f"  III-{section}/{sector} {direction} {year}: ERROR - {e}")

    # Section A bus detail (corridor/operator)
    for sector in SECTION_A_DETAIL:
        for direction in ('entering', 'leaving'):
            for year, year_dir in sorted(years.items()):
                try:
                    records = load_section_a_detail(year, year_dir, sector, direction)
                    all_detail.extend(records)
                    print(f"  III-A/{sector} {direction} {year}: {len(records)} records")
                except Exception as e:
                    print(f"  III-A/{sector} {direction} {year}: ERROR - {e}")

    detail_path = join(output_dir, 'appendix_iii_detail.json')
    with open(detail_path, 'w') as f:
        json.dump(all_detail, f, indent=2)
        f.write('\n')
    print(f"Wrote {len(all_detail)} AppendixIII detail records to {detail_path}")


if __name__ == '__main__':
    cli()
