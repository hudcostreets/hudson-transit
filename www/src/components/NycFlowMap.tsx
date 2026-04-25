// Geographic Sankey of CBD-bound flows from all NYMTC sectors (NJ, Queens,
// Brooklyn, Staten Island, 60th-Street boundary). MVP: one ribbon per
// (sector, mode) routed through representative entry paths defined in
// `lib/nyc-paths.ts`. See `specs/nyc-flow-map.md` for the bigger picture
// (subway-line detail, ferry network, drilldowns) — deferred for v2.

import { useEffect, useMemo, useRef, useState } from 'react'
import MapGL, { Source, Layer, Marker } from 'react-map-gl/maplibre'
import type { MapRef } from 'react-map-gl/maplibre'
import { SECTOR_LABELS } from '../lib/nyc-types'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useUrlState, codeParam } from 'use-prms'
import { pxToHalfDeg, ribbonArrow, flowFillPaint } from 'geo-sankey'
import type { LatLon } from 'geo-sankey'
import type { CrossingRecord, Direction, TimePeriod } from '../lib/types'
import { type AppendixIIIRecord, type NycMode, type Sector, NYC_MODE_ORDER } from '../lib/nyc-types'
import { buildNycRecords } from '../lib/nyc-data'
import { ENTRY_PATHS, SECTOR_MODE_PATHS } from '../lib/nyc-paths'
import { DEFAULT_SCHEME } from '../lib/colors'
import Toggle, { type ToggleOption } from './Toggle'

const REF_LAT = 40.74
const ARROW_WING = 1.6
const ARROW_LEN = 0.6

const MODE_COLORS: Record<NycMode, string> = {
  Auto: DEFAULT_SCHEME.mode.Autos,
  Bus: DEFAULT_SCHEME.mode.Bus,
  Subway: DEFAULT_SCHEME.mode.PATH,
  Rail: DEFAULT_SCHEME.mode.Rail,
  Ferry: DEFAULT_SCHEME.mode.Ferries,
}

// Per-sector label placement: anchors fan labels outward from Manhattan so
// they don't pile up at the cluster of Lower-Manhattan arrow tips.
const SECTOR_ANCHORS: Record<Sector, { anchor: 'left' | 'right' | 'top' | 'bottom'; offset: [number, number] }> = {
  nj:               { anchor: 'right',  offset: [-10, 0] }, // label sits W of NJ Manhattan portals (over Hudson)
  queens:           { anchor: 'left',   offset: [10, 0] },  // E (toward Queens)
  brooklyn:         { anchor: 'left',   offset: [10, 8] },  // E + small S, away from MB/BB tips
  '60th_street':    { anchor: 'bottom', offset: [0, -8] },  // pushed N into uptown
  staten_island:    { anchor: 'top',    offset: [0, 8] },   // pushed S toward the harbor
  roosevelt_island: { anchor: 'top',    offset: [0, 8] },
}

// Map view encompasses all entry points: NJ shore on the W, LIC / Queens on
// the NE, the four Brooklyn-side bridges/tunnels on the S, SI ferry to the
// SW, and 60th St inflows along the top of the Manhattan grid.
function defaultView(): { lat: number; lng: number; zoom: number } {
  const W = typeof window !== 'undefined' ? window.innerWidth : 1400
  // Centered over Manhattan to fit NJ ↔ Queens horizontally and 60th St ↔
  // Lower Manhattan vertically. SI Ferry is visible but its St-George end
  // intentionally extends out the bottom — the trace direction reads.
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
  { value: 'leaving', label: 'Leaving', tooltip: 'Leaving CBD' },
]
const TIME_OPTIONS: ToggleOption<TimePeriod>[] = [
  { value: 'peak_1hr', label: '1hr' },
  { value: 'peak_period', label: '3hr' },
  { value: '24hr', label: 'day' },
]

type Props = {
  appendixIii: AppendixIIIRecord[]
  vehicles: CrossingRecord[]
}

export default function NycFlowMap({ appendixIii, vehicles }: Props) {
  const [direction, setDirection] = useUrlState('d', dirParam)
  const [timePeriod, setTimePeriod] = useUrlState('t', timeParam)

  const mapRef = useRef<MapRef>(null)
  // `useState(defaultView)` evaluated the initializer twice under strict
  // mode and was producing two different objects (different `window` reads),
  // which left MapGL in a never-loaded state. Compute once at mount.
  const initialView = useMemo(defaultView, [])
  const [mapView, setMapView] = useState(initialView)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const records = useMemo(() => buildNycRecords(appendixIii, vehicles), [appendixIii, vehicles])

  // Maplibre sometimes captures the container's size before layout settles
  // (strict-mode double mount + the tall page above) and ends up stuck on
  // a black canvas because basemap tiles never start loading. Drive
  // `resize` + `triggerRepaint` from a ResizeObserver AND poll a few times
  // until the carto basemap source reports loaded.
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
    // Belt-and-suspenders: poll every 200 ms until carto source is loaded.
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

  // Active = latest year × current direction × current time period.
  const flows = useMemo(() => {
    const yearSet = new Set(records.map(r => r.year))
    const latestYear = Math.max(...yearSet)
    return records
      .filter(r => r.year === latestYear && r.direction === direction && r.time_period === timePeriod)
      .filter(r => r.persons > 0)
  }, [records, direction, timePeriod])

  // For width-scaling: maxPersons = the largest (sector, mode) cell.
  const maxPersons = useMemo(() => {
    let m = 0
    for (const f of flows) m = Math.max(m, f.persons)
    return m
  }, [flows])

  const geojson = useMemo(() => {
    const features: GeoJSON.Feature[] = []
    const zoom = mapView.zoom

    for (const f of flows) {
      const key = `${f.sector}|${f.mode}` as const
      const paths = SECTOR_MODE_PATHS[key]
      if (!paths || paths.length === 0) continue
      const color = MODE_COLORS[f.mode]
      // Width sized in pixels so all sectors share the same scale at any zoom.
      // Split the flow's persons evenly across all paths assigned to this
      // (sector, mode); the rough share isn't accurate but reads cleanly.
      const totalWidthPx = (f.persons / maxPersons) * 60
      const perPathPx = Math.max(2, totalWidthPx / paths.length)

      for (const entryId of paths) {
        let path: LatLon[] = ENTRY_PATHS[entryId]
        if (direction === 'leaving') path = [...path].reverse()
        const halfW = pxToHalfDeg(perPathPx, zoom, 1, REF_LAT)
        const ring = ribbonArrow(path, halfW, REF_LAT, {
          arrowWingFactor: ARROW_WING,
          arrowLenFactor: ARROW_LEN,
          widthPx: perPathPx,
        })
        if (!ring.length) continue
        features.push({
          type: 'Feature',
          properties: {
            color,
            width: perPathPx,
            key: `${key}|${entryId}`,
            sectorMode: key,
            entryId,
            persons: f.persons,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [ring.map(([lon, lat]) => [lon, lat])],
          },
        })
      }
    }
    // Sort widest-first so smaller flows draw on top
    features.sort((a, b) => (b.properties?.width ?? 0) - (a.properties?.width ?? 0))
    return { type: 'FeatureCollection' as const, features }
  }, [flows, maxPersons, mapView.zoom, direction])

  // One label per sector at the arrow tip of that sector's largest mode.
  // Avoids cluttering the map with up to 5 labels per sector.
  const sectorLabels = useMemo(() => {
    type Item = { sector: Sector; pos: LatLon; persons: number; topMode: NycMode; topModePersons: number }
    const bySector = new Map<Sector, Item>()
    for (const f of flows) {
      const key = `${f.sector}|${f.mode}` as const
      const paths = SECTOR_MODE_PATHS[key]
      if (!paths || paths.length === 0) continue
      const path = ENTRY_PATHS[paths[0]]
      const tip = direction === 'leaving' ? path[0] : path[path.length - 1]
      const existing = bySector.get(f.sector)
      if (!existing) {
        bySector.set(f.sector, {
          sector: f.sector, pos: tip, persons: f.persons,
          topMode: f.mode, topModePersons: f.persons,
        })
      } else {
        existing.persons += f.persons
        if (f.persons > existing.topModePersons) {
          existing.pos = tip
          existing.topMode = f.mode
          existing.topModePersons = f.persons
        }
      }
    }
    return [...bySector.values()]
  }, [flows, direction])

  const dirLabel = direction === 'entering' ? 'Entering CBD' : 'Leaving CBD'
  const timeLabel = timePeriod === 'peak_1hr' ? (direction === 'entering' ? '8-9am' : '5-6pm') :
                    timePeriod === 'peak_period' ? (direction === 'entering' ? '7-10am' : '4-7pm') : '24hr'
  const totalPersons = flows.reduce((s, f) => s + f.persons, 0)

  return (
    <div className="geo-sankey">
      <h2>NYC-wide CBD flows</h2>
      <p className="chart-subtitle">{dirLabel}, {timeLabel}, {Math.round(totalPersons / 1000)}k total · 2024</p>
      <div ref={containerRef} style={{ width: '100%', height: 820, position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
        <MapGL
          ref={mapRef}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          style={{ width: '100%', height: '100%' }}
          longitude={mapView.lng}
          latitude={mapView.lat}
          zoom={mapView.zoom}
          onMove={e => setMapView({ lat: e.viewState.latitude, lng: e.viewState.longitude, zoom: e.viewState.zoom })}
          onLoad={() => mapRef.current?.getMap()?.scrollZoom.disable()}
          interactiveLayerIds={['flow-fills']}
          onMouseMove={e => {
            const f = e.features?.[0]
            setHoveredKey((f?.properties?.sectorMode as string) ?? null)
          }}
          onMouseLeave={() => setHoveredKey(null)}
        >
          <Source id="flows" type="geojson" data={geojson}>
            <Layer
              id="flow-fills"
              type="fill"
              paint={flowFillPaint({
                'fill-opacity': hoveredKey
                  ? ['case', ['==', ['get', 'sectorMode'], hoveredKey], 0.95, 0.18]
                  : 0.82,
              }) as any}
            />
          </Source>
          {/* One inline label per sector at the largest-mode arrow tip.
              Anchor placement is hand-tuned per sector so labels don't pile
              up at the Manhattan core. */}
          {sectorLabels.map(s => {
            const a = SECTOR_ANCHORS[s.sector]
            return (
              <Marker
                key={s.sector}
                longitude={s.pos[1]}
                latitude={s.pos[0]}
                anchor={a.anchor}
                offset={a.offset}
                style={{ pointerEvents: 'none' }}
              >
                <div
                  style={{
                    background: 'rgba(0,0,0,0.82)', color: '#eee',
                    padding: '3px 8px', borderRadius: 4, fontSize: 12,
                    whiteSpace: 'nowrap', borderLeft: `3px solid ${MODE_COLORS[s.topMode]}`,
                  }}
                >
                  <strong>{SECTOR_LABELS[s.sector]}</strong>{' '}
                  <span style={{ opacity: 0.85 }}>{(s.persons / 1000).toFixed(0)}k</span>
                </div>
              </Marker>
            )
          })}
        </MapGL>
        {/* Floating tooltip when a flow is hovered */}
        {hoveredKey && (() => {
          const f = flows.find(x => `${x.sector}|${x.mode}` === hoveredKey)
          if (!f) return null
          const sectorPretty = ({
            nj: 'NJ', queens: 'Queens', brooklyn: 'Brooklyn',
            '60th_street': '60th St', staten_island: 'Staten Island', roosevelt_island: 'Roosevelt Is.',
          } as Record<string, string>)[f.sector] ?? f.sector
          return (
            <div style={{
              position: 'absolute', top: 10, left: 10, padding: '6px 10px',
              background: 'rgba(0,0,0,0.78)', color: '#eee', borderRadius: 4, fontSize: 13,
              pointerEvents: 'none',
            }}>
              <strong>{sectorPretty} · {f.mode}</strong>: {f.persons.toLocaleString()} persons
            </div>
          )
        })()}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
        <Toggle options={DIR_OPTIONS} value={direction} onChange={setDirection} />
        <Toggle options={TIME_OPTIONS} value={timePeriod} onChange={setTimePeriod} />
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
