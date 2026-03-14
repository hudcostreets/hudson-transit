import { useMemo, useState, useCallback, useRef } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import MapGL, { Source, Layer } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { CrossingRecord, Direction, TimePeriod } from '../lib/types'
import { DEFAULT_SCHEME } from '../lib/colors'
import { filterCrossings } from '../lib/transform'
import { useUrlState } from 'use-prms'
import Toggle from './Toggle'

const { sqrt, max, min, PI, sin, cos, atan2, pow } = Math

type LatLon = [number, number]  // [lat, lon]

// Geographic paths from NJ portal/terminal → Manhattan CBD entry point.
// Each path is an array of [lat, lon] waypoints.
// Coordinates sourced from Wikipedia, Port Authority, GPS databases.
const CROSSING_PATHS: Record<string, LatLon[]> = {
  'Lincoln Tunnel': [
    [40.7664, -74.0227],  // NJ portal (Weehawken)
    [40.7625, -74.0110],  // mid-Hudson
    [40.7587, -73.9991],  // Manhattan portal (39th St / 10th Ave)
  ],
  'Holland Tunnel': [
    [40.7297, -74.0361],  // NJ portal (Jersey City, 14th St / Marin Blvd)
    [40.7278, -74.0200],  // mid-Hudson
    [40.7255, -74.0070],  // Manhattan portal (Broome St / Hudson Square)
  ],
  'Amtrak/N.J. Transit Tunnels': [
    [40.7714, -74.0419],  // NJ portal (North Bergen, Palisades at Rt 3/US 1-9)
    [40.7680, -74.0200],  // under Weehawken (approaching Hudson)
    [40.7600, -74.0100],  // mid-Hudson
    [40.7510, -74.0015],  // Manhattan portal (10th Ave & 32nd St)
  ],
  'Uptown PATH Tunnel': [
    [40.7355, -74.0298],  // Hoboken terminal
    [40.7345, -74.0170],  // mid-Hudson
    [40.7337, -74.0068],  // Christopher St station
    [40.7338, -74.0020],  // 9th St
    [40.7361, -73.9969],  // 14th St
    [40.7427, -73.9932],  // 23rd St
    [40.7486, -73.9884],  // 33rd St
  ],
  'Downtown PATH Tunnel': [
    [40.7162, -74.0330],  // Exchange Place (Jersey City)
    [40.7140, -74.0230],  // mid-Hudson
    [40.7116, -74.0123],  // World Trade Center
  ],
}

// Cubic bezier: generates smooth curve through control points
function cubicBezier(p0: LatLon, p1: LatLon, p2: LatLon, p3: LatLon, n = 20): LatLon[] {
  const pts: LatLon[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t
    pts.push([
      u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
      u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
    ])
  }
  return pts
}

// S-curve: depart east, arrive east. Minimum span prevents degenerate
// straight lines when start/end are at similar longitude.
function sBezier(start: LatLon, end: LatLon): LatLon[] {
  const dLon = end[1] - start[1]
  const dLat = end[0] - start[0]
  const dist = sqrt(dLat * dLat + dLon * dLon)
  const span = max(Math.abs(dLon) * 0.5, dist * 0.35)
  const cp1: LatLon = [start[0], start[1] + span]
  const cp2: LatLon = [end[0], end[1] - span]
  return cubicBezier(start, cp1, cp2, end)
}

/** Bezier with explicit departure and/or arrival bearings (degrees, 0=N 90=E).
 *  Tangent at start matches departBearing; tangent at end matches arriveBearing.
 *  Undefined bearings default to east (90°). */
function directedBezier(start: LatLon, end: LatLon, departBearing?: number, arriveBearing?: number): LatLon[] {
  const dLat = end[0] - start[0], dLon = end[1] - start[1]
  const dist = sqrt(dLat * dLat + dLon * dLon)
  const span = max(dist * 0.4, 0.001)

  const dRad = (departBearing ?? 90) * PI / 180
  const cp1: LatLon = [start[0] + cos(dRad) * span, start[1] + sin(dRad) * span]

  const aRad = (arriveBearing ?? 90) * PI / 180
  const cp2: LatLon = [end[0] - cos(aRad) * span, end[1] - sin(aRad) * span]

  return cubicBezier(start, cp1, cp2, end)
}

// --- Ferry Sankey tree ---
// Recursive merge tree: leaves are NJ ferry terminals, internal nodes are
// merge points where tributaries combine into a wider trunk.
//
// Each merge specifies an explicit `bearing` (degrees, 0=N 90=E) — the
// direction the outgoing trunk flows. The perpendicular to that bearing
// determines the stacking axis. Children are ordered right→left relative
// to the flow direction (S→N for an eastward bearing).
type FerryNode =
  | { type: 'source'; label: string; pos: LatLon; weight: number }
  | { type: 'merge'; pos: LatLon; bearing: number; children: FerryNode[] }

function ferryWeight(node: FerryNode): number {
  return node.type === 'source'
    ? node.weight
    : node.children.reduce((s, c) => s + ferryWeight(c), 0)
}

/** Collect all leaf source positions from a ferry tree (for hover labels). */
function ferrySources(node: FerryNode): { label: string; pos: LatLon }[] {
  if (node.type === 'source') return [{ label: node.label, pos: node.pos }]
  return node.children.flatMap(c => ferrySources(c))
}

/** Perpendicular unit vector (left of bearing) in [lat, lon] space.
 *  bearing: degrees clockwise from north (0=N, 90=E, etc.)
 *  Returns unit vector pointing left of the bearing direction. */
function bearingPerpLeft(bearing: number): LatLon {
  const rad = bearing * PI / 180
  // Forward in (lat,lon): (cos(bearing), sin(bearing))
  // Left = 90° CCW: (sin(bearing), -cos(bearing))
  // But lon degrees are smaller than lat degrees, so we don't scale here —
  // the caller applies LNG_SCALE when computing positions.
  return [sin(rad), -cos(rad)]
}

interface FerryTree {
  dest: string
  destPos: LatLon
  root: FerryNode
}

const FERRY_TREES: FerryTree[] = [
  {
    dest: 'MT39',
    destPos: [40.7603, -74.0032],   // W 39th St / Pier 79 (Manhattan)
    root: {
      type: 'merge',
      pos: [40.7603, -74.0110],     // WHK + combined Hob merge (at MT39's latitude — trunk goes straight east in)
      bearing: 90,                   // due east into MT39
      children: [
        // South side (right of eastward flow): combined Hoboken streams
        {
          type: 'merge',
          pos: [40.7550, -74.0140],  // Hob14 + HobSo pre-merge (further N, between sources and main merge)
          bearing: 50,               // trunk flows NE toward main merge
          children: [
            { type: 'source', label: 'Hob So', pos: [40.7359, -74.0282], weight: 0.15 },
            { type: 'source', label: 'Hob 14', pos: [40.7505, -74.0241], weight: 0.20 },
          ],
        },
        // North side (left of ENE flow): Weehawken
        { type: 'source', label: 'WHK', pos: [40.7771, -74.0136], weight: 0.30 },
      ],
    },
  },
  {
    dest: 'BPT',
    destPos: [40.7142, -74.0169],    // Brookfield Place (Manhattan)
    root: {
      type: 'merge',
      pos: [40.7142, -74.0210],      // merge at BPT's latitude — trunk goes straight east in
      bearing: 90,                   // due east into BPT
      children: [
        { type: 'source', label: 'PH', pos: [40.7138, -74.0337], weight: 0.20 },
        { type: 'source', label: 'Hob So', pos: [40.7359, -74.0282], weight: 0.15 },
      ],
    },
  },
]

// Representative path for "All Ferry Points" (for label positioning)
const FERRY_LABEL_POS: LatLon = [40.7505, -74.0241]  // Hoboken 14th St

// Map center + zoom to fit all crossings (Amtrak NJ portal W to Manhattan E, PATH downtown S)
const MAP_CENTER: [number, number] = [-74.012, 40.740]

// Mode colors from semantic scheme
const MODE_COLORS = DEFAULT_SCHEME.mode

// Mode icon basenames (matching /icons/*.svg)
const MODE_ICON: Record<string, string> = {
  Bus: 'bus',
  Autos: 'car',
  Rail: 'train',
  PATH: 'train',
  Ferry: 'ferry',
}

// Agency icon basenames per crossing (true-color <img> logos)
const CROSSING_AGENCY: Record<string, string[]> = {
  'Lincoln Tunnel': ['pa'],
  'Holland Tunnel': ['pa'],
  'Amtrak/N.J. Transit Tunnels': ['njt', 'amtrak'],
  'Uptown PATH Tunnel': ['path'],
  'Downtown PATH Tunnel': ['path'],
  'All Ferry Points': ['nyww'],
}

// Aggregate crossing records by crossing+mode for a single year
interface FlowDatum {
  crossing: string
  mode: string
  passengers: number
  path: LatLon[]
  isFerry?: boolean  // true for "All Ferry Points" — rendered as Sankey on map
}

// Unique key for a flow
function flowKey(f: { crossing: string; mode: string }): string {
  return `${f.crossing}|${f.mode}`
}

function aggregateFlows(records: CrossingRecord[], year: number): FlowDatum[] {
  const byKey = new Map<string, FlowDatum>()
  for (const r of records) {
    if (r.year !== year) continue
    // Keep "All Ferry Points" as a single entry (visual Sankey split handled in renderer)
    if (r.crossing === 'All Ferry Points') {
      const key = `${r.crossing}|${r.mode}`
      const existing = byKey.get(key)
      if (existing) {
        existing.passengers += r.passengers
      } else {
        byKey.set(key, {
          crossing: r.crossing, mode: r.mode, passengers: r.passengers,
          path: [FERRY_LABEL_POS], isFerry: true,
        })
      }
      continue
    }
    const path = CROSSING_PATHS[r.crossing]
    if (!path) continue
    const key = `${r.crossing}|${r.mode}`
    const existing = byKey.get(key)
    if (existing) {
      existing.passengers += r.passengers
    } else {
      byKey.set(key, { crossing: r.crossing, mode: r.mode, passengers: r.passengers, path })
    }
  }
  return [...byKey.values()]
}

// Offset a path laterally for stacking multiple modes on the same crossing
function offsetPath(path: LatLon[], offset: number): LatLon[] {
  if (path.length < 2 || offset === 0) return path
  const [sLat, sLon] = path[0]
  const [eLat, eLon] = path[path.length - 1]
  const dx = eLon - sLon, dy = eLat - sLat
  const len = sqrt(dx * dx + dy * dy)
  if (len === 0) return path
  const perpLat = -dx / len
  const perpLon = dy / len
  const k = offset * 0.0004
  return path.map(([lat, lon]) => [lat + perpLat * k, lon + perpLon * k])
}

// Convert [lat, lon][] path to GeoJSON [lon, lat][] coordinates
function toGeoJSON(path: LatLon[]): [number, number][] {
  return path.map(([lat, lon]) => [lon, lat])
}

// --- Ribbon polygon generation ---
// Reference lat for cos correction (all paths are near 40.74°N)
const REF_LAT_RAD = 40.74 * PI / 180
const COS_REF = cos(REF_LAT_RAD)
const LNG_SCALE = 1 / COS_REF  // lng degrees per lat degree at this latitude
// Degrees-lat per pixel at reference zoom 12
const DEG_PER_PX_Z12 = 156543.03 * COS_REF / (pow(2, 12) * 111320)

/** Convert pixel width to half-width in degrees of latitude, accounting for zoom and geoScale */
function pxToHalfDeg(widthPx: number, zoom: number, geoScale: number): number {
  return (widthPx / 2) * DEG_PER_PX_Z12 * pow(2, (geoScale - 1) * (zoom - 12))
}

/** Convert pixel offset to degrees of latitude (full, not halved). */
function pxToDeg(px: number, zoom: number, geoScale: number): number {
  return px * DEG_PER_PX_Z12 * pow(2, (geoScale - 1) * (zoom - 12))
}

/** Perpendicular unit vector at waypoint i (in lat/lng space, not scaled) */
function perpAt(path: LatLon[], i: number): LatLon {
  const n = path.length
  let dy = 0, dx = 0
  if (i < n - 1) { dy += path[i + 1][0] - path[i][0]; dx += path[i + 1][1] - path[i][1] }
  if (i > 0) { dy += path[i][0] - path[i - 1][0]; dx += path[i][1] - path[i - 1][1] }
  const len = sqrt(dy * dy + dx * dx)
  if (len === 0) return [0, 0]
  return [-dx / len, dy / len]  // rotate 90° CCW
}

/** Forward unit vector at waypoint i */
function fwdAt(path: LatLon[], i: number): LatLon {
  const n = path.length
  const next = min(i + 1, n - 1), prev = max(i - 1, 0)
  const dy = path[next][0] - path[prev][0], dx = path[next][1] - path[prev][1]
  const len = sqrt(dy * dy + dx * dx)
  if (len === 0) return [0, 0]
  return [dy / len, dx / len]
}

/** Build a ribbon polygon with integrated arrowhead.
 *  Returns GeoJSON [lng, lat][] ring (closed). */
function ribbonArrow(
  path: LatLon[],
  halfW: number,            // half ribbon width in degrees lat
  arrowWingFactor: number,  // wing width as multiple of halfW
  arrowLenFactor: number,   // arrow length as multiple of full width (2*halfW)
): [number, number][] {
  const n = path.length
  if (n < 2) return []
  // Compute cumulative arc length along the path
  const cumLen = [0]
  for (let i = 1; i < n; i++) {
    const dy = path[i][0] - path[i - 1][0], dx = path[i][1] - path[i - 1][1]
    cumLen.push(cumLen[i - 1] + sqrt(dy * dy + dx * dx))
  }
  const pathLen = cumLen[n - 1]
  // Clamp arrow length to at most 40% of path (prevents arrowhead consuming short paths)
  const desiredArrowLen = halfW * 2 * arrowLenFactor
  const arrowLen = min(desiredArrowLen, pathLen * 0.4)
  const arrowScale = desiredArrowLen > 0 ? arrowLen / desiredArrowLen : 1
  const arrowHalfW = halfW * (1 + (arrowWingFactor - 1) * arrowScale)
  const ls = LNG_SCALE

  // Arrow base is at (pathLen - arrowLen) along the path.
  // Only emit ribbon body points up to that distance to avoid self-intersection.
  const baseDist = pathLen - arrowLen

  const left: [number, number][] = []
  const right: [number, number][] = []

  for (let i = 0; i < n; i++) {
    if (cumLen[i] > baseDist) break
    const [pLat, pLng] = perpAt(path, i)
    left.push([path[i][1] + pLng * halfW * ls, path[i][0] + pLat * halfW])
    right.push([path[i][1] - pLng * halfW * ls, path[i][0] - pLat * halfW])
  }

  // Arrowhead at terminus
  const [fLat, fLng] = fwdAt(path, n - 1)
  const [pLat, pLng] = perpAt(path, n - 1)
  const baseLat = path[n - 1][0] - fLat * arrowLen
  const baseLng = path[n - 1][1] - fLng * arrowLen

  // Ribbon→wing transition at arrow base
  left.push([baseLng + pLng * halfW * ls, baseLat + pLat * halfW])
  right.push([baseLng - pLng * halfW * ls, baseLat - pLat * halfW])
  left.push([baseLng + pLng * arrowHalfW * ls, baseLat + pLat * arrowHalfW])
  right.push([baseLng - pLng * arrowHalfW * ls, baseLat - pLat * arrowHalfW])

  // Tip
  const tip: [number, number] = [path[n - 1][1], path[n - 1][0]]

  // Combine: left forward → tip → right backward → close
  const ring = [...left, tip, ...right.reverse()]
  ring.push(ring[0])
  return ring
}

/** Build a ribbon polygon WITHOUT arrowhead (for fade segments, ferry branches). */
function ribbon(path: LatLon[], halfW: number): [number, number][] {
  const n = path.length
  if (n < 2) return []
  const ls = LNG_SCALE
  const left: [number, number][] = []
  const right: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const [pLat, pLng] = perpAt(path, i)
    left.push([path[i][1] + pLng * halfW * ls, path[i][0] + pLat * halfW])
    right.push([path[i][1] - pLng * halfW * ls, path[i][0] - pLat * halfW])
  }
  const ring = [...left, ...right.reverse()]
  ring.push(ring[0])
  return ring
}

// Year param
const yearParam = {
  encode: (v: number) => String(v),
  decode: (s: string | null) => s ? parseInt(s) : null,
}

const TIMES: TimePeriod[] = ['peak_1hr', 'peak_period', '24hr']
const dirParam = {
  encode: (v: Direction) => v === 'entering' ? 'njny' : 'nynj',
  decode: (s: string | null): Direction => s === 'nynj' ? 'leaving' : 'entering',
}
const timeParam = {
  encode: (v: TimePeriod) => ({ peak_1hr: '1h', peak_period: '3h', '24hr': '1d' })[v],
  decode: (s: string | null): TimePeriod =>
    s === '3h' ? 'peak_period' : s === '1d' ? '24hr' : 'peak_1hr',
}

// Terminal name mapping for tunnel crossings (NJ side, Manhattan side)
const TERMINAL_NAMES: Record<string, [string, string]> = {
  'Lincoln Tunnel': ['Weehawken', 'PABT'],
  'Holland Tunnel': ['Jersey City', 'Hudson Sq'],
  'Amtrak/N.J. Transit Tunnels': ['North Bergen', 'Penn Station'],
  'Uptown PATH Tunnel': ['Hoboken', '33rd St PATH'],
  'Downtown PATH Tunnel': ['Exchange Place', 'WTC PATH'],
}

// Manhattan-side terminus labels (always shown on map)
const MANHATTAN_TERMINI: { name: string; pos: LatLon }[] = [
  { name: 'PABT', pos: [40.7587, -73.9991] },           // Lincoln Tunnel → Port Authority
  { name: 'Penn Station', pos: [40.7510, -74.0015] },    // Amtrak/NJT
  { name: 'Hudson Sq', pos: [40.7255, -74.0070] },       // Holland Tunnel
  { name: 'WTC PATH', pos: [40.7116, -74.0123] },        // Downtown PATH
  { name: 'MT39', pos: [40.7603, -74.0032] },             // Ferry → 39th St
  { name: 'BPT', pos: [40.7142, -74.0169] },              // Ferry → Brookfield Place
]

// Uptown PATH Manhattan station positions (for hover dots)
const UPTOWN_PATH_STATIONS: { name: string; pos: LatLon }[] = [
  { name: 'Christopher St', pos: [40.7337, -74.0068] },
  { name: '9th St', pos: [40.7338, -74.0020] },
  { name: '14th St', pos: [40.7361, -73.9969] },
  { name: '23rd St', pos: [40.7427, -73.9932] },
  { name: '33rd St', pos: [40.7486, -73.9884] },
]

// Uptown PATH fade start index (Christopher St = index 2 in CROSSING_PATHS)
const UPTOWN_FADE_START = 2

// Display names: since we show one direction at a time, use singular "Tunnel"
const DISPLAY_NAME: Record<string, string> = {
  'Amtrak/N.J. Transit Tunnels': 'Amtrak/NJ Transit Tunnel',
  'All Ferry Points': 'Ferry (multiple routes)',
}
function displayName(crossing: string): string {
  return DISPLAY_NAME[crossing] ?? crossing
}

// Mode ordering for stacking
const MODE_ORDER = ['Autos', 'Bus', 'Rail', 'PATH', 'Ferry']

interface Props {
  data: CrossingRecord[]
}

function GeoSankeyInner({ data }: Props) {
  const years = useMemo(() => [...new Set(data.map(r => r.year))].sort(), [data])
  const [direction, setDirection] = useUrlState('d', dirParam)
  const [timePeriod, setTimePeriod] = useUrlState('t', timeParam)
  const [year, setYear] = useUrlState('yr', yearParam)
  const selectedYear = year ?? years[years.length - 1]

  // Geo-scale: 0 = fixed px width, 1 = fully geo-scaled (width grows with zoom)
  const geoScaleParam = useMemo(() => ({
    encode: (v: number) => v === 1 ? null : String(v),
    decode: (s: string | null): number => s != null ? parseFloat(s) : 1,
  }), [])
  const [geoScale, setGeoScale] = useUrlState('gs', geoScaleParam)

  // Map view: lat_lng_zoom packed into one param, `_` delimited
  const llzParam = useMemo(() => {
    const def = { lat: MAP_CENTER[1], lng: MAP_CENTER[0], zoom: 11.8 }
    return {
      encode: (v: { lat: number; lng: number; zoom: number }) => {
        if (Math.abs(v.lat - def.lat) < 0.0001 && Math.abs(v.lng - def.lng) < 0.0001 && Math.abs(v.zoom - def.zoom) < 0.01) return null
        return `${v.lat.toFixed(4)}_${v.lng.toFixed(4)}_${v.zoom.toFixed(2)}`
      },
      decode: (s: string | null) => {
        if (!s) return def
        const parts = s.split('_').map(Number)
        if (parts.length < 3 || parts.some(isNaN)) return def
        return { lat: parts[0], lng: parts[1], zoom: parts[2] }
      },
    }
  }, [])
  const [mapView, setMapView] = useUrlState('ll', llzParam)

  const filtered = useMemo(
    () => filterCrossings(data, direction, timePeriod),
    [data, direction, timePeriod],
  )

  const flows = useMemo(() => aggregateFlows(filtered, selectedYear), [filtered, selectedYear])

  // Sort flows by crossing order (approx north→south) then mode
  const sortedFlows = useMemo(() => {
    const crossingOrder = [
      'Lincoln Tunnel',
      'Amtrak/N.J. Transit Tunnels',
      'Uptown PATH Tunnel',
      'Holland Tunnel',
      'Downtown PATH Tunnel',
      'All Ferry Points',
    ]
    return [...flows].sort((a, b) => {
      const ai = crossingOrder.indexOf(a.crossing)
      const bi = crossingOrder.indexOf(b.crossing)
      const ci = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      if (ci !== 0) return ci
      return MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode)
    })
  }, [flows])

  const maxPassengers = useMemo(() => max(...flows.map(f => f.passengers), 1), [flows])
  const totalPassengers = useMemo(() => flows.reduce((s, f) => s + f.passengers, 0), [flows])

  // Hover state: key is "crossing|mode", shared between map and panel
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  // Build GeoJSON ribbon polygons (rect + arrowhead as single shapes)
  const ARROW_WING = 1.8   // wing width as multiple of ribbon half-width
  const ARROW_LEN = 1.2    // arrow length as multiple of full ribbon width

  const geojson = useMemo(() => {
    const byCrossing = new Map<string, FlowDatum[]>()
    for (const f of flows) {
      const arr = byCrossing.get(f.crossing) ?? []
      arr.push(f)
      byCrossing.set(f.crossing, arr)
    }

    const zoom = mapView.zoom
    const UPTOWN_NODE_OPACITY = [1, 1, 1, 0.55, 0.30, 0.12, 0.03]
    const FADE_SUBDIVISIONS = 5

    function lerp(a: LatLon, b: LatLon, t: number): LatLon {
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }

    function poly(props: Record<string, any>, ring: [number, number][]): GeoJSON.Feature {
      return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } }
    }

    const features: GeoJSON.Feature[] = []
    for (const [, crossingFlows] of byCrossing) {
      crossingFlows.sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode))
      crossingFlows.forEach((f, i) => {
        const key = flowKey(f)
        const color = MODE_COLORS[f.mode] ?? '#888'

        // Ferry Sankey: recursive tree of merging tributaries
        if (f.isFerry) {
          const totalPax = f.passengers
          const pxW = (weight: number) => max(1, (Math.round(totalPax * weight) / maxPassengers) * 30)

          /** Compute pixel width for a node. For merge nodes, width is the
           *  exact sum of children widths (not independently computed from
           *  total weight) to ensure seamless tiling at junctions. */
          function nodeWidth(node: FerryNode): number {
            if (node.type === 'source') return pxW(node.weight)
            return node.children.reduce((s, c) => s + nodeWidth(c), 0)
          }

          /** Recursively render a ferry tree node toward targetPos.
           *  At each merge, children are stacked laterally along the
           *  bearing's perpendicular so the combined shape is seamlessly
           *  composed of its tributaries.
           *  arriveBearing: tangent direction arriving at targetPos.
           *  straightEnd: if set, the curve goes to targetPos (approach point),
           *  then a straight segment continues to straightEnd along the bearing.
           *  This guarantees the ribbon is fully parallel at the junction. */
          function renderFerryNode(node: FerryNode, targetPos: LatLon, terminal: boolean, arriveBearing?: number, straightEnd?: LatLon) {
            const width = nodeWidth(node)
            const hw = pxToHalfDeg(width, zoom, geoScale)

            // Build path: optional straight departure + curve + optional straight arrival.
            // Straight segments at merge junctions guarantee ribbons are fully
            // parallel on both sides of the junction.
            const departBearing = node.type === 'merge' ? node.bearing : undefined
            let curveStart = node.pos
            const straightStart: LatLon[] = []
            if (node.type === 'merge') {
              // Straight departure along bearing before curving — guarantees
              // ribbon edges are exactly parallel at the junction (matching children)
              const hw2 = pxToHalfDeg(width, zoom, geoScale)
              const depLen = hw2 * 1.5
              const rad = node.bearing * PI / 180
              const ls = LNG_SCALE
              curveStart = [node.pos[0] + cos(rad) * depLen, node.pos[1] + sin(rad) * depLen * ls]
              straightStart.push(node.pos)
            }
            const curvePts = directedBezier(curveStart, targetPos, departBearing, arriveBearing)
            let path = [...straightStart, ...curvePts, ...(straightEnd ? [straightEnd] : [])]
            if (direction === 'leaving') path = [...path].reverse()
            const ring = terminal
              ? ribbonArrow(path, hw, ARROW_WING, ARROW_LEN)
              : ribbon(path, hw)
            if (ring.length) features.push(poly({ color, width, key, opacity: 1 }, ring))

            if (node.type === 'merge') {
              const [perpLat, perpLon] = bearingPerpLeft(node.bearing)
              const ls = LNG_SCALE

              // Stack children along perpendicular (right→left).
              // First child = right (negative offset), last = left (positive).
              // Each child targets a point offset from the merge, with a
              // straight approach segment along the bearing so ribbon edges
              // are guaranteed parallel at the junction.
              const rad = node.bearing * PI / 180
              const fwdLat = cos(rad), fwdLon = sin(rad)
              const approachLen = hw * 1.5  // straight run before merge (in degrees lat)

              const childWidths = node.children.map(c => nodeWidth(c))
              const totalW = childWidths.reduce((s, w) => s + w, 0)
              let cumW = 0
              for (let ci = 0; ci < node.children.length; ci++) {
                const cw = childWidths[ci]
                const centerOffset = -totalW / 2 + cumW + cw / 2
                cumW += cw
                const offsetDeg = pxToDeg(centerOffset, zoom, geoScale)
                // End point: merge pos + lateral offset
                const childEnd: LatLon = [
                  node.pos[0] + perpLat * offsetDeg,
                  node.pos[1] + perpLon * offsetDeg * ls,
                ]
                // Pre-approach point: upstream along bearing from end point
                const childApproach: LatLon = [
                  childEnd[0] - fwdLat * approachLen,
                  childEnd[1] - fwdLon * approachLen * ls,
                ]
                renderFerryNode(node.children[ci], childApproach, false, node.bearing, childEnd)
              }
            }
          }

          for (const tree of FERRY_TREES) {
            renderFerryNode(tree.root, tree.destPos, true)
          }
          return
        }

        const lateralOffset = i - (crossingFlows.length - 1) / 2
        let path = offsetPath(f.path, lateralOffset)
        if (direction === 'leaving') path = [...path].reverse()
        const width = max(1, (f.passengers / maxPassengers) * 30)
        const hw = pxToHalfDeg(width, zoom, geoScale)

        // Uptown PATH: solid ribbon+arrow to Christopher St, then fading ribbons
        if (f.crossing === 'Uptown PATH Tunnel' && path.length > 2) {
          // Solid segment with arrowhead at Christopher St
          const solidPath = path.slice(0, UPTOWN_FADE_START + 1)
          const solidRing = ribbonArrow(solidPath, hw, ARROW_WING, ARROW_LEN)
          if (solidRing.length) {
            features.push(poly({ color, width, key, opacity: 1 }, solidRing))
          }
          // Fading ribbon: subdivide the fade portion into fine points,
          // compute ribbon edges once from the FULL path (consistent perpendiculars),
          // then emit quad polygons with interpolated opacity.
          const fadePath = path.slice(UPTOWN_FADE_START)
          const fadePoints: { pt: LatLon; opacity: number }[] = []
          for (let s = 0; s < fadePath.length - 1; s++) {
            const oA = UPTOWN_NODE_OPACITY[UPTOWN_FADE_START + s] ?? 0
            const oB = UPTOWN_NODE_OPACITY[UPTOWN_FADE_START + s + 1] ?? 0
            for (let sub = 0; sub < FADE_SUBDIVISIONS; sub++) {
              const t = sub / FADE_SUBDIVISIONS
              fadePoints.push({ pt: lerp(fadePath[s], fadePath[s + 1], t), opacity: oA + (oB - oA) * t })
            }
          }
          fadePoints.push({ pt: fadePath[fadePath.length - 1], opacity: UPTOWN_NODE_OPACITY[path.length - 1] ?? 0 })

          // Compute ribbon edges using perpendiculars from the full fade path
          const allPts = fadePoints.map(fp => fp.pt)
          const ls = LNG_SCALE
          const leftEdge: [number, number][] = []
          const rightEdge: [number, number][] = []
          for (let i = 0; i < allPts.length; i++) {
            const [pLat, pLng] = perpAt(allPts, i)
            leftEdge.push([allPts[i][1] + pLng * hw * ls, allPts[i][0] + pLat * hw])
            rightEdge.push([allPts[i][1] - pLng * hw * ls, allPts[i][0] - pLat * hw])
          }

          // Emit quad polygons between consecutive edge pairs
          for (let i = 0; i < fadePoints.length - 1; i++) {
            const opacity = (fadePoints[i].opacity + fadePoints[i + 1].opacity) / 2
            if (opacity < 0.01) continue
            const ring: [number, number][] = [
              leftEdge[i], leftEdge[i + 1],
              rightEdge[i + 1], rightEdge[i],
              leftEdge[i],  // close ring
            ]
            features.push(poly({ color, width, key, opacity }, ring))
          }
        } else {
          // Normal flow: ribbon + arrowhead as one polygon
          const ring = ribbonArrow(path, hw, ARROW_WING, ARROW_LEN)
          if (ring.length) {
            features.push(poly({ color, width, key, opacity: 1 }, ring))
          }
        }
      })
    }

    // Sort widest first so narrower flows draw on top
    features.sort((a, b) => (b.properties?.width ?? 0) - (a.properties?.width ?? 0))
    return { type: 'FeatureCollection' as const, features }
  }, [flows, direction, maxPassengers, mapView.zoom, geoScale])

  // Centerline hit-targets (invisible LineStrings for hover detection)
  const hitTargetGeojson = useMemo(() => {
    const byCrossing = new Map<string, FlowDatum[]>()
    for (const f of flows) {
      const arr = byCrossing.get(f.crossing) ?? []
      arr.push(f)
      byCrossing.set(f.crossing, arr)
    }
    const features: GeoJSON.Feature[] = []
    for (const [, crossingFlows] of byCrossing) {
      crossingFlows.sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode))
      crossingFlows.forEach((f, i) => {
        const key = flowKey(f)
        if (f.isFerry) {
          function addHitPaths(node: FerryNode, targetPos: LatLon) {
            const nodePos = node.type === 'source' ? node.pos : node.pos
            let path = sBezier(nodePos, targetPos)
            if (direction === 'leaving') path = [...path].reverse()
            features.push({ type: 'Feature', properties: { key }, geometry: { type: 'LineString', coordinates: toGeoJSON(path) } })
            if (node.type === 'merge') {
              for (const child of node.children) addHitPaths(child, node.pos)
            }
          }
          for (const tree of FERRY_TREES) addHitPaths(tree.root, tree.destPos)
          return
        }
        const lateralOffset = i - (crossingFlows.length - 1) / 2
        let path = offsetPath(f.path, lateralOffset)
        if (direction === 'leaving') path = [...path].reverse()
        features.push({ type: 'Feature', properties: { key }, geometry: { type: 'LineString', coordinates: toGeoJSON(path) } })
      })
    }
    return { type: 'FeatureCollection' as const, features }
  }, [flows, direction])

  // NJ-side labels (crossing names at the start of each path)
  const labelsGeojson = useMemo(() => {
    const seen = new Set<string>()
    const features: GeoJSON.Feature[] = []
    for (const f of flows) {
      if (seen.has(f.crossing)) continue
      seen.add(f.crossing)
      const start = f.path[0]
      features.push({
        type: 'Feature',
        properties: { name: displayName(f.crossing) },
        geometry: { type: 'Point', coordinates: [start[1], start[0]] },
      })
    }
    return { type: 'FeatureCollection' as const, features }
  }, [flows])

  // Terminal markers: show start/end point names when a flow is hovered
  const terminalMarkers = useMemo(() => {
    if (!hoveredKey) return { type: 'FeatureCollection' as const, features: [] }
    const hovered = flows.find(f => flowKey(f) === hoveredKey)
    if (!hovered) return { type: 'FeatureCollection' as const, features: [] }

    const features: GeoJSON.Feature[] = []

    // Ferry: show all source + destination terminals
    if (hovered.isFerry) {
      const seen = new Set<string>()
      for (const tree of FERRY_TREES) {
        const dKey = `${tree.destPos}`
        if (!seen.has(dKey)) {
          seen.add(dKey)
          features.push({
            type: 'Feature',
            properties: { name: tree.dest, anchor: 'left' },
            geometry: { type: 'Point', coordinates: [tree.destPos[1], tree.destPos[0]] },
          })
        }
        for (const src of ferrySources(tree.root)) {
          const sKey = `${src.pos}`
          if (!seen.has(sKey)) {
            seen.add(sKey)
            features.push({
              type: 'Feature',
              properties: { name: src.label, anchor: 'right' },
              geometry: { type: 'Point', coordinates: [src.pos[1], src.pos[0]] },
            })
          }
        }
      }
      return { type: 'FeatureCollection' as const, features }
    }

    const start = hovered.path[0]
    const end = hovered.path[hovered.path.length - 1]
    const names = TERMINAL_NAMES[hovered.crossing]
    const startName = names?.[0] ?? hovered.crossing
    const endName = names?.[1] ?? ''
    features.push({
      type: 'Feature',
      properties: { name: startName, anchor: 'right' },
      geometry: { type: 'Point', coordinates: [start[1], start[0]] },
    })
    if (endName) {
      features.push({
        type: 'Feature',
        properties: { name: endName, anchor: 'left' },
        geometry: { type: 'Point', coordinates: [end[1], end[0]] },
      })
    }

    // Uptown PATH: show all 5 Manhattan station dots on hover
    if (hovered.crossing === 'Uptown PATH Tunnel') {
      for (const station of UPTOWN_PATH_STATIONS) {
        features.push({
          type: 'Feature',
          properties: { name: station.name, anchor: 'left' },
          geometry: { type: 'Point', coordinates: [station.pos[1], station.pos[0]] },
        })
      }
    }

    return { type: 'FeatureCollection' as const, features }
  }, [hoveredKey, flows])

  // Map hover handlers (on invisible hit-target layer)
  const onMouseEnter = useCallback((e: any) => {
    const props = e.features?.[0]?.properties
    if (props?.key) setHoveredKey(props.key)
  }, [])
  const onMouseLeave = useCallback(() => setHoveredKey(null), [])

  // Fill opacity expression: per-feature opacity * hover state.
  // When hovering Uptown PATH, override faded segments to full opacity.
  const fillOpacity = useMemo(() => {
    if (!hoveredKey) return ['*', ['get', 'opacity'], 0.85] as any
    return [
      'case',
      ['==', ['get', 'key'], hoveredKey], ['get', 'opacity'],
      ['*', ['get', 'opacity'], 0.25],
    ] as any
  }, [hoveredKey])

  const mapRef = useRef<MapRef>(null)

  const dirLabel = direction === 'entering' ? 'NJ\u2192NY' : 'NY\u2192NJ'
  const timeLabels: Record<TimePeriod, string> = {
    peak_1hr: direction === 'entering' ? '8-9am' : '5-6pm',
    peak_period: direction === 'entering' ? '7-10am' : '4-7pm',
    '24hr': '24hr',
  }

  return (
    <div className="geo-sankey">
      <h2>Passenger Flows by Mode</h2>
      <p className="chart-subtitle">{dirLabel}, {timeLabels[timePeriod]}, {selectedYear}</p>
      <div style={{ width: '100%', height: '500px', position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
        <MapGL
          ref={mapRef}
          longitude={mapView.lng}
          latitude={mapView.lat}
          zoom={mapView.zoom}
          onMove={e => setMapView({ lat: e.viewState.latitude, lng: e.viewState.longitude, zoom: e.viewState.zoom })}
          style={{ width: '100%', height: '100%' }}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          interactiveLayerIds={['flow-hit-target']}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          cursor={hoveredKey ? 'pointer' : ''}
        >
          {/* Ribbon polygons (rect + arrowhead as unified shapes) */}
          <Source id="flows" type="geojson" data={geojson}>
            <Layer
              id="flow-fills"
              type="fill"
              paint={{
                'fill-color': ['get', 'color'],
                'fill-opacity': fillOpacity,
              }}
            />
          </Source>
          {/* Invisible centerline hit-targets for hover detection */}
          <Source id="flow-hits" type="geojson" data={hitTargetGeojson}>
            <Layer
              id="flow-hit-target"
              type="line"
              paint={{
                'line-color': 'transparent',
                'line-width': 24,
              }}
            />
          </Source>
          {/* Crossing name labels at NJ-side endpoints */}
          <Source id="labels" type="geojson" data={labelsGeojson}>
            <Layer
              id="crossing-labels"
              type="symbol"
              layout={{
                'text-field': ['get', 'name'],
                'text-size': 11,
                'text-offset': [0, 1.5],
                'text-anchor': 'top',
              }}
              paint={{
                'text-color': '#ccc',
                'text-halo-color': '#000',
                'text-halo-width': 1,
              }}
            />
          </Source>
          {/* Manhattan terminus labels (always visible) */}
          <Source id="manhattan-termini" type="geojson" data={{
            type: 'FeatureCollection',
            features: MANHATTAN_TERMINI.map(t => ({
              type: 'Feature' as const,
              properties: { name: t.name },
              geometry: { type: 'Point' as const, coordinates: [t.pos[1], t.pos[0]] },
            })),
          }}>
            <Layer
              id="manhattan-termini-labels"
              type="symbol"
              layout={{
                'text-field': ['get', 'name'],
                'text-size': 10,
                'text-offset': [0, -1],
                'text-anchor': 'bottom',
                'text-allow-overlap': true,
              }}
              paint={{
                'text-color': '#aaa',
                'text-halo-color': '#000',
                'text-halo-width': 1,
              }}
            />
          </Source>
          {/* Terminal markers on hover */}
          <Source id="terminal-markers" type="geojson" data={terminalMarkers}>
            <Layer
              id="terminal-marker-dots"
              type="circle"
              paint={{
                'circle-radius': 4,
                'circle-color': '#fff',
                'circle-stroke-color': '#000',
                'circle-stroke-width': 1,
              }}
            />
            <Layer
              id="terminal-marker-labels"
              type="symbol"
              layout={{
                'text-field': ['get', 'name'],
                'text-size': 12,
                'text-font': ['Open Sans Bold'],
                'text-offset': [0, -1.2],
                'text-anchor': 'bottom',
                'text-allow-overlap': true,
              }}
              paint={{
                'text-color': '#fff',
                'text-halo-color': 'rgba(0,0,0,0.8)',
                'text-halo-width': 2,
              }}
            />
          </Source>
        </MapGL>
        {/* Sticky info panel — always visible */}
        <div className="geo-sankey-panel">
          <div className="geo-sankey-panel-header">
            <strong>Total: {totalPassengers.toLocaleString()} passengers</strong>
          </div>
          {sortedFlows.map(f => {
            const key = flowKey(f)
            const active = hoveredKey === key
            const faded = hoveredKey && !active
            const color = MODE_COLORS[f.mode] ?? '#888'
            const modeIcon = MODE_ICON[f.mode]
            const agencies = CROSSING_AGENCY[f.crossing] ?? []
            return (
              <div
                key={key}
                className={`geo-sankey-panel-row${active ? ' active' : ''}${faded ? ' faded' : ''}`}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                {modeIcon && (
                  <span
                    className="geo-sankey-panel-icon-pill"
                    style={{ backgroundColor: color, borderRadius: 3, padding: '1px 2px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <span
                      className="geo-sankey-panel-icon"
                      style={{
                        backgroundColor: '#fff',
                        maskImage: `url(/icons/${modeIcon}.svg)`,
                        WebkitMaskImage: `url(/icons/${modeIcon}.svg)`,
                      }}
                    />
                  </span>
                )}
                {agencies.length > 1 ? (
                  <span style={{ position: 'relative', width: 28, height: 14, flexShrink: 0 }}>
                    {agencies.map((a, i) => (
                      <img
                        key={a} src={`/icons/${a}.svg`} alt={a}
                        style={{
                          height: 14, position: 'absolute', left: '50%', top: '50%',
                          transform: 'translate(-50%, -50%)',
                          ...(i > 0 ? { filter: 'brightness(0) invert(1)' } : {}),
                        }}
                      />
                    ))}
                  </span>
                ) : agencies.map(a => (
                  <img key={a} src={`/icons/${a}.svg`} alt={a} style={{ height: 14, flexShrink: 0 }} />
                ))}
                <span className="geo-sankey-panel-label">{displayName(f.crossing)}</span>
                <span className="geo-sankey-panel-value">
                  {f.passengers.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="controls" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: '0.5rem' }}>
        <Toggle
          options={[
            { value: 'entering', label: 'NJ\u2192NY' },
            { value: 'leaving', label: 'NY\u2192NJ' },
          ]}
          value={direction}
          onChange={v => setDirection(v as Direction)}
        />
        <Toggle
          options={TIMES.map(t => ({ value: t, label: { peak_1hr: '1hr', peak_period: '3hr', '24hr': 'day' }[t] }))}
          value={timePeriod}
          onChange={v => setTimePeriod(v as TimePeriod)}
        />
        <select
          value={String(selectedYear)}
          onChange={e => setYear(parseInt(e.target.value))}
          style={{
            background: 'var(--toggle-bg)',
            color: 'var(--toggle-text)',
            border: '1px solid var(--toggle-border)',
            borderRadius: '4px',
            padding: '0.25rem 0.4rem',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          {years.map(y => (
            <option key={y} value={String(y)}>'{String(y).slice(2)}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>px</span>
          <input
            type="range" min="0" max="1" step="0.05"
            value={geoScale}
            onChange={e => setGeoScale(parseFloat(e.target.value))}
            style={{ width: '60px' }}
          />
          <span>geo</span>
        </label>
      </div>
    </div>
  )
}

export default GeoSankeyInner
