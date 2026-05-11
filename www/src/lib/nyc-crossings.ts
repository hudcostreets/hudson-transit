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
// Manhattan's grid is rotated ~29° west of due north. Two consequences:
//
//   1. A southbound avenue path runs at bearing ~207° (SSW), not 180°.
//   2. 60th Street itself runs ~119° (ESE), so it tilts: its lat
//      decreases as you move east. Anchoring all 60th-St avenues at one
//      flat lat (e.g. 40.7660) lines them up in a horizontal row — wrong
//      visually, since 60th & 1st Ave is genuinely south of 60th & WSH.
//
// We model 60th St as a line and place each avenue's mid-point ON that
// line. The slope below is calibrated from real coords (60th & WSH ≈
// 40.7706 / -74.001; 60th & 1st Ave ≈ 40.7617 / -73.950).
const SIXTIETH_REF_LAT = 40.7660  // 60th St near 5th Ave
const SIXTIETH_REF_LNG = -73.9737 // 5th Ave at 60th St
const SIXTIETH_SLOPE = -0.177     // Δlat / Δlng along 60th St
function midLatFor(lon: number): number {
  return SIXTIETH_REF_LAT + SIXTIETH_SLOPE * (lon - SIXTIETH_REF_LNG)
}

// Avenue path is centered on the 60th-St crossing: extends ~0.003° lat
// north and ~0.0028° lat south, sheared SSW per the grid rotation.
// Kept compact so the north endpoints stay clearly in Manhattan (not LIC)
// and don't clash with the Queens-tunnel ribbons.
const AVE_NORTH_DLAT = 0.0034
const AVE_SOUTH_DLAT = 0.0028
const AVE_SHEAR = 0.55            // Δlon / Δlat for southbound avenues (tan(29°)≈0.55)

const ave = (lon: number, opts?: { topDLat?: number; tipDLat?: number }): LatLon[] => {
  const dn = opts?.topDLat ?? AVE_NORTH_DLAT
  const ds = opts?.tipDLat ?? AVE_SOUTH_DLAT
  const midLat = midLatFor(lon)
  return [
    [midLat + dn, lon + AVE_SHEAR * dn],   // north end (east of mid)
    [midLat,      lon],                    // crosses 60th St on the line
    [midLat - ds, lon - AVE_SHEAR * ds],   // south end (west of mid)
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
  // Subway tubes (one ribbon per shared right-of-way). Each tube ends at
  // its first Manhattan station — keeping the arrow tip on the shore
  // rather than penetrating mid-Manhattan where the cluster gets noisy.
  'bk-cranberry': {
    id: 'bk-cranberry', name: 'Cranberry · A/C', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6997, -73.9907], [40.7050, -73.9970], [40.7138, -74.0049]],
  },
  'bk-clark': {
    id: 'bk-clark', name: 'Clark St · 2/3', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6976, -73.9930], [40.7045, -74.0000], [40.7128, -74.0084]],
  },
  'bk-joralemon': {
    id: 'bk-joralemon', name: 'Joralemon · 4/5', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6918, -73.9922], [40.6990, -74.0030], [40.7045, -74.0114]],
  },
  'bk-rutgers': {
    id: 'bk-rutgers', name: 'Rutgers · F', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6997, -73.9863], [40.7080, -73.9890], [40.7137, -73.9905]],
  },
  // L's first Manhattan stop is 1st Ave/14th, which is genuinely a few
  // blocks inland from the East River — we leave the path at that stop.
  'bk-canarsie': {
    id: 'bk-canarsie', name: 'Canarsie · L', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.7170, -73.9560], [40.7235, -73.9720], [40.7305, -73.9818]],
  },
  'bk-montague': {
    id: 'bk-montague', name: 'Montague · N/R', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6930, -73.9920], [40.6975, -74.0050], [40.7038, -74.0130]],
  },
  // Mh Bridge subway: north tracks (B/D → 6th Ave) vs south tracks (N/Q → Bway).
  'bk-mb-bd': {
    id: 'bk-mb-bd', name: 'Mh Br · B/D', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6985, -73.9892], [40.7080, -73.9928], [40.7180, -73.9970]],
  },
  'bk-mb-nq': {
    id: 'bk-mb-nq', name: 'Mh Br · N/Q', sector: 'brooklyn', modes: ['Subway'],
    path: [[40.6990, -73.9882], [40.7085, -73.9914], [40.7170, -73.9970]],
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
  'qn-steinway': {
    id: 'qn-steinway', name: 'Steinway Tube · 7', sector: 'queens', modes: ['Subway'],
    path: [[40.7470, -73.9460], [40.7480, -73.9620], [40.7517, -73.9760]],
  },
  'qn-53': {
    id: 'qn-53', name: '53rd St Tunnel · E/M', sector: 'queens', modes: ['Subway'],
    path: [[40.7510, -73.9410], [40.7560, -73.9560], [40.7610, -73.9700]],
  },
  'qn-63': {
    id: 'qn-63', name: '63rd St Tunnel · F', sector: 'queens', modes: ['Subway'],
    path: [[40.7560, -73.9430], [40.7615, -73.9540], [40.7650, -73.9670]],
  },
  'qn-60': {
    id: 'qn-60', name: '60th St Tunnel · N/Q/R', sector: 'queens', modes: ['Subway'],
    path: [[40.7530, -73.9400], [40.7590, -73.9540], [40.7615, -73.9710]],
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
  '60-wsh':       { id: '60-wsh',       name: 'West Side Hwy',   sector: '60th_street', modes: ['Auto'],         path: ave(-74.0010) },
  '60-westend':   { id: '60-westend',   name: 'West End Ave',    sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(-73.9890) },
  '60-amst':      { id: '60-amst',      name: 'Amsterdam Ave',   sector: '60th_street', modes: ['Auto'],         path: ave(-73.9837) },
  '60-cols':      { id: '60-cols',      name: 'Columbus Ave',    sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(-73.9810) },
  '60-cpw':       { id: '60-cpw',       name: 'CPW',             sector: '60th_street', modes: ['Auto'],         path: ave(-73.9787) },
  '60-bway':      { id: '60-bway',      name: 'Broadway',        sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(-73.9830) },
  '60-5av':       { id: '60-5av',       name: 'Fifth Ave',       sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(-73.9728) },
  '60-mad':       { id: '60-mad',       name: 'Madison Ave',     sector: '60th_street', modes: ['Auto'],         path: ave(-73.9696) },
  '60-park':      { id: '60-park',      name: 'Park Ave',        sector: '60th_street', modes: ['Auto'],         path: ave(-73.9667) },
  '60-lex':       { id: '60-lex',       name: 'Lexington Ave',   sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(-73.9637) },
  '60-3av':       { id: '60-3av',       name: 'Third Ave',       sector: '60th_street', modes: ['Auto'],         path: ave(-73.9608) },
  '60-2av':       { id: '60-2av',       name: 'Second Ave',      sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(-73.9578) },
  '60-1av':       { id: '60-1av',       name: 'First Ave',       sector: '60th_street', modes: ['Auto'],         path: ave(-73.9550) },
  '60-york':      { id: '60-york',      name: 'York Ave',        sector: '60th_street', modes: ['Auto', 'Bus'],  path: ave(-73.9500) },
  '60-fdr':       { id: '60-fdr',       name: 'FDR Drive',       sector: '60th_street', modes: ['Auto'],         path: ave(-73.9460) },

  // 60th St subway corridors (each ribbon = one express/local pair)
  '60-sub-8av-loc': { id: '60-sub-8av-loc', name: 'CPW · A/B/C', sector: '60th_street', modes: ['Subway'], path: ave(-73.9800) },
  '60-sub-8av-exp': { id: '60-sub-8av-exp', name: 'CPW · A/D',   sector: '60th_street', modes: ['Subway'], path: ave(-73.9795) },
  '60-sub-7av-loc': { id: '60-sub-7av-loc', name: 'Bway · 1/2',  sector: '60th_street', modes: ['Subway'], path: ave(-73.9818) },
  '60-sub-7av-exp': { id: '60-sub-7av-exp', name: '7 Av · 2/3',  sector: '60th_street', modes: ['Subway'], path: ave(-73.9805) },
  '60-sub-lex-loc': { id: '60-sub-lex-loc', name: 'Lex · 4/6',   sector: '60th_street', modes: ['Subway'], path: ave(-73.9645) },
  '60-sub-lex-exp': { id: '60-sub-lex-exp', name: 'Lex · 4/5',   sector: '60th_street', modes: ['Subway'], path: ave(-73.9633) },
  '60-sub-bway-loc':{ id: '60-sub-bway-loc',name: 'Bway · Q/W',  sector: '60th_street', modes: ['Subway'], path: ave(-73.9788) },

  // Metro-North down Park Ave (all 3 main lines + Empire Service)
  '60-mnr-hudson':   { id: '60-mnr-hudson',   name: 'MNR · Hudson Line',     sector: '60th_street', modes: ['Rail'], path: ave(-73.9670) },
  '60-mnr-harlem':   { id: '60-mnr-harlem',   name: 'MNR · Harlem Line',     sector: '60th_street', modes: ['Rail'], path: ave(-73.9665) },
  '60-mnr-newhaven': { id: '60-mnr-newhaven', name: 'MNR · New Haven Line',  sector: '60th_street', modes: ['Rail'], path: ave(-73.9660) },
  '60-mnr-empire':   { id: '60-mnr-empire',   name: 'Empire Service',         sector: '60th_street', modes: ['Rail'], path: ave(-73.9675) },
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
