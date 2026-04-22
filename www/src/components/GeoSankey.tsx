import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import MapGL, { Source, Layer, Marker } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { CrossingRecord, Direction, TimePeriod } from '../lib/types'
import { DEFAULT_SCHEME } from '../lib/colors'
import { filterCrossings } from '../lib/transform'
import { useUrlState } from 'use-prms'
import Toggle from './Toggle'
import type { LatLon, FlowGraph } from 'geo-sankey'
import {
  pxToHalfDeg, pxToDeg, offsetPath,
  smoothPath,
  ribbonArrow,
  renderFlowGraphSinglePoly, renderNodes,
  flowFillPaint,
} from 'geo-sankey'
import {
  useGraphState, useGraphSelection, useGraphMutations,
  useNodeDrag, useSceneIO,
  NodeOverlay,
} from 'geo-sankey/react'

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



// FlowGraph literal for the ferry Sankey. Positions/bearings/velocities
// round-tripped from the geo-sankey editor (specs/ferry-graph.json).
// Source-edge weights (30/20/30/20) sum to FERRY_WEIGHT_TOTAL and are
// normalized to passenger fractions in the pxPerWeight callback below.
const FERRY_WEIGHT_TOTAL = 100
const FERRY_GRAPH: FlowGraph = {
  nodes: [
    { id: 'bpt',       pos: [40.71500873644837, -74.01763141805306], bearing: 100, label: 'Brookfield Place' },
    { id: 'dt-merge',  pos: [40.715562912131446, -74.02118470868655], bearing: 104 },
    { id: 'hob-14',    pos: [40.75391277970118, -74.0231608871139],   bearing: 100, velocity: 0.007159651779943488, label: 'Hob 14th' },
    { id: 'hob-so',    pos: [40.73536254629653, -74.02793860498223],  bearing: 104, velocity: 0.002403020923443469, label: 'Hob So' },
    { id: 'hob-split', pos: [40.73492379942883, -74.0255833826839],   bearing: 101 },
    { id: 'mt-merge',  pos: [40.75994551185576, -74.00787150192113],  bearing: 110 },
    { id: 'mt39',      pos: [40.7574314723291, -73.99965492075728],   bearing: 110, label: 'MT 39th St' },
    { id: 'ph',        pos: [40.71386196262006, -74.03248345388602],  bearing: 100, label: 'Paulus Hook' },
    { id: 'ut-merge',  pos: [40.75667266380634, -74.01384177043765],  bearing: 30 },
    { id: 'whk',       pos: [40.77684409809737, -74.01108054584255],  bearing: 116, velocity: 0.013192930858358846, label: 'Weehawken' },
  ],
  edges: [
    { from: 'dt-merge',  to: 'bpt',       weight: 'auto' },
    { from: 'hob-14',    to: 'ut-merge',  weight: 20 },
    { from: 'hob-so',    to: 'hob-split', weight: 30 },
    { from: 'hob-split', to: 'dt-merge',  weight: 15 },
    { from: 'hob-split', to: 'ut-merge',  weight: 15 },
    { from: 'mt-merge',  to: 'mt39',      weight: 'auto' },
    { from: 'ph',        to: 'dt-merge',  weight: 20 },
    { from: 'ut-merge',  to: 'mt-merge',  weight: 'auto' },
    { from: 'whk',       to: 'mt-merge',  weight: 30 },
  ],
}

function reverseGraph(g: FlowGraph): FlowGraph {
  return {
    nodes: g.nodes,
    edges: g.edges.map(e => ({ ...e, from: e.to, to: e.from })),
  }
}

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
  'All Ferry Points': [40.7450, -74.0170],     // approx bezier lng of hob-split → ut-merge at lat 40.7450; marker + 10px offset keeps LI a fixed px distance east of the trace at any zoom
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
  const [inlineLegend, setInlineLegend] = useUrlState('il', {
    encode: (v: boolean) => v ? '1' : undefined,
    decode: (s: string | null) => s === '1',
  })

  const mapRef = useRef<MapRef>(null)

  // Ferry graph editor state. Hooks are called unconditionally (React rules);
  // the graph only *appears* editable in the UI when `editMode` is true. The
  // rendered ferry Sankey always reads from `ferryGS.graph` so edits are
  // reflected live without re-wiring the render path.
  const ferryGS = useGraphState(FERRY_GRAPH)
  const ferrySel = useGraphSelection(ferryGS.graph)
  const ferryMut = useGraphMutations(ferryGS, ferrySel)
  const ferryDrag = useNodeDrag(mapRef, ferryGS, ferrySel)
  const ferryIO = useSceneIO({
    graph: ferryGS.graph,
    opts: {
      color: '#14B8A6', pxPerWeight: 0.15, refLat: REF_LAT,
      wing: 0.4, angle: 60, bezierN: 20, nodeApproach: 0.5,
      widthScale: 1, creaseSkip: 1,
    },
    view: { lat: mapView.lat, lng: mapView.lng, zoom: mapView.zoom },
    title: 'hbt-ferry-flows',
    pushGraph: ferryGS.pushGraph,
    applyOpts: () => { /* ferry render opts are not editable from the scene for now */ },
    setView: v => setMapView({ lat: v.lat, lng: v.lng, zoom: v.zoom }),
    mapRef,
  })

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

  // Hover state: key is "crossing|mode", shared between map and panel.
  // `pinnedKey` is set by clicking a legend row and persists until the user
  // clicks outside any legend row — then it's cleared.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [pinnedKey, setPinnedKey] = useState<string | null>(null)
  const activeKey = pinnedKey ?? hoveredKey
  // Edit mode is implicit: the ferry editor engages whenever the ferry flow
  // is pinned (click ferry ribbon on the map, or the "Ferries" legend row).
  // Click anywhere outside to exit.
  const FERRY_KEY = 'All Ferry Points|Ferry'
  const editMode = pinnedKey === FERRY_KEY
  const togglePin = useCallback((key: string) => {
    setPinnedKey(k => (k === key ? null : key))
  }, [])
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      // Legend rows + inline labels + the map canvas all manage their own
      // pin state; any other click unpins.
      if (t?.closest?.('.geo-sankey-panel-row, .geo-sankey-inline-label, .maplibregl-canvas-container')) return
      setPinnedKey(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

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

    // Small gap (px) between stacked ribbons so they don't touch.
    const STACK_GAP = 2

    const features: GeoJSON.Feature[] = []
    for (const [, crossingFlows] of byCrossing) {
      crossingFlows.sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode))
      // Compute each non-ferry flow's width once so we can stack them
      // edge-to-edge (no overlap) rather than using a fixed lateralOffset.
      const nonFerryWidths = crossingFlows.map(ff =>
        ff.isFerry ? 0 : (ff.passengers / maxPassengers) * 30 * widthScale,
      )
      const totalStackW = nonFerryWidths.reduce((a, b) => a + b, 0)
        + STACK_GAP * Math.max(0, nonFerryWidths.filter(w => w > 0).length - 1)
      const lateralPx: number[] = []
      let running = -totalStackW / 2
      for (const w of nonFerryWidths) {
        lateralPx.push(running + w / 2)
        running += w + (w > 0 ? STACK_GAP : 0)
      }
      crossingFlows.forEach((f, i) => {
        const key = flowKey(f)
        const color = flowColor(f)

        // Ferry Sankey: delegate to geo-sankey library (single-poly graph render).
        // Weights in FERRY_GRAPH are integers summing to FERRY_WEIGHT_TOTAL at
        // each of the source and sink boundaries; divide by that total to
        // recover the fractional share of ferry passengers per edge.
        if (f.isFerry) {
          const totalPax = f.passengers
          const pxPerWeight = (weight: number) =>
            (totalPax * weight / FERRY_WEIGHT_TOTAL / maxPassengers) * 30 * widthScale
          const graphForDir = direction === 'leaving' ? reverseGraph(ferryGS.graph) : ferryGS.graph
          const fc = renderFlowGraphSinglePoly(graphForDir, {
            refLat: REF_LAT, zoom, geoScale, color,
            pxPerWeight,
            arrowWing: ARROW_WING, arrowLen: ARROW_LEN,
          })
          // Tag every ferry feature with the legend key so hover/highlight
          // treats the whole Sankey as a single flow.
          for (const feat of fc.features) {
            if (!feat.properties) feat.properties = {}
            feat.properties.key = key
          }
          features.push(...fc.features)
          return
        }

        // Stack ribbons side-by-side: offset each flow's centerline so its
        // edges meet (+ STACK_GAP) the neighbor's. `offsetPath` scales its
        // `offset` arg by 0.0004 geo units, so convert our px offset through
        // that factor.
        const lateralOffsetUnits = pxToDeg(lateralPx[i], zoom, geoScale, REF_LAT) / 0.0004
        let path = offsetPath(f.path, lateralOffsetUnits)
        if (direction === 'leaving') path = [...path].reverse()
        const width = nonFerryWidths[i]
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
  }, [flows, direction, maxPassengers, mapView.zoom, geoScale, widthScale, ferryGS.graph])



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

  // Terminal markers: show start/end point names when a flow is hovered or pinned
  const terminalMarkers = useMemo(() => {
    if (!activeKey) return { type: 'FeatureCollection' as const, features: [] }
    const hovered = flows.find(f => flowKey(f) === activeKey)
    if (!hovered) return { type: 'FeatureCollection' as const, features: [] }

    const features: GeoJSON.Feature[] = []

    // Ferry: show all source + destination terminals (labeled nodes)
    if (hovered.isFerry) {
      const hasOut = new Set(ferryGS.graph.edges.map(e => e.from))
      for (const n of ferryGS.graph.nodes) {
        if (!n.label) continue
        const anchor = hasOut.has(n.id) ? 'right' : 'left'
        features.push({
          type: 'Feature',
          properties: { name: n.label, anchor },
          geometry: { type: 'Point', coordinates: [n.pos[1], n.pos[0]] },
        })
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
  }, [activeKey, flows, ferryGS.graph])

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
    if (!activeKey) return ['*', ['get', 'opacity'], 0.85] as any
    return [
      'case',
      ['==', ['get', 'key'], activeKey], ['get', 'opacity'],
      ['*', ['get', 'opacity'], 0.25],
    ] as any
  }, [activeKey])

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
          onMove={editMode && ferryDrag.dragging ? undefined : e => setMapView({ lat: e.viewState.latitude, lng: e.viewState.longitude, zoom: e.viewState.zoom })}
          style={{ width: '100%', height: '100%' }}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          onLoad={() => { if (!fullscreen) mapRef.current?.getMap()?.scrollZoom.disable() }}
          onClick={e => {
            focusMap()
            const shift = (e.originalEvent as MouseEvent | undefined)?.shiftKey
            // In edit mode, clicks on a ferry node select/toggle that node
            // instead of interacting with the ribbon pin.
            if (editMode) {
              const nodeF = e.features?.filter((f: any) => f.layer?.id === 'ferry-node-circles')
              if (nodeF?.length) {
                ferrySel.toggleOrReplace({ type: 'node', id: nodeF[0].properties.id }, !!shift)
                return
              }
              // Click on the ferry ribbon while already pinned: stay pinned
              // (otherwise users accidentally exit edit mode). Unpin only via
              // empty click or legend.
              if (hoveredKey === pinnedKey) return
            }
            if (hoveredKey) {
              // Switching to a different flow (or pinning one for the first
              // time) — replace the pin. Also clear any ferry-node selection.
              setPinnedKey(hoveredKey)
              if (hoveredKey !== FERRY_KEY) ferrySel.setSelections([])
            } else {
              // Empty map: unpin + deselect.
              setPinnedKey(null)
              ferrySel.setSelections([])
            }
          }}
          onMouseDown={editMode ? ferryDrag.onDragStart : undefined}
          dragPan={!editMode || ferryDrag.dragPan}
          interactiveLayerIds={editMode ? ['ferry-node-circles'] : undefined}
          onMouseMove={onMouseMove}
          onMouseLeave={() => { onMouseLeave(); unfocusMap() }}
          cursor={editMode ? (ferryDrag.dragging ? 'grabbing' : '') : (hoveredKey ? 'pointer' : '')}
        >
          {/* Ribbon polygons (rect + arrowhead as unified shapes) */}
          <Source id="flows" type="geojson" data={geojson}>
            <Layer
              id="flow-fills"
              type="fill"
              paint={flowFillPaint({ 'fill-opacity': fillOpacity }) as any}
            />
          </Source>
          {/* Crossing name labels at NJ-side endpoints.
              Hidden when inline legend is active — the inline LIs already
              name each flow, and these layer labels just clutter the arrows. */}
          {!inlineLegend && (
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
          )}
          {/* Ferry graph nodes (edit mode): draggable circles + labels */}
          {editMode && (
            <Source id="ferry-nodes" type="geojson" data={renderNodes(ferryGS.graph, 'all')}>
              <Layer id="ferry-node-circles" type="circle"
                paint={{
                  'circle-radius': ['case',
                    ['in', ['get', 'id'], ['literal', ferrySel.selectedNodeIds]], 8,
                    ['coalesce', ['get', 'radius'], 6],
                  ],
                  'circle-color': ['case',
                    ['in', ['get', 'id'], ['literal', ferrySel.selectedNodeIds]], '#14B8A6',
                    ['coalesce', ['get', 'color'], '#fff'],
                  ],
                  'circle-stroke-color': ['case',
                    ['in', ['get', 'id'], ['literal', ferrySel.selectedNodeIds]], '#fff',
                    '#000',
                  ],
                  'circle-stroke-width': ['case',
                    ['in', ['get', 'id'], ['literal', ferrySel.selectedNodeIds]], 2.5,
                    1.5,
                  ],
                }} />
              <Layer id="ferry-node-labels" type="symbol"
                layout={{
                  'text-field': ['coalesce', ['get', 'label'], ['get', 'id']],
                  'text-size': 11,
                  'text-offset': [0, 1.4],
                  'text-anchor': 'top',
                  'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
                  'text-allow-overlap': true,
                }}
                paint={{
                  'text-color': '#fff',
                  'text-halo-color': 'rgba(0,0,0,0.8)',
                  'text-halo-width': 1.5,
                }} />
            </Source>
          )}
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
                'text-opacity': activeKey ? 0.2 : 1,
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
          {/* Inline legend: one label per flow, positioned at that flow's
              arrow tip. For crossings with 2 flows (Lincoln, Holland), the
              upper flow anchors at its tip's bottom-left (LI sits above)
              and the lower flow at top-left (LI sits below) so the pair
              splits away from each other, avoiding overlap at any zoom. */}
          {inlineLegend && (() => {
            const byCrossing = new Map<string, FlowDatum[]>()
            for (const f of sortedFlows) {
              const arr = byCrossing.get(f.crossing) ?? []
              arr.push(f)
              byCrossing.set(f.crossing, arr)
            }
            // Px offset between LI and arrow tip on the horizontal axis.
            const LI_X_OFFSET = 10
            const LI_HEIGHT = 36
            const LI_GAP = 0
            // Actual screen px per degree of latitude at current zoom (MapLibre
            // Mercator). `pxToDeg(…, geoScale=1)` returns zoom-12 units and
            // doesn't scale with zoom, so we compute the projection factor
            // directly.
            const degPerPx = 360 * Math.cos(REF_LAT * Math.PI / 180) / (512 * Math.pow(2, mapView.zoom))
            type LIData = {
              flow: FlowDatum
              key: string
              pos: LatLon
              anchor: 'left'
              centerY: number  // natural effective screen-y of the LI's center, relative to map center lat (positive = south)
            }
            const lis: LIData[] = []
            for (const [, cFlows] of byCrossing) {
              const sorted = [...cFlows].sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode))
              // Replicate the stacking offsets from geojson-generation so
              // each label sits at the actual arrow tip of its ribbon.
              const widths = sorted.map(ff => ff.isFerry ? 0 : (ff.passengers / maxPassengers) * 30 * widthScale)
              const nVisible = widths.filter(w => w > 0).length
              const STACK_GAP = 2
              const totalStackW = widths.reduce((a, b) => a + b, 0) + STACK_GAP * Math.max(0, nVisible - 1)
              const lateralPx: number[] = []
              let running = -totalStackW / 2
              for (const w of widths) {
                lateralPx.push(running + w / 2)
                running += w + (w > 0 ? STACK_GAP : 0)
              }
              sorted.forEach((f, i) => {
                const key = flowKey(f)
                let pos: LatLon | undefined
                if (f.isFerry) {
                  pos = FLOW_TERMINUS[f.crossing]
                } else {
                  // End of this flow's offset path = arrow tip. Match the
                  // geojson path transforms: offset + (for leaving) reverse.
                  const lateralOffsetUnits = pxToDeg(lateralPx[i], mapView.zoom, geoScale, REF_LAT) / 0.0004
                  let p = offsetPath(f.path, lateralOffsetUnits)
                  if (direction === 'leaving') p = [...p].reverse()
                  if (f.crossing === 'Uptown PATH Tunnel' && p.length > 2) {
                    const { path: smooth, knots } = smoothPath(p)
                    pos = smooth[knots[UPTOWN_FADE_START]]
                  } else {
                    pos = p[p.length - 1]
                  }
                }
                if (!pos) return
                // Always anchor vertically at the tip's center; de-bunch
                // handles spacing when multiple LIs would overlap.
                const anchor: 'left' = 'left'
                const posY = (mapView.lat - pos[0]) / degPerPx
                lis.push({ flow: f, key, pos, anchor, centerY: posY })
              })
            }
            // De-bunch: greedy top-down spread so no two LIs overlap
            // vertically. Only shifts down — LIs stay at their ideal y when
            // there's room. Over the map's visible lat range, small lat deltas
            // can produce sub-LI-height spacing at low zoom; this forces a
            // readable column then.
            const sortedByY = [...lis].sort((a, b) => a.centerY - b.centerY)
            const yShift = new Map<string, number>()
            let prevY = -Infinity
            for (const li of sortedByY) {
              const targetY = Math.max(li.centerY, prevY + LI_HEIGHT + LI_GAP)
              yShift.set(li.key, targetY - li.centerY)
              prevY = targetY
            }
            // Leader lines: one Marker per LI anchored at the LI's intended
            // geographic point, containing an SVG line that points at the
            // LI's actual rendered position. All pixel offsets live inside
            // SVG so leader + LI stay aligned at any zoom.
            const markers: React.ReactNode[] = []
            for (const li of lis) {
              const { flow: f, key, pos, anchor } = li
              const yOff = yShift.get(key) ?? 0
              const totalYShift = yOff
              const active = activeKey === key
              const pinned = pinnedKey === key
              const faded = activeKey && !active
              const color = flowColor(f)
              const modeIcon = MODE_ICON[f.mode]
              const agencies = CROSSING_AGENCY[f.crossing] ?? []
              // Leader line: only draw when LI is visibly displaced
              if (Math.abs(totalYShift) >= 4) {
                const w = LI_X_OFFSET + 4
                const h = Math.abs(totalYShift) + 4
                const y1 = totalYShift >= 0 ? 0 : h
                const y2 = totalYShift >= 0 ? h : 0
                markers.push(
                  <Marker key={`leader-${key}`} longitude={pos[1]} latitude={pos[0]} anchor="top-left"
                    style={{ pointerEvents: 'none' }}
                  >
                    <svg width={w} height={h} style={{ overflow: 'visible', display: 'block' }}>
                      <line x1={0} y1={y1} x2={LI_X_OFFSET} y2={y2}
                        stroke={color} strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />
                    </svg>
                  </Marker>,
                )
              }
              markers.push(
                <Marker key={key} longitude={pos[1]} latitude={pos[0]} anchor={anchor}
                  offset={[LI_X_OFFSET, yOff]}
                  style={{ pointerEvents: 'auto' }}
                >
                    <div
                      className={`geo-sankey-inline-label${active ? ' active' : ''}${faded ? ' faded' : ''}${pinned ? ' pinned' : ''}`}
                      onMouseEnter={() => setHoveredKey(key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      onClick={() => togglePin(key)}
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
                </Marker>,
              )
            }
            return markers
          })()}
        </MapGL>
        {/* Ferry edit mode: per-node rotation/velocity handles */}
        {editMode && ferrySel.selection?.type === 'node' && (() => {
          const sel = ferrySel.selection
          if (sel.type !== 'node') return null
          const node = ferryGS.graph.nodes.find(n => n.id === sel.id)
          if (!node) return null
          return (
            <NodeOverlay
              key={node.id}
              nodeId={node.id}
              label={node.label ?? ''}
              bearing={Math.round(node.bearing ?? 90)}
              pos={node.pos}
              velocity={node.velocity}
              refLat={REF_LAT}
              mapRef={mapRef}
              onBeginRotate={() => ferryGS.pushHistory(ferryGS.graph)}
              onRotateTransient={b => ferryGS.setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === node.id ? { ...n, bearing: b } : n) }))}
              onBeginVelocity={() => ferryGS.pushHistory(ferryGS.graph)}
              onVelocityTransient={v => ferryGS.setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === node.id ? { ...n, velocity: v } : n) }))}
              onResetVelocity={() => ferryMut.updateNode(node.id, { velocity: undefined } as any)}
            />
          )
        })()}
        {/* Ferry edit drawer (sits above the legend panel in LR) */}
        {editMode && (
          <div className="geo-sankey-edit-panel">
            <div className="geo-sankey-edit-header">
              <strong>Edit Ferry</strong>
              <span style={{ display: 'flex', gap: 4 }}>
                <button onClick={ferryGS.undo} disabled={ferryGS.pastLen === 0} title="Undo" style={{ background: 'none', border: 'none', color: ferryGS.pastLen ? '#aaa' : '#555', cursor: ferryGS.pastLen ? 'pointer' : 'default', padding: '0 4px' }}>↶</button>
                <button onClick={ferryGS.redo} disabled={ferryGS.futureLen === 0} title="Redo" style={{ background: 'none', border: 'none', color: ferryGS.futureLen ? '#aaa' : '#555', cursor: ferryGS.futureLen ? 'pointer' : 'default', padding: '0 4px' }}>↷</button>
                <button onClick={ferryIO.copyGraphAsTS} title="Copy graph as TS literal" style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '0 4px' }}>⧉ TS</button>
                <button onClick={ferryIO.exportSceneJSON} title="Export scene JSON" style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '0 4px' }}>⇣ JSON</button>
                <button onClick={ferryIO.openPaste} title="Paste scene/graph" style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '0 4px' }}>📋</button>
                <button onClick={() => { setPinnedKey(null); ferrySel.setSelections([]) }} title="Exit edit mode" style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '0 4px' }}>✕</button>
              </span>
            </div>
            <div className="geo-sankey-edit-body">
              {ferrySel.selectedNodes.length === 1 ? (() => {
                const n = ferrySel.selectedNodes[0]
                return (
                  <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    <div><strong>{n.id}</strong>{n.label ? ` — ${n.label}` : ''}</div>
                    <div>pos: {n.pos[0].toFixed(5)}, {n.pos[1].toFixed(5)}</div>
                    <div>bearing: {Math.round(n.bearing ?? 90)}°</div>
                    {n.velocity != null && <div>velocity: {n.velocity.toFixed(4)}</div>}
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button onClick={() => ferryMut.deleteNode(n.id)} style={{ fontSize: 11 }}>Delete</button>
                      <button onClick={() => ferrySel.setSelections([])} style={{ fontSize: 11 }}>Deselect</button>
                    </div>
                  </div>
                )
              })() : (
                <div style={{ fontSize: 11, color: '#aaa' }}>
                  Click a node to select. Shift-click to toggle. Drag to move.
                </div>
              )}
            </div>
          </div>
        )}
        {ferryIO.ui}
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
                onClick={() => setInlineLegend(!inlineLegend)}
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
            const active = activeKey === key
            const pinned = pinnedKey === key
            const faded = activeKey && !active
            const color = flowColor(f)
            const modeIcon = MODE_ICON[f.mode]
            const agencies = CROSSING_AGENCY[f.crossing] ?? []
            return (
              <div
                key={key}
                className={`geo-sankey-panel-row${active ? ' active' : ''}${faded ? ' faded' : ''}${pinned ? ' pinned' : ''}`}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() => togglePin(key)}
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
