import { useMemo, useState, useCallback, useRef } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import MapGL, { Source, Layer } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { CrossingRecord, Direction, TimePeriod } from '../lib/types'
import { DEFAULT_SCHEME } from '../lib/colors'
import { filterCrossings } from '../lib/transform'
import { useUrlState } from 'use-prms'
import Toggle from './Toggle'

const { sqrt, max, PI, sin, cos, atan2 } = Math

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

// S-curve: depart east (perpendicular to N-S shore), arrive east into dest
function sBezier(start: LatLon, end: LatLon): LatLon[] {
  const dLon = end[1] - start[1]
  const cp1: LatLon = [start[0], start[1] + Math.abs(dLon) * 0.5]
  const cp2: LatLon = [end[0], end[1] - Math.abs(dLon) * 0.5]
  return cubicBezier(start, cp1, cp2, end)
}

// Ferry Sankey groups: branches from NJ sources merge at a point, then a
// thick trunk continues to the Manhattan destination.
interface FerryGroup {
  dest: string
  destPos: LatLon
  mergePos: LatLon
  sources: { label: string; pos: LatLon; weight: number }[]
}

const FERRY_GROUPS: FerryGroup[] = [
  {
    dest: 'MT39',
    destPos: [40.7603, -74.0032],   // W 39th St / Pier 79 (Manhattan)
    mergePos: [40.7580, -74.0130],  // merge mid-Hudson
    sources: [
      { label: 'WHK', pos: [40.7771, -74.0136], weight: 0.30 },
      { label: 'Hob 14', pos: [40.7505, -74.0241], weight: 0.20 },
      { label: 'Hob So', pos: [40.7359, -74.0282], weight: 0.15 },
    ],
  },
  {
    dest: 'BPT',
    destPos: [40.7142, -74.0169],   // Brookfield Place (Manhattan)
    mergePos: [40.7160, -74.0260],  // merge mid-Hudson
    sources: [
      { label: 'Hob So', pos: [40.7359, -74.0282], weight: 0.15 },
      { label: 'PH', pos: [40.7138, -74.0337], weight: 0.20 },
    ],
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
  const [geoScale, setGeoScale] = useState(0.6)

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

  // Build GeoJSON for flow lines (visible + invisible hit-target layers)
  const geojson = useMemo(() => {
    const byCrossing = new Map<string, FlowDatum[]>()
    for (const f of flows) {
      const arr = byCrossing.get(f.crossing) ?? []
      arr.push(f)
      byCrossing.set(f.crossing, arr)
    }

    // Uptown PATH: full opacity Hoboken→Christopher St (idx 0-2),
    // then fading gradient continuing past to 33rd St (idx 2-6).
    // Christopher St gets a proper arrowhead; the fade is a "ghost" extension.
    const UPTOWN_NODE_OPACITY = [1, 1, 1, 0.55, 0.30, 0.12, 0.03]
    const FADE_SUBDIVISIONS = 5

    function lerp(a: LatLon, b: LatLon, t: number): LatLon {
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }

    const features: GeoJSON.Feature[] = []
    for (const [, crossingFlows] of byCrossing) {
      crossingFlows.sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode))
      crossingFlows.forEach((f, i) => {
        const key = flowKey(f)
        const color = MODE_COLORS[f.mode] ?? '#888'

        // Ferry Sankey: smooth bezier branches merging into trunks
        if (f.isFerry) {
          const totalPax = f.passengers
          for (const group of FERRY_GROUPS) {
            const groupWeight = group.sources.reduce((s, src) => s + src.weight, 0)
            const trunkPax = Math.round(totalPax * groupWeight)
            const trunkWidth = max(1, (trunkPax / maxPassengers) * 30)

            // Trunk: merge → dest (smooth S-curve)
            let trunkPath = sBezier(group.mergePos, group.destPos)
            if (direction === 'leaving') trunkPath = [...trunkPath].reverse()
            features.push({
              type: 'Feature',
              properties: { crossing: f.crossing, mode: f.mode, passengers: totalPax, color, width: trunkWidth, key, opacity: 1 },
              geometry: { type: 'LineString', coordinates: toGeoJSON(trunkPath) },
            })

            // Branches: each NJ source → merge (smooth S-curve)
            for (const src of group.sources) {
              const branchPax = Math.round(totalPax * src.weight)
              const branchWidth = max(1, (branchPax / maxPassengers) * 30)
              let branchPath = sBezier(src.pos, group.mergePos)
              if (direction === 'leaving') branchPath = [...branchPath].reverse()
              features.push({
                type: 'Feature',
                properties: { crossing: f.crossing, mode: f.mode, passengers: totalPax, color, width: branchWidth, key, opacity: 1 },
                geometry: { type: 'LineString', coordinates: toGeoJSON(branchPath) },
              })
            }
          }
          return
        }

        const lateralOffset = i - (crossingFlows.length - 1) / 2
        let path = offsetPath(f.path, lateralOffset)
        if (direction === 'leaving') path = [...path].reverse()
        const width = max(1, (f.passengers / maxPassengers) * 30)

        // Uptown PATH: solid line to Christopher St, then fading gradient extension
        if (f.crossing === 'Uptown PATH Tunnel' && path.length > 2) {
          // Solid segment: Hoboken → Christopher St (indices 0..UPTOWN_FADE_START)
          const solidPath = path.slice(0, UPTOWN_FADE_START + 1)
          features.push({
            type: 'Feature',
            properties: { crossing: f.crossing, mode: f.mode, passengers: f.passengers, color, width, key, opacity: 1 },
            geometry: { type: 'LineString', coordinates: toGeoJSON(solidPath) },
          })
          // Fading segments: Christopher St → 33rd St (indices UPTOWN_FADE_START..end)
          for (let s = UPTOWN_FADE_START; s < path.length - 1; s++) {
            const oA = UPTOWN_NODE_OPACITY[s] ?? 0
            const oB = UPTOWN_NODE_OPACITY[s + 1] ?? 0
            for (let sub = 0; sub < FADE_SUBDIVISIONS; sub++) {
              const t0 = sub / FADE_SUBDIVISIONS
              const t1 = (sub + 1) / FADE_SUBDIVISIONS
              const p0 = lerp(path[s], path[s + 1], t0)
              const p1 = lerp(path[s], path[s + 1], t1)
              const opacity = oA + (oB - oA) * ((t0 + t1) / 2)
              features.push({
                type: 'Feature',
                properties: { crossing: f.crossing, mode: f.mode, passengers: f.passengers, color, width, key, opacity },
                geometry: { type: 'LineString', coordinates: toGeoJSON([p0, p1]) },
              })
            }
          }
        } else {
          features.push({
            type: 'Feature',
            properties: { crossing: f.crossing, mode: f.mode, passengers: f.passengers, color, width, key, opacity: 1 },
            geometry: { type: 'LineString', coordinates: toGeoJSON(path) },
          })
        }
      })
    }

    return { type: 'FeatureCollection' as const, features }
  }, [flows, direction, maxPassengers])

  // Compute bearing from prev→end (degrees, 0=north, clockwise)
  function bearing(prev: LatLon, end: LatLon): number {
    const dLon = (end[1] - prev[1]) * PI / 180
    const lat1 = prev[0] * PI / 180
    const lat2 = end[0] * PI / 180
    const y = sin(dLon) * cos(lat2)
    const x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
    return (atan2(y, x) * 180 / PI + 360) % 360
  }

  // Arrowhead points at the end of each flow line, with bearing for rotation
  const arrowsGeojson = useMemo(() => {
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
        const color = MODE_COLORS[f.mode] ?? '#888'

        // Ferry: arrows at each trunk endpoint (Manhattan destinations)
        if (f.isFerry) {
          for (const group of FERRY_GROUPS) {
            const groupWeight = group.sources.reduce((s, src) => s + src.weight, 0)
            const trunkWidth = max(1, (Math.round(f.passengers * groupWeight) / maxPassengers) * 30)
            const trunkPath = sBezier(group.mergePos, group.destPos)
            const path = direction === 'leaving' ? [...trunkPath].reverse() : trunkPath
            const end = path[path.length - 1]
            const prev = path[path.length - 2]
            features.push({
              type: 'Feature',
              properties: { color, bearing: bearing(prev, end), width: trunkWidth, key, opacity: 1 },
              geometry: { type: 'Point', coordinates: [end[1], end[0]] },
            })
          }
          return
        }

        const lateralOffset = i - (crossingFlows.length - 1) / 2
        let path = offsetPath(f.path, lateralOffset)
        if (direction === 'leaving') path = [...path].reverse()
        const end = path[path.length - 1]
        const prev = path[path.length - 2] ?? path[0]
        const width = max(1, (f.passengers / maxPassengers) * 30)

        if (f.crossing === 'Uptown PATH Tunnel') {
          // Primary arrow at Christopher St (the solid-line terminus)
          const fadeStart = UPTOWN_FADE_START
          const christopherPt = path[fadeStart]
          const christopherPrev = path[fadeStart - 1] ?? path[0]
          features.push({
            type: 'Feature',
            properties: { color, bearing: bearing(christopherPrev, christopherPt), width, key, opacity: 1 },
            geometry: { type: 'Point', coordinates: [christopherPt[1], christopherPt[0]] },
          })
        } else {
          features.push({
            type: 'Feature',
            properties: { color, bearing: bearing(prev, end), width, key, opacity: 1 },
            geometry: { type: 'Point', coordinates: [end[1], end[0]] },
          })
        }
      })
    }
    return { type: 'FeatureCollection' as const, features }
  }, [flows, direction, maxPassengers])

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
      for (const group of FERRY_GROUPS) {
        // Destination
        const dKey = `${group.destPos}`
        if (!seen.has(dKey)) {
          seen.add(dKey)
          features.push({
            type: 'Feature',
            properties: { name: group.dest, anchor: 'left' },
            geometry: { type: 'Point', coordinates: [group.destPos[1], group.destPos[0]] },
          })
        }
        // Sources
        for (const src of group.sources) {
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

  // Line width expression: blend between fixed-px (geoScale=0) and geo-scaled (geoScale=1)
  // At reference zoom 12, width = data value. Geo-scaled means width doubles per zoom level.
  const zoomFactor = useMemo(() => {
    if (geoScale === 0) return null
    const base = Math.pow(2, geoScale)
    const lo = Math.pow(2, -2 * geoScale)
    const hi = Math.pow(2, 2 * geoScale)
    return { base, lo, hi }
  }, [geoScale])

  const lineWidth = useMemo(() => {
    if (!zoomFactor) return ['get', 'width'] as any
    return [
      'interpolate', ['exponential', zoomFactor.base], ['zoom'],
      10, ['*', ['get', 'width'], zoomFactor.lo],
      12, ['get', 'width'],
      14, ['*', ['get', 'width'], zoomFactor.hi],
    ] as any
  }, [zoomFactor])

  // Arrow icon-size: same zoom scaling as line-width, divided by canvas px (40)
  const arrowSize = useMemo(() => {
    const baseExpr = ['max', 0.08, ['/', ['get', 'width'], 40]] as any
    if (!zoomFactor) return baseExpr
    return [
      'interpolate', ['exponential', zoomFactor.base], ['zoom'],
      10, ['max', 0.08, ['/', ['*', ['get', 'width'], zoomFactor.lo], 40]],
      12, baseExpr,
      14, ['max', 0.08, ['/', ['*', ['get', 'width'], zoomFactor.hi], 40]],
    ] as any
  }, [zoomFactor])

  // Line opacity expression: per-feature opacity * hover state.
  // When hovering Uptown PATH, override faded segments to full opacity.
  const lineOpacity = useMemo(() => {
    if (!hoveredKey) return ['*', ['get', 'opacity'], 0.8] as any
    return [
      'case',
      ['==', ['get', 'key'], hoveredKey], 1,
      ['*', ['get', 'opacity'], 0.25],
    ] as any
  }, [hoveredKey])

  // Add arrow triangle image to map
  const mapRef = useRef<MapRef>(null)
  const addArrowImage = useCallback((map: any) => {
    if (map.hasImage('arrow')) return
    // Arrowhead: tip at top-center, base fills full width at bottom.
    // Wide canvas so base flares beyond line width. No margins so
    // base is flush with icon-anchor: 'bottom' at line endpoint.
    const w = 64, h = 48
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)  // tip (top center)
    ctx.lineTo(w, h)      // right base (bottom-right corner)
    ctx.lineTo(0, h)      // left base (bottom-left corner)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    const imageData = ctx.getImageData(0, 0, w, h)
    map.addImage('arrow', imageData, { sdf: true })
  }, [])
  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (map) addArrowImage(map)
  }, [addArrowImage])
  const onStyleImageMissing = useCallback((e: any) => {
    if (e.id === 'arrow') {
      const map = mapRef.current?.getMap()
      if (map) addArrowImage(map)
    }
  }, [addArrowImage])

  const dirLabel = direction === 'entering' ? 'NJ\u2192NY' : 'NY\u2192NJ'
  const timeLabels: Record<TimePeriod, string> = {
    peak_1hr: direction === 'entering' ? '8-9am' : '5-6pm',
    peak_period: direction === 'entering' ? '7-10am' : '4-7pm',
    '24hr': '24hr',
  }

  return (
    <div className="geo-sankey">
      <h2>Passenger Flows by Mode</h2>
      <p className="subtitle">{dirLabel}, {timeLabels[timePeriod]}, {selectedYear}</p>
      <div style={{ width: '100%', height: '500px', position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
        <MapGL
          ref={mapRef}
          onLoad={onMapLoad}
          onStyleImageMissing={onStyleImageMissing}
          initialViewState={{
            longitude: MAP_CENTER[0],
            latitude: MAP_CENTER[1],
            zoom: 11.8,
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          interactiveLayerIds={['flow-hit-target']}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          cursor={hoveredKey ? 'pointer' : ''}
        >
          <Source id="flows" type="geojson" data={geojson}>
            {/* Invisible wide hit-target layer for easier hovering */}
            <Layer
              id="flow-hit-target"
              type="line"
              paint={{
                'line-color': 'transparent',
                'line-width': 24,
              }}
            />
            {/* Visible flow lines */}
            <Layer
              id="flow-lines"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': lineWidth,
                'line-opacity': lineOpacity,
              }}
              layout={{
                'line-cap': 'butt',
                'line-join': 'round',
              }}
            />
          </Source>
          {/* Arrowheads at flow endpoints */}
          <Source id="arrows" type="geojson" data={arrowsGeojson}>
            <Layer
              id="flow-arrows"
              type="symbol"
              layout={{
                'icon-image': 'arrow',
                'icon-size': arrowSize,
                'icon-rotate': ['get', 'bearing'],
                'icon-rotation-alignment': 'map',
                'icon-allow-overlap': true,
                'icon-anchor': 'bottom',
              }}
              paint={{
                'icon-color': ['get', 'color'],
                'icon-opacity': hoveredKey
                  ? ['*', ['get', 'opacity'], ['case', ['==', ['get', 'key'], hoveredKey], 1, 0.25]] as any
                  : ['*', ['get', 'opacity'], 0.8] as any,
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
            const icon = MODE_ICON[f.mode]
            return (
              <div
                key={key}
                className={`geo-sankey-panel-row${active ? ' active' : ''}${faded ? ' faded' : ''}`}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                {icon && (
                  <span
                    className="geo-sankey-panel-icon"
                    style={{
                      backgroundColor: color,
                      maskImage: `url(/icons/${icon}.svg)`,
                      WebkitMaskImage: `url(/icons/${icon}.svg)`,
                    }}
                  />
                )}
                <span className="geo-sankey-panel-label">{displayName(f.crossing)}</span>
                <span className="geo-sankey-panel-mode" style={{ color }}>
                  {f.mode}
                </span>
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
        <Toggle
          options={years.map(y => ({ value: String(y), label: `'${String(y).slice(2)}` }))}
          value={String(selectedYear)}
          onChange={v => setYear(parseInt(v))}
        />
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
