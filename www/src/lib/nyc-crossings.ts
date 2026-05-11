// Per-crossing registry for the NYC-wide CBD-flow map (`/nyc`).
//
// Each crossing represents one *physical* corridor into the CBD: a bridge,
// road tunnel, subway tube, rail tunnel, ferry route, or 60th-Street avenue.
// Lines that share trackage (e.g. 4/5 in the Joralemon tube; 2/3 in Clark St;
// A/C in Cranberry St) get a single crossing — the source data already pairs
// them, and rendering them as one ribbon faithfully reflects the physical
// right-of-way.
//
// `path` runs from the outer-borough source to the Manhattan terminus; the
// renderer reverses for `direction === 'leaving'`.

import type { LatLon } from 'geo-sankey'
import type { NycMode, Sector } from './nyc-types'

export type CrossingId =
  // ── NJ ────────────────────────────────────────────────────────────────
  | 'nj-lincoln' | 'nj-holland' | 'nj-amtrak' | 'nj-path-up' | 'nj-path-dn' | 'nj-ferry'

  // ── Brooklyn ──────────────────────────────────────────────────────────
  // Bridges + Battery Tunnel (autos / buses; Mh Br + Wmsbg Br also subway)
  | 'bk-bb' | 'bk-mb' | 'bk-wb' | 'bk-battery'
  // East-River subway tubes (one per tube; lines that share are a single ribbon)
  | 'bk-cranberry'   // A/C
  | 'bk-clark'       // 2/3
  | 'bk-joralemon'   // 4/5
  | 'bk-rutgers'     // F
  | 'bk-canarsie'    // L
  | 'bk-montague'    // N/R local
  // Manhattan-Bridge subway: data splits these into express (B/D) and local (N/Q)
  | 'bk-mb-bd'       // B/D — north tracks, 6th-Ave-bound
  | 'bk-mb-nq'       // N/Q — south tracks, Bway-bound

  // ── Queens ────────────────────────────────────────────────────────────
  | 'qn-queensboro' | 'qn-qmt'
  | 'qn-steinway'    // 7
  | 'qn-53'          // E/M
  | 'qn-63'          // F
  | 'qn-60'          // N/Q/R
  | 'qn-amtrak'      // Amtrak Empire Service (the only rail facility broken out in detail data — ~500/hr)
  | 'qn-lirr'        // LIRR (synthetic: queens Section C residual after subtracting qn-amtrak)

  // ── Staten Island ─────────────────────────────────────────────────────
  | 'si-ferry'

  // ── 60th Street (vertical paths, all running ~N→S) ────────────────────
  // Roads (one per avenue actually represented in vehicles.json)
  | '60-fdr' | '60-york' | '60-1av' | '60-2av' | '60-3av' | '60-lex'
  | '60-park' | '60-mad' | '60-5av' | '60-bway' | '60-cols' | '60-amst'
  | '60-westend' | '60-wsh' | '60-cpw'
  // Subway corridors crossing 60th (one per facility group from detail data)
  | '60-sub-7av-loc'   // 1/2 local (Bway/7-Ave local across CPS)
  | '60-sub-7av-exp'   // 2/3 express (7th-Ave express)
  | '60-sub-lex-loc'   // 4/6 local
  | '60-sub-lex-exp'   // 4/5 express
  | '60-sub-8av-loc'   // A/B/C local (CPW)
  | '60-sub-8av-exp'   // A/D express
  | '60-sub-bway-loc'  // Q/W local (Bway)
  // Merged-trunk ribbons (used when subwayGrouping="merged"; each combines
  // its express+local pair from above into a single ribbon)
  | '60-sub-8av'       // 8 Ave trunk: A/B/C/D
  | '60-sub-7av'       // 7 Ave trunk: 1/2/3
  | '60-sub-lex'       // Lex trunk: 4/5/6
  // Rail (Metro-North down Park Ave to GCT)
  | '60-mnr-hudson' | '60-mnr-harlem' | '60-mnr-newhaven' | '60-mnr-empire'

export interface CrossingDef {
  id: CrossingId
  name: string                  // human-readable
  sector: Sector
  /** modes that flow through this crossing */
  modes: NycMode[]
  /** outer-borough → Manhattan terminus (reversed for `leaving`) */
  path: LatLon[]
}

// ── 60th-St line + avenue grid ─────────────────────────────────────────
// Manhattan's grid is rotated ~29° west of due north, so southbound
// avenues run at bearing ~209° (SSW). 60th Street itself doesn't lie
// on a perfectly straight line in lat/lon — it has subtly different
// slopes east vs. west of Central Park. Rather than approximate with
// a single slope, each avenue's exact 60th-St crossing is specified
// below as an explicit (lat, lon).
export const SIXTIETH_WEST: LatLon = [40.7716, -74.0017]   // 60th & WSH (Hudson)
export const SIXTIETH_EAST: LatLon = [40.7611, -73.9485]   // 60th near FDR/East River

// Avenue path is built around its real 60th-St crossing point:
// extends ~0.0034° lat north and ~0.0028° lat south, sheared SSW per
// the grid rotation. AVE_SHEAR (Δlon/Δlat going north) ≈ tan(35°)
// since true Manhattan-grid rotation at this latitude produces a
// 0.68–0.73 lat/lon ratio after accounting for the cos(lat) factor.
const AVE_NORTH_DLAT = 0.0034
const AVE_SOUTH_DLAT = 0.0028
const AVE_SHEAR = 0.70            // Δlon / Δlat for southbound avenues

/** Build a 3-point avenue path through a specified 60th-St crossing. */
const ave = (lat60: number, lon60: number, opts?: { topDLat?: number; tipDLat?: number }): LatLon[] => {
  const dn = opts?.topDLat ?? AVE_NORTH_DLAT
  const ds = opts?.tipDLat ?? AVE_SOUTH_DLAT
  return [
    [lat60 + dn, lon60 + AVE_SHEAR * dn],   // north end (east of mid)
    [lat60,      lon60],                    // crosses 60th St
    [lat60 - ds, lon60 - AVE_SHEAR * ds],   // south end (west of mid)
  ]
}

export const CROSSINGS: Record<CrossingId, CrossingDef> = {
  // ── NJ — kept verbatim from v1 ─────────────────────────────────────────
  'nj-lincoln': {
    id: 'nj-lincoln', name: 'Lincoln Tunnel', sector: 'nj', modes: ['Auto', 'Bus'],
    path: [[40.7710, -74.0370], [40.7664, -74.0227], [40.7625, -74.0110], [40.7587, -73.9991]],
  },
  'nj-holland': {
    id: 'nj-holland', name: 'Holland Tunnel', sector: 'nj', modes: ['Auto', 'Bus'],
    path: [[40.7297, -74.0361], [40.7278, -74.0200], [40.7255, -74.0070]],
  },
  'nj-amtrak': {
    id: 'nj-amtrak', name: 'NEC / Penn Station', sector: 'nj', modes: ['Rail'],
    path: [[40.7580, -74.0350], [40.7555, -74.0170], [40.7510, -74.0015]],
  },
  'nj-path-up': {
    id: 'nj-path-up', name: 'Uptown PATH', sector: 'nj', modes: ['Subway'],
    path: [[40.7355, -74.0298], [40.7345, -74.0170], [40.7337, -74.0068]],
  },
  'nj-path-dn': {
    id: 'nj-path-dn', name: 'Downtown PATH', sector: 'nj', modes: ['Subway'],
    path: [[40.7162, -74.0330], [40.7140, -74.0230], [40.7116, -74.0123]],
  },
  'nj-ferry': {
    id: 'nj-ferry', name: 'Hudson Ferries', sector: 'nj', modes: ['Ferry'],
    path: [[40.7505, -74.0241], [40.7505, -74.0150], [40.7510, -74.0070], [40.7510, -73.9991]],
  },

  // ── Brooklyn ────────────────────────────────────────────────────────────
  // Roads first (so labels prefer them when stacked against subways).
  'bk-bb': {
    id: 'bk-bb', name: 'Brooklyn Br', sector: 'brooklyn', modes: ['Auto'],
    path: [[40.7037, -73.9904], [40.7080, -73.9970], [40.7115, -74.0030]],
  },
  'bk-mb': {
    id: 'bk-mb', name: 'Manhattan Br', sector: 'brooklyn', modes: ['Auto', 'Bus'],
    path: [[40.6989, -73.9889], [40.7080, -73.9925], [40.7160, -73.9970]],
  },
  'bk-wb': {
    id: 'bk-wb', name: 'Williamsburg Br', sector: 'brooklyn', modes: ['Auto', 'Bus'],
    path: [[40.7140, -73.9650], [40.7150, -73.9760], [40.7155, -73.9870]],
  },
  'bk-battery': {
    id: 'bk-battery', name: 'Battery Tunnel', sector: 'brooklyn', modes: ['Auto', 'Bus'],
    path: [[40.6915, -74.0173], [40.6960, -74.0150], [40.7008, -74.0144]],
  },
  // Subway tubes (one ribbon per shared right-of-way). Each tube
  // terminates at the line's actual first major Manhattan stop so the
  // arrows fan out instead of all converging on one shore point.
  'bk-cranberry': {  // A/C → Chambers/WTC
    id: 'bk-cranberry', name: 'Cranberry · A/C', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6997, -73.9907], [40.7050, -73.9970], [40.7148, -74.0064]],
  },
  'bk-clark': {  // 2/3 → Park Pl/WTC
    id: 'bk-clark', name: 'Clark St · 2/3', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6976, -73.9930], [40.7045, -74.0030], [40.7131, -74.0086]],
  },
  'bk-joralemon': {  // 4/5 → Bowling Green
    id: 'bk-joralemon', name: 'Joralemon · 4/5', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6918, -73.9922], [40.6990, -74.0030], [40.7045, -74.0136]],
  },
  'bk-rutgers': {  // F → East Broadway
    id: 'bk-rutgers', name: 'Rutgers · F', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6997, -73.9863], [40.7080, -73.9890], [40.7137, -73.9899]],
  },
  // L's first Manhattan stop is 1st Ave/14th, well inland from the river.
  'bk-canarsie': {  // L → 1 Av/14
    id: 'bk-canarsie', name: 'Canarsie · L', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.7170, -73.9560], [40.7235, -73.9700], [40.7305, -73.9819]],
  },
  'bk-montague': {  // N/R → Whitehall
    id: 'bk-montague', name: 'Montague · N/R', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6930, -73.9920], [40.6975, -74.0050], [40.7032, -74.0133]],
  },
  // Mh Br subway: B/D ride north tracks to Bway-Lafayette via 6 Ave;
  // N/Q ride south tracks to Canal St via Broadway. Spread their endings
  // up the route they actually take so they don't share a tip.
  'bk-mb-bd': {  // B/D → Broadway-Lafayette
    id: 'bk-mb-bd', name: 'Mh Br · B/D', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6985, -73.9892], [40.7100, -73.9920], [40.7256, -73.9961]],
  },
  'bk-mb-nq': {  // N/Q → Canal St
    id: 'bk-mb-nq', name: 'Mh Br · N/Q', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6990, -73.9882], [40.7085, -73.9914], [40.7187, -73.9985]],
  },

  // ── Queens ──────────────────────────────────────────────────────────────
  'qn-queensboro': {
    id: 'qn-queensboro', name: 'Queensboro Br', sector: 'queens', modes: ['Auto', 'Bus'],
    path: [[40.7560, -73.9400], [40.7570, -73.9550], [40.7600, -73.9665]],
  },
  'qn-qmt': {
    id: 'qn-qmt', name: 'Queens-Midtown Tunnel', sector: 'queens', modes: ['Auto', 'Bus'],
    path: [[40.7470, -73.9430], [40.7470, -73.9580], [40.7466, -73.9710]],
  },
  // Queens subway tubes — terminate each at the line's actual first major
  // Manhattan stop (Grand Central for 7, Lex/53 for E/M, Lex/63 for F,
  // Lex/59 for N/Q/R) to splay them apart visually.
  'qn-steinway': {
    id: 'qn-steinway', name: 'Steinway Tube · 7', sector: 'queens', modes: ['Subway'],
    path: [[40.7427, -73.9476], [40.7510, -73.9690], [40.7527, -73.9772]],
  },
  'qn-53': {
    id: 'qn-53', name: '53rd St Tunnel · E/M', sector: 'queens', modes: ['Subway'],
    path: [[40.7474, -73.9530], [40.7530, -73.9620], [40.7575, -73.9694]],
  },
  'qn-63': {
    id: 'qn-63', name: '63rd St Tunnel · F', sector: 'queens', modes: ['Subway'],
    path: [[40.7544, -73.9416], [40.7591, -73.9531], [40.7649, -73.9658]],
  },
  'qn-60': {
    id: 'qn-60', name: '60th St Tunnel · N/Q/R', sector: 'queens', modes: ['Subway'],
    path: [[40.7506, -73.9405], [40.7565, -73.9530], [40.7625, -73.9669]],
  },
  // East River Tubes — 4 parallel tracks from Sunnyside/Hunters Point to Penn
  // Station. Both Amtrak Empire Service (broken out in detail data as "N.e.
  // Corridor") and LIRR (residual, see `buildCrossingFlows`) use them.
  // Identical paths so the two ribbons stack at the same crossing.
  'qn-amtrak': {
    id: 'qn-amtrak', name: 'Amtrak · East River Tubes', sector: 'queens', modes: ['Rail'],
    path: [[40.7445, -73.9540], [40.7488, -73.9740], [40.7506, -73.9935]],
  },
  'qn-lirr': {
    id: 'qn-lirr', name: 'LIRR · East River Tubes', sector: 'queens', modes: ['Rail'],
    path: [[40.7445, -73.9540], [40.7488, -73.9740], [40.7506, -73.9935]],
  },

  // ── Staten Island ──────────────────────────────────────────────────────
  'si-ferry': {
    id: 'si-ferry', name: 'SI Ferry', sector: 'staten_island', modes: ['Ferry'],
    path: [[40.6438, -74.0735], [40.6700, -74.0420], [40.7012, -74.0140]],
  },

  // ── 60th St — vertical paths per avenue ────────────────────────────────
  // Each path is anchored at the avenue's actual 60th-St intersection
  // (lat, lon — eyeballed from OSM/Google Maps), then projected north
  // and south along the avenue's bearing.
  '60-wsh':       { id: '60-wsh',       name: 'West Side Hwy',   sector: '60th_street', modes: ['Auto'],         path: ave(40.7716, -74.0017) },
  '60-westend':   { id: '60-westend',   name: 'West End Ave',    sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(40.7710, -73.9911) },
  '60-amst':      { id: '60-amst',      name: 'Amsterdam Ave',   sector: '60th_street', modes: ['Auto'],         path: ave(40.7703, -73.9865) },
  '60-cols':      { id: '60-cols',      name: 'Columbus Ave',    sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(40.7693, -73.9819) },
  '60-cpw':       { id: '60-cpw',       name: 'CPW',             sector: '60th_street', modes: ['Auto'],         path: ave(40.7683, -73.9784) },
  '60-bway':      { id: '60-bway',      name: 'Broadway',        sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(40.7681, -73.9820) },
  '60-5av':       { id: '60-5av',       name: 'Fifth Ave',       sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(40.7660, -73.9728) },
  '60-mad':       { id: '60-mad',       name: 'Madison Ave',     sector: '60th_street', modes: ['Auto'],         path: ave(40.7650, -73.9696) },
  '60-park':      { id: '60-park',      name: 'Park Ave',        sector: '60th_street', modes: ['Auto'],         path: ave(40.7642, -73.9665) },
  '60-lex':       { id: '60-lex',       name: 'Lexington Ave',   sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(40.7625, -73.9635) },
  '60-3av':       { id: '60-3av',       name: 'Third Ave',       sector: '60th_street', modes: ['Auto'],         path: ave(40.7617, -73.9605) },
  '60-2av':       { id: '60-2av',       name: 'Second Ave',      sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(40.7611, -73.9582) },
  '60-1av':       { id: '60-1av',       name: 'First Ave',       sector: '60th_street', modes: ['Auto'],         path: ave(40.7611, -73.9555) },
  '60-york':      { id: '60-york',      name: 'York Ave',        sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(40.7615, -73.9504) },
  '60-fdr':       { id: '60-fdr',       name: 'FDR Drive',       sector: '60th_street', modes: ['Auto'],         path: ave(40.7612, -73.9485) },

  // 60th St subway corridors (each ribbon = one express/local pair).
  // Subway paths use the corridor's 60th-St crossing (close to the
  // surface-avenue equivalent).
  '60-sub-8av-loc': { id: '60-sub-8av-loc', name: 'CPW · A/B/C', sector: '60th_street', modes: ['Subway'], path: ave(40.7686, -73.9790) },
  '60-sub-8av-exp': { id: '60-sub-8av-exp', name: 'CPW · A/D',   sector: '60th_street', modes: ['Subway'], path: ave(40.7686, -73.9786) },
  '60-sub-7av-loc': { id: '60-sub-7av-loc', name: 'Bway · 1/2',  sector: '60th_street', modes: ['Subway'], path: ave(40.7680, -73.9821) },
  '60-sub-7av-exp': { id: '60-sub-7av-exp', name: '7 Av · 2/3',  sector: '60th_street', modes: ['Subway'], path: ave(40.7680, -73.9816) },
  '60-sub-lex-loc': { id: '60-sub-lex-loc', name: 'Lex · 4/6',   sector: '60th_street', modes: ['Subway'], path: ave(40.7625, -73.9640) },
  '60-sub-lex-exp': { id: '60-sub-lex-exp', name: 'Lex · 4/5',   sector: '60th_street', modes: ['Subway'], path: ave(40.7625, -73.9635) },
  '60-sub-bway-loc':{ id: '60-sub-bway-loc',name: 'Bway · Q/W',  sector: '60th_street', modes: ['Subway'], path: ave(40.7682, -73.9800) },
  // Merged-trunk ribbons placed on the actual subway corridors:
  //   IND 8 Ave (A/B/C/D) under CPW/8 Ave
  //   IRT 7 Ave (1/2/3) under Bway/Columbus Circle (west of CPW)
  //   IRT Lex   (4/5/6) under Lex
  '60-sub-8av':    { id: '60-sub-8av',    name: '8 Ave · A/B/C/D', sector: '60th_street', modes: ['Subway'], path: ave(40.7686, -73.9788) },
  '60-sub-7av':    { id: '60-sub-7av',    name: '7 Ave · 1/2/3',   sector: '60th_street', modes: ['Subway'], path: ave(40.7680, -73.9818) },
  '60-sub-lex':    { id: '60-sub-lex',    name: 'Lex · 4/5/6',     sector: '60th_street', modes: ['Subway'], path: ave(40.7625, -73.9637) },

  // Metro-North down Park Ave (all 3 main lines + Empire Service)
  '60-mnr-hudson':   { id: '60-mnr-hudson',   name: 'MNR · Hudson Line',     sector: '60th_street', modes: ['Rail'], path: ave(40.7642, -73.9672) },
  '60-mnr-harlem':   { id: '60-mnr-harlem',   name: 'MNR · Harlem Line',     sector: '60th_street', modes: ['Rail'], path: ave(40.7642, -73.9667) },
  '60-mnr-newhaven': { id: '60-mnr-newhaven', name: 'MNR · New Haven Line',  sector: '60th_street', modes: ['Rail'], path: ave(40.7642, -73.9662) },
  '60-mnr-empire':   { id: '60-mnr-empire',   name: 'Empire Service',         sector: '60th_street', modes: ['Rail'], path: ave(40.7642, -73.9677) },
}

// ── Mappings: source data → CrossingId ───────────────────────────────────

/** Map (sector, crossing) keys from `vehicles.json` to a CrossingId. */
export const VEHICLE_TO_CROSSING: Record<string, CrossingId> = {
  // NJ
  'nj|Lincoln Tunnel': 'nj-lincoln',
  'nj|Holland Tunnel': 'nj-holland',
  // Brooklyn
  'brooklyn|Brooklyn Bridge':     'bk-bb',
  'brooklyn|Manhattan Bridge':    'bk-mb',
  'brooklyn|Williamsburg Bridge': 'bk-wb',
  'brooklyn|Hugh L. Carey Tunnel':'bk-battery',
  // Queens
  'queens|Ed Koch Queensboro Bridge': 'qn-queensboro',
  'queens|Queens Midtown Tunnel':     'qn-qmt',
  // 60th St avenues
  '60th_street|FDR Drive':            '60-fdr',
  '60th_street|York Avenue':          '60-york',
  '60th_street|First Avenue':         '60-1av',
  '60th_street|Second Avenue':        '60-2av',
  '60th_street|Third Avenue':         '60-3av',
  '60th_street|Lexington Avenue':     '60-lex',
  '60th_street|Park Avenue':          '60-park',
  '60th_street|Madison Avenue':       '60-mad',
  '60th_street|Fifth Avenue':         '60-5av',
  '60th_street|Broadway':             '60-bway',
  '60th_street|Columbus Avenue':      '60-cols',
  '60th_street|Amsterdam Avenue':     '60-amst',
  '60th_street|West End Avenue':      '60-westend',
  '60th_street|West Side Highway':    '60-wsh',
  '60th_street|Central Park West':    '60-cpw',
  '60th_street|Central Park Drive / 7th Ave':       '60-bway',
  '60th_street|Central Park Drive From 6th Avenue': '60-5av',
  '60th_street|Ed Koch Queensboro Bridge Ramp':     '60-1av',
}

/**
 * Express/local-pair merge map. When the user toggles "merged" view, each
 * 60th-St subway local+express pair collapses into a single ribbon (so
 * e.g. A/B/C-local and A/D-express → one A/B/C/D ribbon). Crossings not
 * in this map pass through unchanged.
 */
export const MERGE_SUBWAY_PAIRS: Partial<Record<CrossingId, CrossingId>> = {
  '60-sub-8av-loc': '60-sub-8av',
  '60-sub-8av-exp': '60-sub-8av',
  '60-sub-7av-loc': '60-sub-7av',
  '60-sub-7av-exp': '60-sub-7av',
  '60-sub-lex-loc': '60-sub-lex',
  '60-sub-lex-exp': '60-sub-lex',
}

/** Map (sector, facility) from `appendix_iii_detail.json` to a CrossingId. */
// Subway/rail/ferry per-line/facility mapping. `facility` strings vary in
// punctuation/case across years; we normalize on read in `nyc-data.ts`.
export const FACILITY_TO_CROSSING: Record<string, CrossingId> = {
  // ── Brooklyn subway ─────────────────────────────────────────────────
  'brooklyn|2 3 line':                    'bk-clark',
  'brooklyn|2 3 line (local)':            'bk-clark',
  'brooklyn|4 5 line':                    'bk-joralemon',
  'brooklyn|4 5 line (local)':            'bk-joralemon',
  'brooklyn|a c line':                    'bk-cranberry',
  'brooklyn|a c line (local)':            'bk-cranberry',
  'brooklyn|f line':                      'bk-rutgers',
  'brooklyn|f line (local)':              'bk-rutgers',
  'brooklyn|j z m line (local)':          'bk-wb',     // J/Z/M ride the Wmsbg Br alongside autos/buses
  'brooklyn|l line (local)':              'bk-canarsie',
  'brooklyn|n r line (local)':            'bk-montague',
  'brooklyn|n* r line':                   'bk-montague',
  'brooklyn|b d n q line (local)':        'bk-mb-nq',  // Bway local across MB south tracks
  'brooklyn|d n line (express)':          'bk-mb-bd',  // 6th Ave / Bway express across MB north tracks
  'brooklyn|via canal st (n) express':    'bk-mb-bd',
  'brooklyn|via canal st(n q) local':     'bk-mb-nq',

  // ── Brooklyn bus (carried by autos' bridges/tunnels) ────────────────
  'brooklyn|hugh l. carey tunnel(express) / mta bus co':  'bk-battery',
  'brooklyn|hugh l. carey tunnel(express) / nyc transit': 'bk-battery',
  'brooklyn|williamsburg bridge (local) / nyc transit':   'bk-wb',
  'brooklyn|manhattan bridge (express / local) / nyc transit':       'bk-mb',
  'brooklyn|manhattan bridge (express / local) / nyc transit-expr.': 'bk-mb',
  'brooklyn|manhattan bridge (express / local) / nyc transit-local': 'bk-mb',

  // ── Queens subway ───────────────────────────────────────────────────
  'queens|7 line':                  'qn-steinway',
  'queens|e m line':                'qn-53',
  'queens|f line':                  'qn-63',
  'queens|n q r line':              'qn-60',
  'queens|n r q line':              'qn-60',

  // ── Queens rail ─────────────────────────────────────────────────────
  // "N.e. Corridor" in detail is Amtrak Empire Service (~500/hr, gaps between
  // trains). True LIRR (~25k/hr at peak) is the queens Section C residual,
  // derived in `buildCrossingFlows` and routed to qn-lirr.
  'queens|n.e. corridor':           'qn-amtrak',

  // ── Queens bus ──────────────────────────────────────────────────────
  'queens|ed koch queensboro bridge':                  'qn-queensboro',
  'queens|ed koch queensboro bridge / mta bus co':     'qn-queensboro',
  'queens|ed koch queensboro bridge / mta bus co (express)': 'qn-queensboro',
  'queens|ed koch queensboro bridge / mta bus co (local)':   'qn-queensboro',
  'queens|ed koch queensboro bridge / nyc transit':           'qn-queensboro',
  'queens|ed koch queensboro bridge / nyc transit (express)': 'qn-queensboro',
  'queens|ed koch queensboro bridge / nyc transit (local)':   'qn-queensboro',
  'queens|queens midtown tunnel':                  'qn-qmt',
  'queens|queens midtown tunnel / mta bus co':     'qn-qmt',
  'queens|queens midtown tunnel / mta bus co.':    'qn-qmt',
  'queens|queens midtown tunnel / nyc transit':    'qn-qmt',

  // ── NJ ──────────────────────────────────────────────────────────────
  'nj|downtown path': 'nj-path-dn',
  'nj|uptown path':   'nj-path-up',
  'nj|midtown direct': 'nj-amtrak',
  'nj|n.e. corridor':  'nj-amtrak',
  'nj|nec / njcl':     'nj-amtrak',
  'nj|holland tunnel': 'nj-holland',
  'nj|lincoln tunnel': 'nj-lincoln',

  // ── 60th St subway ──────────────────────────────────────────────────
  '60th_street|via 1 2 line (local)':       '60-sub-7av-loc',
  '60th_street|via 2* 1 line - local':       '60-sub-7av-loc',
  '60th_street|via 2 3 line (express)':      '60-sub-7av-exp',
  '60th_street|via 2 3 line':                '60-sub-7av-exp',
  '60th_street|via 4* 6 line (local)':       '60-sub-lex-loc',
  '60th_street|via 4 5 line (express)':      '60-sub-lex-exp',
  '60th_street|via 6 (local)':               '60-sub-lex-loc',
  '60th_street|& 5 express':                 '60-sub-lex-exp',
  '60th_street|via a (exp./loc) d (express)':'60-sub-8av-exp',
  '60th_street|via a* d line (express)':     '60-sub-8av-exp',
  '60th_street|via a b c line (local)':      '60-sub-8av-loc',
  '60th_street|via b c line (local)':        '60-sub-8av-loc',
  '60th_street|via q w line (local)':        '60-sub-bway-loc',
  '60th_street|via q w** line (local)':      '60-sub-bway-loc',

  // ── 60th St rail ────────────────────────────────────────────────────
  '60th_street|hudson line':     '60-mnr-hudson',
  '60th_street|harlem line':     '60-mnr-harlem',
  '60th_street|new haven line':  '60-mnr-newhaven',
  '60th_street|empire sevice':   '60-mnr-empire',

  // ── 60th St bus ─────────────────────────────────────────────────────
  '60th_street|broadway / mta bus co.':       '60-bway',
  '60th_street|broadway / mta bus co. **':    '60-bway',
  '60th_street|broadway / nyct local':        '60-bway',
  '60th_street|columbus ave / nyct local':    '60-cols',
  '60th_street|fifth avenue / mta bus co':    '60-5av',
  '60th_street|fifth avenue / nyct local':    '60-5av',
  '60th_street|fifth avenue / wcdot':         '60-5av',
  '60th_street|fifth avenue / wcdot *':       '60-5av',
  '60th_street|lexington avenue / mta bus co.': '60-lex',
  '60th_street|lexington avenue / nyct local':  '60-lex',
  'westchester|fifth avenue / wcdot':           '60-5av',
  '60th_street|second ave / nyct express':    '60-2av',
  '60th_street|second ave / nyct local':      '60-2av',
  '60th_street|west end avenue / nyct local': '60-westend',
  '60th_street|york avenue / nyct local':     '60-york',
  '60th_street|amsterdam ave. / nyct local':  '60-amst',
  '60th_street|cp west / nyct local':         '60-cpw',
  '60th_street|first avenue / nyct local':    '60-1av',
  '60th_street|first avenue / nyct express':  '60-1av',
  '60th_street|madison avenue / mta bus co.': '60-mad',
  '60th_street|madison avenue / nyct local':  '60-mad',
  '60th_street|madison avenue / wcdot':       '60-mad',
  '60th_street|madison avenue / wcdot *':     '60-mad',
  '60th_street|third avenue / mta bus co.':   '60-3av',
  '60th_street|third avenue / nyct local':    '60-3av',
}

/** Normalize a facility name for stable matching (lowercase, dedupe punct). */
export function normFacility(s: string): string {
  return s
    .toLowerCase()
    .replace(/lines/g, 'line')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
