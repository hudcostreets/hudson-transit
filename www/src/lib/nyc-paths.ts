// Geographic paths for major CBD entry points across all sectors.
// Each entry: NJ approach / non-CBD origin → mid-crossing → CBD entry.
//
// MVP scope: one representative path per (sector, mode-group). Subway lines
// are aggregated into a single "transit tunnel" path per sector;
// individual line geometry is left for v2.

import type { LatLon } from 'geo-sankey'

export type EntryId =
  // West (NJ) — reuses existing GeoSankey paths
  | 'nj-lincoln' | 'nj-holland' | 'nj-amtrak' | 'nj-path-up' | 'nj-path-dn' | 'nj-ferry'
  // East (Queens)
  | 'queens-queensboro' | 'queens-qmt' | 'queens-subway' | 'queens-lirr'
  // South (Brooklyn)
  | 'brooklyn-bb' | 'brooklyn-mb' | 'brooklyn-wb' | 'brooklyn-battery' | 'brooklyn-subway'
  // South (Staten Island)
  | 'si-ferry'
  // North (60th St) — avenues + crosstown subways crossing 60th St
  | '60th-w' | '60th-mid' | '60th-e' | '60th-subway-w' | '60th-subway-mid' | '60th-subway-e'

// Each path runs from the non-CBD origin → CBD entry point. The trailing
// point is always the "arrow tip" — the closer to Manhattan CBD, the better.
export const ENTRY_PATHS: Record<EntryId, LatLon[]> = {
  // ── NJ — existing GeoSankey paths kept verbatim ─────────────────────────
  'nj-lincoln': [
    [40.7710, -74.0370],
    [40.7664, -74.0227],
    [40.7625, -74.0110],
    [40.7587, -73.9991],
  ],
  'nj-holland': [
    [40.7297, -74.0361],
    [40.7278, -74.0200],
    [40.7255, -74.0070],
  ],
  'nj-amtrak': [
    [40.7580, -74.0350],
    [40.7555, -74.0170],
    [40.7510, -74.0015],
  ],
  'nj-path-up': [
    [40.7355, -74.0298],
    [40.7345, -74.0170],
    [40.7337, -74.0068],
  ],
  'nj-path-dn': [
    [40.7162, -74.0330],
    [40.7140, -74.0230],
    [40.7116, -74.0123],
  ],
  'nj-ferry': [
    [40.7505, -74.0241],  // Hoboken 14th (rep)
    [40.7505, -74.0150],
    [40.7510, -74.0070],
    [40.7510, -73.9991],  // MT 39th-ish
  ],

  // ── Queens (East) ───────────────────────────────────────────────────────
  // Ed Koch Queensboro Bridge: LIC → Manhattan around 60th St / 2nd Ave
  'queens-queensboro': [
    [40.7560, -73.9400],  // LIC approach
    [40.7570, -73.9550],  // mid-river
    [40.7600, -73.9665],  // Manhattan landing (60th & 2nd)
  ],
  // Queens-Midtown Tunnel: LIC → 37th St / 2nd Ave
  'queens-qmt': [
    [40.7470, -73.9430],  // LIC portal
    [40.7470, -73.9580],  // mid-river
    [40.7466, -73.9710],  // Manhattan portal
  ],
  // Subway aggregate — E/F/M/N/Q/R/W/7 all enter via tunnels around 53rd-60th Sts
  'queens-subway': [
    [40.7497, -73.9396],  // Queens Plaza
    [40.7560, -73.9560],  // mid-river (north tunnel set)
    [40.7610, -73.9760],  // Lex/53rd
  ],
  // LIRR via Steinway / 63rd St tubes → Penn / GCT
  'queens-lirr': [
    [40.7445, -73.9370],  // Hunters Pt LIRR
    [40.7530, -73.9620],
    [40.7560, -73.9870],  // GCT/Penn area
  ],

  // ── Brooklyn (South) ────────────────────────────────────────────────────
  'brooklyn-bb': [
    [40.7037, -73.9904],  // Brooklyn approach
    [40.7080, -73.9970],
    [40.7115, -74.0030],  // Park Row / City Hall
  ],
  'brooklyn-mb': [
    [40.6989, -73.9889],  // Brooklyn approach
    [40.7080, -73.9925],
    [40.7160, -73.9970],  // Canal St
  ],
  'brooklyn-wb': [
    [40.7140, -73.9650],
    [40.7150, -73.9760],
    [40.7155, -73.9870],  // Delancey
  ],
  // Hugh L. Carey (Battery) Tunnel
  'brooklyn-battery': [
    [40.6915, -74.0173],  // Brooklyn portal
    [40.6960, -74.0150],
    [40.7008, -74.0144],  // Battery portal
  ],
  // Subway aggregate (Lex/4-5, 7th Ave/2-3, B'way/N-Q-R, 6th/B-D-F-M, 8th/A-C-E)
  // Use one composite path through the East River subway corridor.
  'brooklyn-subway': [
    [40.6912, -73.9870],  // Atlantic-Pacific area
    [40.7000, -73.9920],
    [40.7100, -73.9990],  // Chambers / WTC area
  ],

  // ── Staten Island ───────────────────────────────────────────────────────
  'si-ferry': [
    [40.6438, -74.0735],  // St George Terminal
    [40.6700, -74.0420],  // mid-harbor
    [40.7012, -74.0140],  // Whitehall Terminal
  ],

  // ── 60th Street (North) ─────────────────────────────────────────────────
  // Three vertical corridors crossing 60th into the CBD. Approximate
  // representative midpoints; ribbons run N → S from ~70th St → ~57th St.
  '60th-w': [
    [40.7720, -73.9870],  // ~70th & WSH/Bway
    [40.7680, -73.9870],
    [40.7610, -73.9860],  // ~58th & Bway
  ],
  '60th-mid': [
    [40.7720, -73.9740],  // ~70th & Park
    [40.7680, -73.9740],
    [40.7610, -73.9750],  // ~58th & Park
  ],
  '60th-e': [
    [40.7720, -73.9620],  // ~70th & 1st Ave
    [40.7680, -73.9620],
    [40.7610, -73.9630],  // ~58th & 1st Ave
  ],
  // Subway lines crossing 60th (1/2/3, 4/5/6, B/D/F/M, N/Q/R/W). Aggregate
  // into the same three corridors; subways mostly follow under the
  // avenue grid.
  '60th-subway-w': [
    [40.7720, -73.9805],
    [40.7670, -73.9810],
    [40.7610, -73.9815],
  ],
  '60th-subway-mid': [
    [40.7720, -73.9700],
    [40.7670, -73.9705],
    [40.7610, -73.9715],
  ],
  '60th-subway-e': [
    [40.7720, -73.9582],
    [40.7670, -73.9590],
    [40.7610, -73.9600],
  ],
}

// Mode-mapping tables. Each (sector, mode) cell points at the entry path(s)
// that carry that flow. Multiple paths means split the flow evenly across
// them (rough but readable; per-facility shares would need extraction work).

import type { NycMode, Sector } from './nyc-types'

export type SectorModeKey = `${Sector}|${NycMode}`

export const SECTOR_MODE_PATHS: Partial<Record<SectorModeKey, EntryId[]>> = {
  // NJ
  'nj|Auto':   ['nj-lincoln', 'nj-holland'],
  'nj|Bus':    ['nj-lincoln', 'nj-holland'],
  'nj|Subway': ['nj-path-up', 'nj-path-dn'],
  'nj|Rail':   ['nj-amtrak'],
  'nj|Ferry':  ['nj-ferry'],

  // Queens
  'queens|Auto':   ['queens-queensboro', 'queens-qmt'],
  'queens|Bus':    ['queens-queensboro', 'queens-qmt'],
  'queens|Subway': ['queens-subway'],
  'queens|Rail':   ['queens-lirr'],
  // Queens ferry minimal — fold under brooklyn-subway visually for v1
  'queens|Ferry':  ['queens-subway'],

  // Brooklyn
  'brooklyn|Auto':   ['brooklyn-bb', 'brooklyn-mb', 'brooklyn-wb', 'brooklyn-battery'],
  'brooklyn|Bus':    ['brooklyn-bb', 'brooklyn-mb', 'brooklyn-wb'],
  'brooklyn|Subway': ['brooklyn-subway'],
  // No LIRR Atlantic branch into CBD for v1
  'brooklyn|Ferry':  ['brooklyn-subway'],

  // Staten Island — only ferry registers
  'staten_island|Ferry': ['si-ferry'],

  // 60th Street — three avenue corridors
  '60th_street|Auto':   ['60th-w', '60th-mid', '60th-e'],
  '60th_street|Bus':    ['60th-w', '60th-mid', '60th-e'],
  '60th_street|Subway': ['60th-subway-w', '60th-subway-mid', '60th-subway-e'],
  '60th_street|Rail':   ['60th-mid'],  // Metro-North down Park Ave
  '60th_street|Ferry':  ['60th-e'],     // East River ferry minor
}
