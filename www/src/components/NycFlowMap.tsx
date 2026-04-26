// Geographic Sankey of CBD-bound flows from all NYMTC sectors. Each ribbon
// is a (crossing, mode) cell — autos and buses share their bridge/tunnel,
// while subway tubes carry their actual line groups (4/5 in the Joralemon
// tube, A/C in Cranberry, etc.). Stack of co-located modes at the same
// crossing renders parallel (lateral offsets, like the home-page GeoSankey).
//
// Data sources:
//   vehicles.json            → autos by (sector, crossing)
//   bus_passengers.json      → buses by (sector, crossing)
//   appendix_iii_detail.json → subway/rail per line, hourly (rolled into time_period)
//   appendix_iii.json        → ferries by sector, hourly (rolled into time_period)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapGL, { Source, Layer, Marker } from 'react-map-gl/maplibre'
import type { MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useUrlState, codeParam } from 'use-prms'
import { pxToHalfDeg, pxToDeg, offsetPath, ribbonArrow, flowFillPaint } from 'geo-sankey'
import type { LatLon } from 'geo-sankey'
import type { CrossingRecord, Direction, TimePeriod } from '../lib/types'
import { type AppendixIIIRecord, NYC_MODE_ORDER, type NycMode, type Sector } from '../lib/nyc-types'
import { type AppendixIIIDetailRecord, type CrossingFlow, buildCrossingFlows } from '../lib/nyc-data'
import { type CrossingId, CROSSINGS } from '../lib/nyc-crossings'
import { DEFAULT_SCHEME } from '../lib/colors'
import Toggle, { type ToggleOption } from './Toggle'
import MapControls, { useMapWidthScale, useMapGeoScale } from './MapControls'

const REF_LAT = 40.74
const ARROW_WING = 1.6
const ARROW_LEN = 0.6
const STACK_GAP = 1.5  // px gap between parallel ribbons at same crossing

const MODE_COLORS: Record<NycMode, string> = {
  Auto: DEFAULT_SCHEME.mode.Autos,
  Bus: DEFAULT_SCHEME.mode.Bus,
  Subway: DEFAULT_SCHEME.mode.PATH,
  Rail: DEFAULT_SCHEME.mode.Rail,
  Ferry: DEFAULT_SCHEME.mode.Ferries,
}

// Per-sector label placement: anchors fan labels outward from Manhattan.
const SECTOR_ANCHORS: Record<Sector, { anchor: 'left' | 'right' | 'top' | 'bottom'; offset: [number, number] }> = {
  nj:               { anchor: 'right',  offset: [-10, 0] },
  queens:           { anchor: 'left',   offset: [10, 0] },
  brooklyn:         { anchor: 'left',   offset: [10, 8] },
  '60th_street':    { anchor: 'bottom', offset: [0, -8] },
  staten_island:    { anchor: 'top',    offset: [0, 8] },
  roosevelt_island: { anchor: 'top',    offset: [0, 8] },
}

function defaultView(): { lat: number; lng: number; zoom: number } {
  const W = typeof window !== 'undefined' ? window.innerWidth : 1400
  if (W <= 768) return { lat: 40.730, lng: -73.985, zoom: 11.0 }
  return { lat: 40.730, lng: -73.985, zoom: 11.85 }
}

const dirParam = codeParam<Direction>('entering', [
  ['entering', 'njny'], ['leaving', 'nynj'],
])
const timeParam = codeParam<TimePeriod>('peak_1hr', [
  ['peak_1hr', '1h'], ['peak_period', '3h'], ['24hr', '1d'],
])
const DIR_OPTIONS: ToggleOption<Direction>[] = [
  { value: 'entering', label: 'Entering', tooltip: 'Entering CBD' },
  { value: 'leaving',  label: 'Leaving',  tooltip: 'Leaving CBD' },
]
const TIME_OPTIONS: ToggleOption<TimePeriod>[] = [
  { value: 'peak_1hr', label: '1hr' },
  { value: 'peak_period', label: '3hr' },
  { value: '24hr', label: 'day' },
]

type Props = {
  vehicles: CrossingRecord[]
  buses: CrossingRecord[]
  detail: AppendixIIIDetailRecord[]
  appendixIii: AppendixIIIRecord[]
}

const NYC_FLOW_MAP_HEIGHT_KEY = 'nyc-flow-map-height'
function defaultMapHeight(): number {
  if (typeof window === 'undefined') return 820
  return Math.min(Math.round(window.innerHeight * 0.85), 1000)
}

export default function NycFlowMap({ vehicles, buses, detail, appendixIii }: Props) {
  const [direction, setDirection] = useUrlState('d', dirParam)
  const [timePeriod, setTimePeriod] = useUrlState('t', timeParam)
  const [widthScale, setWidthScale] = useMapWidthScale()
  const [geoScale, setGeoScale] = useMapGeoScale()

  const mapRef = useRef<MapRef>(null)
  const initialView = useMemo(defaultView, [])
  const [mapView, setMapView] = useState(initialView)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [mapHeight, setMapHeight] = useState(() => {
    if (typeof sessionStorage === 'undefined') return defaultMapHeight()
    const stored = sessionStorage.getItem(NYC_FLOW_MAP_HEIGHT_KEY)
    return stored ? parseInt(stored) : defaultMapHeight()
  })

  // Focus pattern (mirrors `/`'s GeoSankey): wheel zooms only when focused;
  // otherwise the wheel scrolls the page. Click inside to focus, click out
  // to release.
  const mapFocusedRef = useRef(false)
  const [mapFocused, setMapFocused] = useState(false)
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

  const flows = useMemo<CrossingFlow[]>(
    () => buildCrossingFlows(vehicles, buses, detail, appendixIii as any),
    [vehicles, buses, detail, appendixIii],
  )

  // Maplibre kicker: occasionally lands on a black canvas under strict mode
  // until we drive resize + repaint. ResizeObserver + poll until carto loads.
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    const kick = () => {
      const m = mapRef.current?.getMap()
      if (!m) return
      m.resize()
      m.triggerRepaint()
    }
    const el = containerRef.current
    let ro: ResizeObserver | null = null
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(kick)
      ro.observe(el)
    }
    const poll = () => {
      if (cancelled) return
      kick()
      const m = mapRef.current?.getMap()
      if (m && m.isSourceLoaded?.('carto')) return
      setTimeout(poll, 200)
    }
    setTimeout(poll, 50)
    return () => { cancelled = true; ro?.disconnect() }
  }, [])

  // Click outside the map → unfocus
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!mapFocusedRef.current) return
      if (containerRef.current?.contains(e.target as Node)) return
      unfocusMap()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [unfocusMap])
  // When map is focused, swallow wheel events so the page doesn't also scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (mapFocusedRef.current) e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Latest year × current direction × time period.
  const activeFlows = useMemo(() => {
    const yearSet = new Set(flows.map(r => r.year))
    const latestYear = Math.max(...yearSet)
    return flows
      .filter(f => f.year === latestYear && f.direction === direction && f.time_period === timePeriod)
      .filter(f => f.persons > 0)
  }, [flows, direction, timePeriod])

  const maxPersons = useMemo(() => {
    let m = 0
    for (const f of activeFlows) m = Math.max(m, f.persons)
    return m
  }, [activeFlows])

  // Per-crossing sums for label placement and tooltip.
  const crossingTotals = useMemo(() => {
    const out = new Map<CrossingId, { persons: number; topMode: NycMode; topModePersons: number }>()
    for (const f of activeFlows) {
      const cur = out.get(f.crossingId)
      if (!cur) {
        out.set(f.crossingId, { persons: f.persons, topMode: f.mode, topModePersons: f.persons })
      } else {
        cur.persons += f.persons
        if (f.persons > cur.topModePersons) {
          cur.topMode = f.mode
          cur.topModePersons = f.persons
        }
      }
    }
    return out
  }, [activeFlows])

  // Crossings to label inline: top N globally + 1 per sector (so tiny
  // sectors like Staten Island still get represented).
  const TOP_N_GLOBAL = 14
  const labeledCrossings = useMemo(() => {
    const sorted = [...crossingTotals.entries()].sort((a, b) => b[1].persons - a[1].persons)
    const picked = new Set<CrossingId>()
    for (let i = 0; i < Math.min(TOP_N_GLOBAL, sorted.length); i++) picked.add(sorted[i][0])
    // Ensure 1 per sector.
    const seenSectors = new Set<Sector>()
    for (const cid of picked) seenSectors.add(CROSSINGS[cid].sector)
    for (const [cid] of sorted) {
      const sec = CROSSINGS[cid].sector
      if (!seenSectors.has(sec)) {
        picked.add(cid)
        seenSectors.add(sec)
      }
    }
    return picked
  }, [crossingTotals])

  // Build polygon GeoJSON. Group by crossing → stack co-located modes side-by-side.
  const geojson = useMemo(() => {
    const features: GeoJSON.Feature[] = []
    const zoom = mapView.zoom

    // Group flows by crossing.
    const byCrossing = new Map<CrossingId, CrossingFlow[]>()
    for (const f of activeFlows) {
      const arr = byCrossing.get(f.crossingId) ?? []
      arr.push(f)
      byCrossing.set(f.crossingId, arr)
    }

    for (const [cid, group] of byCrossing) {
      const cdef = CROSSINGS[cid]
      if (!cdef) continue
      // Order modes consistently within each crossing.
      group.sort((a, b) => NYC_MODE_ORDER.indexOf(a.mode) - NYC_MODE_ORDER.indexOf(b.mode))
      const widths = group.map(f => Math.max(2, (f.persons / maxPersons) * 60 * widthScale))
      const totalStack = widths.reduce((a, b) => a + b, 0) + STACK_GAP * Math.max(0, widths.length - 1)
      // Each ribbon's offset = its centerline relative to the path's centerline.
      let running = -totalStack / 2
      const offsets: number[] = []
      for (const w of widths) {
        offsets.push(running + w / 2)
        running += w + STACK_GAP
      }

      group.forEach((f, i) => {
        const widthPx = widths[i]
        const offsetPx = offsets[i]
        let path: LatLon[] = cdef.path
        if (direction === 'leaving') path = [...path].reverse()
        // Lateral stack: convert px → degree-units, then scale by `offsetPath`'s
        // 0.0004 internal factor (mirrors the home-page GeoSankey usage).
        if (offsetPx !== 0) {
          const lateralUnits = pxToDeg(offsetPx, zoom, geoScale, REF_LAT) / 0.0004
          path = offsetPath(path, lateralUnits)
        }
        const halfW = pxToHalfDeg(widthPx, zoom, geoScale, REF_LAT)
        const ring = ribbonArrow(path, halfW, REF_LAT, {
          arrowWingFactor: ARROW_WING,
          arrowLenFactor: ARROW_LEN,
          widthPx,
        })
        if (!ring.length) return
        const key = `${cid}|${f.mode}`
        features.push({
          type: 'Feature',
          properties: {
            color: MODE_COLORS[f.mode],
            width: widthPx,
            key,
            crossingId: cid,
            mode: f.mode,
            sector: cdef.sector,
            persons: f.persons,
          },
          geometry: { type: 'Polygon', coordinates: [ring.map(([lon, lat]) => [lon, lat])] },
        })
      })
    }
    features.sort((a, b) => (b.properties?.width ?? 0) - (a.properties?.width ?? 0))
    return { type: 'FeatureCollection' as const, features }
  }, [activeFlows, maxPersons, mapView.zoom, direction, widthScale, geoScale])

  // Per-crossing labels at arrow tips (top N + 1 per sector).
  type CrossingLabel = {
    crossingId: CrossingId
    pos: LatLon
    persons: number
    topMode: NycMode
    sector: Sector
    name: string
  }
  const crossingLabels = useMemo<CrossingLabel[]>(() => {
    const out: CrossingLabel[] = []
    for (const cid of labeledCrossings) {
      const info = crossingTotals.get(cid)
      const cdef = CROSSINGS[cid]
      if (!info || !cdef) continue
      const path = cdef.path
      // 60th St labels always sit at the north (source) end so they pop
      // into uptown, not into the dense CBD cluster of arrow tips.
      // Staten Island sits at the south source end likewise.
      const pos: LatLon =
        cdef.sector === '60th_street'   ? path[0]
        : cdef.sector === 'staten_island' ? path[0]
        : direction === 'leaving'       ? path[0]
        :                                  path[path.length - 1]
      out.push({
        crossingId: cid, pos,
        persons: info.persons, topMode: info.topMode,
        sector: cdef.sector, name: cdef.name,
      })
    }
    return out
  }, [labeledCrossings, crossingTotals, direction])

  const dirLabel = direction === 'entering' ? 'Entering CBD' : 'Leaving CBD'
  const timeLabel = timePeriod === 'peak_1hr' ? (direction === 'entering' ? '8-9am' : '5-6pm') :
                    timePeriod === 'peak_period' ? (direction === 'entering' ? '7-10am' : '4-7pm') : '24hr'
  const totalPersons = activeFlows.reduce((s, f) => s + f.persons, 0)

  return (
    <div className="geo-sankey">
      <h2>NYC-wide CBD flows</h2>
      <p className="chart-subtitle">{dirLabel}, {timeLabel}, {Math.round(totalPersons / 1000)}k total · 2024</p>
      <div
        ref={containerRef}
        style={{
          width: '100%', height: `${mapHeight}px`, position: 'relative',
          borderRadius: 8, overflow: 'hidden',
          resize: 'vertical', minHeight: 300, maxHeight: 1400,
          outline: mapFocused ? '2px solid rgba(100, 160, 255, 0.5)' : 'none',
        }}
        onMouseUp={e => {
          const el = e.currentTarget
          const h = el.offsetHeight
          if (h !== mapHeight) {
            setMapHeight(h)
            sessionStorage.setItem(NYC_FLOW_MAP_HEIGHT_KEY, String(h))
          }
        }}
      >
        <MapGL
          ref={mapRef}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          style={{ width: '100%', height: '100%' }}
          longitude={mapView.lng}
          latitude={mapView.lat}
          zoom={mapView.zoom}
          onMove={e => setMapView({ lat: e.viewState.latitude, lng: e.viewState.longitude, zoom: e.viewState.zoom })}
          onLoad={() => mapRef.current?.getMap()?.scrollZoom.disable()}
          onClick={focusMap}
          interactiveLayerIds={['flow-fills']}
          onMouseMove={e => {
            const f = e.features?.[0]
            setHoveredKey((f?.properties?.key as string) ?? null)
          }}
          onMouseLeave={() => setHoveredKey(null)}
        >
          <Source id="flows" type="geojson" data={geojson}>
            <Layer
              id="flow-fills"
              type="fill"
              paint={flowFillPaint({
                'fill-opacity': hoveredKey
                  ? ['case', ['==', ['get', 'key'], hoveredKey], 0.95, 0.18]
                  : 0.82,
              }) as any}
            />
          </Source>
          {crossingLabels.map(s => {
            const a = SECTOR_ANCHORS[s.sector]
            return (
              <Marker
                key={s.crossingId}
                longitude={s.pos[1]}
                latitude={s.pos[0]}
                anchor={a.anchor}
                offset={a.offset}
                style={{ pointerEvents: 'none' }}
              >
                <div
                  style={{
                    background: 'rgba(0,0,0,0.82)', color: '#eee',
                    padding: '2px 6px', borderRadius: 3, fontSize: 11,
                    whiteSpace: 'nowrap', borderLeft: `3px solid ${MODE_COLORS[s.topMode]}`,
                  }}
                >
                  <strong>{s.name}</strong>{' '}
                  <span style={{ opacity: 0.85 }}>{s.persons >= 1000 ? `${(s.persons / 1000).toFixed(0)}k` : Math.round(s.persons).toLocaleString()}</span>
                </div>
              </Marker>
            )
          })}
        </MapGL>
        {hoveredKey && (() => {
          const [cid, mode] = hoveredKey.split('|') as [CrossingId, NycMode]
          const f = activeFlows.find(x => x.crossingId === cid && x.mode === mode)
          if (!f) return null
          const cdef = CROSSINGS[cid]
          return (
            <div style={{
              position: 'absolute', top: 10, left: 10, padding: '6px 10px',
              background: 'rgba(0,0,0,0.78)', color: '#eee', borderRadius: 4, fontSize: 13,
              pointerEvents: 'none',
            }}>
              <strong>{cdef?.name ?? cid} · {f.mode}</strong>: {Math.round(f.persons).toLocaleString()} persons
            </div>
          )
        })()}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
        <Toggle options={DIR_OPTIONS} value={direction} onChange={setDirection} />
        <Toggle options={TIME_OPTIONS} value={timePeriod} onChange={setTimePeriod} />
        <MapControls
          widthScale={widthScale} setWidthScale={setWidthScale}
          geoScale={geoScale} setGeoScale={setGeoScale}
        />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {NYC_MODE_ORDER.map(m => (
            <span key={m} style={{ marginRight: 12 }}>
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                background: MODE_COLORS[m], marginRight: 4, verticalAlign: 'middle',
              }} />
              {m}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}
