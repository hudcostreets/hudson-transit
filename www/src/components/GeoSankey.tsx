import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import MapGL, { Source, Layer, Marker } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { CrossingRecord, Direction, TimePeriod } from '../lib/types'
import { DEFAULT_SCHEME } from '../lib/colors'
import { filterCrossings } from '../lib/transform'
import { useUrlState } from 'use-prms'
import Toggle from './Toggle'
import type { LatLon, FlowNode, FlowTree } from 'geo-sankey'
import {
  pxToHalfDeg, offsetPath,
  smoothPath,
  ribbonArrow,
  renderFlows, flowSources,
} from 'geo-sankey'

const { max } = Math

// Geographic paths from NJ portal/terminal → Manhattan CBD entry point.
// Each path is an array of [lat, lon] waypoints.
// Coordinates sourced from Wikipedia, Port Authority, GPS databases.
const CROSSING_PATHS: Record<string, LatLon[]> = {
  'Lincoln Tunnel': [
    [40.7710, -74.0370],  // NJ approach (extended west, Weehawken bluffs)
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
    [40.7580, -74.0350],  // NJ approach (south of Lincoln, Weehawken rail yards)
    [40.7555, -74.0170],  // mid-Hudson (parallel to Lincoln, just south)
    [40.7510, -74.0015],  // Manhattan portal (Penn Station, 10th Ave & 32nd St)
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



// Hob So split point: combined trunk E from terminal, then branches fan out
const HOB_SO_SPLIT: LatLon = [40.7359, -74.0230]
// Merge positions (referenced by both merge trees and split branches)
const UT_MERGE: LatLon = [40.7530, -74.0160]
const DT_MERGE: LatLon = [40.7142, -74.0210]

const FERRY_TREES: FlowTree[] = [
  {
    dest: 'MT39',
    destPos: [40.7555, -74.0060],
    root: {
      type: 'merge',
      pos: [40.7565, -74.0120],
      bearing: 110,
      children: [
        {
          type: 'merge',
          pos: UT_MERGE,
          bearing: 30,
          children: [
            // Weight-only placeholder (visual path drawn by split tree)
            { type: 'source', label: '', pos: UT_MERGE, weight: 0.15 },
            { type: 'source', label: 'Hob 14', pos: [40.7505, -74.0241], weight: 0.20, bearing: 90 },
          ],
        },
        { type: 'source', label: 'WHK', pos: [40.7771, -74.0136], weight: 0.30 },
      ],
    },
  },
  {
    dest: 'BPT',
    destPos: [40.7142, -74.0169],
    root: {
      type: 'merge',
      pos: DT_MERGE,
      bearing: 90,
      children: [
        { type: 'source', label: 'PH', pos: [40.7138, -74.0337], weight: 0.20 },
        // Weight-only placeholder (visual path drawn by split tree)
        { type: 'source', label: '', pos: DT_MERGE, weight: 0.15 },
      ],
    },
  },
  // Hob So split: combined trunk E, then N/S branches to merges
  {
    dest: 'Hob So',
    destPos: [40.7359, -74.0275],
    root: {
      type: 'split',
      pos: HOB_SO_SPLIT,
      bearing: 90,
      children: [
        // S branch (right of eastward flow) → DT merge
        { type: 'source', label: '', pos: DT_MERGE, weight: 0.15, bearing: 90 },
        // N branch (left of eastward flow) → UT sub-merge
        { type: 'source', label: '', pos: UT_MERGE, weight: 0.15, bearing: 90 },
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
const CROSSING_COLORS = DEFAULT_SCHEME.crossing

// Map (crossing, mode) → crossing color scheme key
const FLOW_COLOR_KEY: Record<string, string> = {
  'Lincoln Tunnel|Bus': 'Lincoln (Bus)',
  'Lincoln Tunnel|Autos': 'Lincoln (Autos)',
  'Amtrak/N.J. Transit Tunnels|Rail': 'Amtrak / NJ Transit',
  'Uptown PATH Tunnel|PATH': 'PATH (Uptown)',
  'Downtown PATH Tunnel|PATH': 'PATH (Downtown)',
  'Holland Tunnel|Bus': 'Holland (Bus)',
  'Holland Tunnel|Autos': 'Holland (Autos)',
  'All Ferry Points|Ferry': 'Ferries',
}

function flowColor(f: { crossing: string; mode: string }): string {
  const key = `${f.crossing}|${f.mode}`
  const crossingKey = FLOW_COLOR_KEY[key]
  if (crossingKey && CROSSING_COLORS[crossingKey]) return CROSSING_COLORS[crossingKey]
  return MODE_COLORS[f.mode] ?? '#888'
}

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

const REF_LAT = 40.74

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
  'Uptown PATH Tunnel': ['Hoboken', 'Christopher St'],
  'Downtown PATH Tunnel': ['Exchange Place', 'WTC PATH'],
}

// Manhattan-side terminus position per crossing (for inline legend placement)
const FLOW_TERMINUS: Record<string, LatLon> = {
  'Lincoln Tunnel': [40.7587, -73.9991],
  'Amtrak/N.J. Transit Tunnels': [40.7510, -74.0015],
  'Uptown PATH Tunnel': [40.7337, -74.0068],  // Christopher St (arrow tip)
  'Holland Tunnel': [40.7255, -74.0070],
  'Downtown PATH Tunnel': [40.7116, -74.0123],
  'All Ferry Points': [40.7450, -74.0180],     // mid-river, in empty area
}

// Manhattan-side terminus labels (always shown on map)
const MANHATTAN_TERMINI: { name: string; pos: LatLon }[] = [
  { name: 'PABT', pos: [40.7587, -73.9991] },           // Lincoln Tunnel → Port Authority
  { name: 'Penn Station', pos: [40.7510, -74.0015] },    // Amtrak/NJT
  { name: 'Hudson Sq', pos: [40.7255, -74.0070] },       // Holland Tunnel
  { name: 'Christopher St', pos: [40.7337, -74.0068] },   // Uptown PATH
  { name: 'WTC PATH', pos: [40.7116, -74.0123] },        // Downtown PATH
  { name: 'MT39', pos: [40.7555, -74.0060] },             // Ferry → waterfront between tunnels
  { name: 'BPT', pos: [40.7142, -74.0169] },              // Ferry → Brookfield Place
]

// Uptown PATH Manhattan station positions (for hover dots)
const UPTOWN_PATH_STATIONS: { name: string; pos: LatLon }[] = [
  { name: 'Christopher', pos: [40.7337, -74.0068] },
  { name: '9th', pos: [40.7338, -74.0020] },
  { name: '14th', pos: [40.7361, -73.9969] },
  { name: '23rd', pos: [40.7427, -73.9932] },
  // 33rd St PATH omitted — already rendered via TERMINAL_NAMES
]

// Uptown PATH fade start index (Christopher St = index 2 in CROSSING_PATHS)
const UPTOWN_FADE_START = 2

// Display names: since we show one direction at a time, use singular "Tunnel"
const DISPLAY_NAME: Record<string, string> = {
  'Amtrak/N.J. Transit Tunnels': 'Amtrak/NJT',
  'Uptown PATH Tunnel': 'Uptown PATH',
  'Downtown PATH Tunnel': 'Downtown PATH',
  'All Ferry Points': 'Ferries',
}
const MODE_SUFFIX: Record<string, Record<string, string>> = {
  'Lincoln Tunnel': { Bus: 'Lincoln (Bus)', Autos: 'Lincoln (Autos)' },
  'Holland Tunnel': { Bus: 'Holland (Bus)', Autos: 'Holland (Autos)' },
}
function displayName(crossing: string, mode?: string): string {
  if (mode && MODE_SUFFIX[crossing]?.[mode]) return MODE_SUFFIX[crossing][mode]
  return DISPLAY_NAME[crossing] ?? crossing
}

// Mode ordering for stacking
const MODE_ORDER = ['Autos', 'Bus', 'Rail', 'PATH', 'Ferries']

interface Props {
  data: CrossingRecord[]
}

const MAP_HEIGHT_KEY = 'geo-sankey-map-height'
const DEFAULT_MAP_HEIGHT = 750

function GeoSankeyInner({ data }: Props) {
  const [mapHeight, setMapHeight] = useState(() => {
    const stored = sessionStorage.getItem(MAP_HEIGHT_KEY)
    return stored ? parseInt(stored) : DEFAULT_MAP_HEIGHT
  })
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

  // Width scale: multiplier for arrow widths (default 1)
  const widthScaleParam = useMemo(() => ({
    encode: (v: number) => v === 1 ? null : v.toFixed(1),
    decode: (s: string | null): number => s != null ? parseFloat(s) : 1,
  }), [])
  const [widthScale, setWidthScale] = useUrlState('ws', widthScaleParam)

  // Hit padding: px radius around cursor for hover detection
  const hitPadParam = useMemo(() => ({
    encode: (v: number) => v === 4 ? null : String(v),
    decode: (s: string | null): number => s != null ? parseInt(s) : 4,
  }), [])
  const [hitPad, setHitPad] = useUrlState('hp', hitPadParam)

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

  // Panel sort: geographic (N→S) or desc by passenger count
  const [sortDesc, setSortDesc] = useState(false)
  const [inlineLegend, setInlineLegend] = useState(false)

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
      if (sortDesc) return b.passengers - a.passengers
      const ai = crossingOrder.indexOf(a.crossing)
      const bi = crossingOrder.indexOf(b.crossing)
      const ci = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      if (ci !== 0) return ci
      return MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode)
    })
  }, [flows, sortDesc])

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
    function poly(props: Record<string, any>, ring: [number, number][]): GeoJSON.Feature {
      return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } }
    }

    const features: GeoJSON.Feature[] = []
    for (const [, crossingFlows] of byCrossing) {
      crossingFlows.sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode))
      crossingFlows.forEach((f, i) => {
        const key = flowKey(f)
        const color = flowColor(f)

        // Ferry Sankey: delegate to geo-sankey library (with compilation)
        if (f.isFerry) {
          const totalPax = f.passengers
          const pxPerWeight = (weight: number) =>
            max(1, (Math.round(totalPax * weight) / maxPassengers) * 30 * widthScale)
          const fc = renderFlows(FERRY_TREES, {
            refLat: REF_LAT, zoom, geoScale,
            color, key,
            pxPerWeight,
            arrowWing: ARROW_WING, arrowLen: ARROW_LEN,
            reverse: direction === 'leaving',
            // TODO: singlePoly doesn't work with cross-tree split→merge coordination yet
            // singlePoly: true,
          })
          features.push(...fc.features)
          return
        }

        const lateralOffset = i - (crossingFlows.length - 1) / 2
        let path = offsetPath(f.path, lateralOffset)
        if (direction === 'leaving') path = [...path].reverse()
        const width = max(1, (f.passengers / maxPassengers) * 30 * widthScale)
        const hw = pxToHalfDeg(width, zoom, geoScale, REF_LAT)

        // Uptown PATH: smooth curve, arrow ends at Christopher St
        if (f.crossing === 'Uptown PATH Tunnel' && path.length > 2) {
          const { path: smooth, knots } = smoothPath(path)
          const fadeIdx = knots[UPTOWN_FADE_START]
          const shortPath = smooth.slice(0, fadeIdx + 1)
          const ring = ribbonArrow(shortPath, hw, REF_LAT, { arrowWingFactor: ARROW_WING, arrowLenFactor: ARROW_LEN, widthPx: width })
          if (ring.length) {
            features.push(poly({ color, width, key, opacity: 1 }, ring))
          }
        } else {
          // Normal flow: ribbon + arrowhead as one polygon
          const ring = ribbonArrow(path, hw, REF_LAT, { arrowWingFactor: ARROW_WING, arrowLenFactor: ARROW_LEN, widthPx: width })
          if (ring.length) {
            features.push(poly({ color, width, key, opacity: 1 }, ring))
          }
        }
      })
    }

    // Sort widest first so narrower flows draw on top
    features.sort((a, b) => (b.properties?.width ?? 0) - (a.properties?.width ?? 0))
    return { type: 'FeatureCollection' as const, features }
  }, [flows, direction, maxPassengers, mapView.zoom, geoScale, widthScale])



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
        properties: { name: displayName(f.crossing, f.mode) },
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
        for (const src of flowSources(tree.root)) {
          if (!src.label) continue
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
    // Uptown PATH terminates at Christopher St (index 2), not 33rd St
    const end = hovered.crossing === 'Uptown PATH Tunnel'
      ? hovered.path[UPTOWN_FADE_START]
      : hovered.path[hovered.path.length - 1]
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


    return { type: 'FeatureCollection' as const, features }
  }, [hoveredKey, flows])

  // Map hover: query a padded bbox around cursor, then pick the feature
  // whose polygon edge is closest to the cursor. Distance 0 = cursor is
  // inside the polygon. Among ties, narrower (drawn on top) wins.
  const onMouseMove = useCallback((e: any) => {
    // Don't override hover set by inline labels
    const target = e.originalEvent?.target as HTMLElement | undefined
    if (target?.closest?.('.geo-sankey-inline-label')) return
    const map = mapRef.current?.getMap()
    if (!map) return
    const { point } = e
    const bbox: [[number, number], [number, number]] = [
      [point.x - hitPad, point.y - hitPad],
      [point.x + hitPad, point.y + hitPad],
    ]
    const features = map.queryRenderedFeatures(bbox, { layers: ['flow-fills'] })
    if (!features?.length) { setHoveredKey(null); return }

    // Point-in-polygon test (ray casting) in screen coords
    function pointInPolygon(coords: [number, number][]): boolean {
      var inside = false
      var pts = coords.map(c => map!.project(c as [number, number]))
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var yi = pts[i].y, yj = pts[j].y, xi = pts[i].x, xj = pts[j].x
        if ((yi > point.y) !== (yj > point.y) &&
            point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
          inside = !inside
        }
      }
      return inside
    }

    // Compute min distance from cursor to each polygon's edges (in screen px)
    function distToPolygon(coords: [number, number][]): number {
      let minD = Infinity
      for (let i = 0; i < coords.length - 1; i++) {
        const a = map!.project(coords[i] as [number, number])
        const b = map!.project(coords[i + 1] as [number, number])
        // Point-to-segment distance
        const dx = b.x - a.x, dy = b.y - a.y
        const len2 = dx * dx + dy * dy
        let t = len2 > 0 ? ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2 : 0
        t = Math.max(0, Math.min(1, t))
        const px = a.x + t * dx, py = a.y + t * dy
        const d = Math.sqrt((point.x - px) ** 2 + (point.y - py) ** 2)
        if (d < minD) minD = d
      }
      return minD
    }

    // Group by base key: track inside (point-in-polygon) and edge distance
    const byKey = new Map<string, { inside: boolean; dist: number; width: number }>()
    for (const f of features) {
      const key: string = f.properties?.key?.replace(/\|(short|full)$/, '') ?? ''
      const w: number = f.properties?.width ?? 0
      const coords = (f.geometry as any)?.coordinates?.[0] as [number, number][] | undefined
      if (!coords?.length) continue
      const ins = pointInPolygon(coords)
      const dist = ins ? 0 : distToPolygon(coords)
      const prev = byKey.get(key)
      if (!prev || (ins && !prev.inside) || (ins === prev.inside && dist < prev.dist)) {
        byKey.set(key, { inside: ins, dist, width: w })
      }
    }

    // Pick: cursor-inside polygons beat cursor-outside (padding hits).
    // Among cursor-inside ties, narrower (drawn on top) wins.
    // Among cursor-outside ties, closest edge wins.
    let bestKey = '', bestInside = false, bestDist = Infinity, bestW = Infinity
    for (const [key, { inside, dist, width }] of byKey) {
      if (inside && !bestInside) {
        bestKey = key; bestInside = inside; bestDist = dist; bestW = width
      } else if (inside === bestInside) {
        if (inside) {
          // Both inside: narrower (drawn on top) wins
          if (width < bestW) { bestKey = key; bestDist = dist; bestW = width }
        } else {
          // Both outside: closer edge wins
          if (dist < bestDist) { bestKey = key; bestDist = dist; bestW = width }
        }
      }
    }
    setHoveredKey(bestKey || null)
  }, [hitPad])
  const onMouseLeave = useCallback(() => setHoveredKey(null), [])

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

  const [fullscreen, setFullscreen] = useState(false)
  const mapFocusedRef = useRef(false)
  const [mapFocused, setMapFocused] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const focusMap = useCallback(() => {
    if (mapFocusedRef.current) return
    mapFocusedRef.current = true
    setMapFocused(true)
    mapRef.current?.getMap()?.scrollZoom.enable()
  }, [])
  const unfocusMap = useCallback(() => {
    if (!mapFocusedRef.current) return
    mapFocusedRef.current = false
    setMapFocused(false)
    mapRef.current?.getMap()?.scrollZoom.disable()
  }, [])
  // Click outside map container → unfocus
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!mapFocusedRef.current) return
      if (mapContainerRef.current?.contains(e.target as Node)) return
      unfocusMap()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [unfocusMap])
  // Intercept wheel events to prevent page scroll when map is focused
  useEffect(() => {
    const el = mapContainerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (mapFocusedRef.current || fullscreen) e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [fullscreen])
  // Enable scroll zoom in fullscreen
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    if (fullscreen) map.scrollZoom.enable()
    else if (!mapFocusedRef.current) map.scrollZoom.disable()
  }, [fullscreen])
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  return (
    <div className={`geo-sankey${fullscreen ? ' geo-sankey-fullscreen' : ''}`}>
      {!fullscreen && <h2>Passenger Flows by Mode</h2>}
      {!fullscreen && <p className="chart-subtitle">{dirLabel}, {timeLabels[timePeriod]}, {selectedYear}</p>}
      <div
        ref={mapContainerRef}
        style={fullscreen
          ? { width: '100%', flex: 1, position: 'relative', minHeight: 0 }
          : {
              width: '100%', height: `${mapHeight}px`, position: 'relative', borderRadius: '8px', overflow: 'hidden', resize: 'vertical', minHeight: 300, maxHeight: 1200,
              outline: mapFocused ? '2px solid rgba(100, 160, 255, 0.5)' : 'none',
            }
        }
        onMouseUp={e => {
          if (fullscreen) return
          const el = e.currentTarget
          const h = el.offsetHeight
          if (h !== mapHeight) { setMapHeight(h); sessionStorage.setItem(MAP_HEIGHT_KEY, String(h)) }
        }}
      >
        <MapGL
          ref={mapRef}
          longitude={mapView.lng}
          latitude={mapView.lat}
          zoom={mapView.zoom}
          onMove={e => setMapView({ lat: e.viewState.latitude, lng: e.viewState.longitude, zoom: e.viewState.zoom })}
          style={{ width: '100%', height: '100%' }}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          onLoad={() => { if (!fullscreen) mapRef.current?.getMap()?.scrollZoom.disable() }}
          onClick={focusMap}
          onMouseMove={onMouseMove}
          onMouseLeave={() => { onMouseLeave(); unfocusMap() }}
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
                'text-size': 12,
                'text-font': ['Open Sans Bold'],
                'text-offset': [0, -1],
                'text-anchor': 'bottom',
                'text-allow-overlap': true,
              }}
              paint={{
                'text-color': '#ddd',
                'text-halo-color': '#000',
                'text-halo-width': 2,
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
                'text-offset': [
                  'case',
                  ['==', ['get', 'anchor'], 'top-left'], ['literal', [0.8, 0.8]],
                  ['literal', [0, -1.2]],
                ],
                'text-anchor': [
                  'case',
                  ['==', ['get', 'anchor'], 'top-left'], 'top-left',
                  'bottom',
                ],
                'text-allow-overlap': true,
              }}
              paint={{
                'text-color': '#fff',
                'text-halo-color': 'rgba(0,0,0,0.8)',
                'text-halo-width': 2,
              }}
            />
          </Source>
          {/* Inline legend: flow labels at termini, grouped by crossing */}
          {inlineLegend && (() => {
            const byCrossing = new Map<string, FlowDatum[]>()
            for (const f of sortedFlows) {
              const arr = byCrossing.get(f.crossing) ?? []
              arr.push(f)
              byCrossing.set(f.crossing, arr)
            }
            return [...byCrossing.entries()].map(([crossing, cFlows]) => {
              const pos = FLOW_TERMINUS[crossing]
              if (!pos) return null
              return (
                <Marker key={crossing} longitude={pos[1]} latitude={pos[0]} anchor="top-left"
                  style={{ pointerEvents: 'auto' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {cFlows.map(f => {
                      const key = flowKey(f)
                      const active = hoveredKey === key
                      const faded = hoveredKey && !active
                      const color = flowColor(f)
                      const modeIcon = MODE_ICON[f.mode]
                      const agencies = CROSSING_AGENCY[f.crossing] ?? []
                      return (
                        <div
                          key={key}
                          className={`geo-sankey-inline-label${active ? ' active' : ''}${faded ? ' faded' : ''}`}
                          onMouseEnter={() => setHoveredKey(key)}
                          onMouseLeave={() => setHoveredKey(null)}
                        >
                          {modeIcon && (
                            <span style={{ backgroundColor: color, borderRadius: 3, padding: '1px 2px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span className="geo-sankey-panel-icon" style={{
                                backgroundColor: '#fff',
                                maskImage: `url(/icons/${modeIcon}.svg)`,
                                WebkitMaskImage: `url(/icons/${modeIcon}.svg)`,
                              }} />
                            </span>
                          )}
                          {agencies.map(a => (
                            <img key={a} src={`/icons/${a}.svg`} alt={a} style={{ flexShrink: 0 }} />
                          ))}
                          <span style={{ whiteSpace: 'nowrap' }}>{displayName(f.crossing, f.mode)}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>
                            {f.passengers.toLocaleString()}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </Marker>
              )
            })
          })()}
        </MapGL>
        {/* Sticky info panel */}
        <div className="geo-sankey-panel">
          <div className="geo-sankey-panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: '14px' }}>Total: {totalPassengers.toLocaleString()}</strong>
            <span style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setSortDesc(d => !d)}
                title={sortDesc ? 'Sorted by count' : 'Sorted N→S'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: '#aaa', fontSize: '14px', lineHeight: 1 }}
              >{sortDesc ? '↓' : '↕'}</button>
              <button
                onClick={() => setInlineLegend(v => !v)}
                title={inlineLegend ? 'Panel legend' : 'Inline legend'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: '#aaa', fontSize: '13px', lineHeight: 1 }}
              >{inlineLegend ? '☰' : '📍'}</button>
              <button
                onClick={() => setFullscreen(f => !f)}
                title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: '#aaa', fontSize: '13px', lineHeight: 1 }}
              >{fullscreen ? '✕' : '⛶'}</button>
            </span>
          </div>
          {!inlineLegend && sortedFlows.map(f => {
            const key = flowKey(f)
            const active = hoveredKey === key
            const faded = hoveredKey && !active
            const color = flowColor(f)
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
                  <span style={{ position: 'relative', width: 32, height: 18, flexShrink: 0 }}>
                    {agencies.map((a, i) => (
                      <img
                        key={a} src={`/icons/${a}.svg`} alt={a}
                        style={{
                          height: 18, position: 'absolute', left: '50%', top: '50%',
                          transform: 'translate(-50%, -50%)',
                          ...(i > 0 ? { filter: 'brightness(0) invert(1)' } : {}),
                        }}
                      />
                    ))}
                  </span>
                ) : agencies.map(a => (
                  <img key={a} src={`/icons/${a}.svg`} alt={a} style={{ height: 18, flexShrink: 0 }} />
                ))}
                <span className="geo-sankey-panel-label">{displayName(f.crossing, f.mode)}</span>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>width</span>
          <input
            type="range" min="0.3" max="2" step="0.1"
            value={widthScale}
            onChange={e => setWidthScale(parseFloat(e.target.value))}
            style={{ width: '60px' }}
          />
          <span>{widthScale.toFixed(1)}×</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>hover</span>
          <input
            type="range" min="0" max="20" step="1"
            value={hitPad}
            onChange={e => setHitPad(parseInt(e.target.value))}
            style={{ width: '50px' }}
          />
          <span>{hitPad}px</span>
        </label>
      </div>
    </div>
  )
}

export default GeoSankeyInner
