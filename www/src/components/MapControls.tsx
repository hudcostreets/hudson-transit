// Shared GeoSankey map controls — width/geo/hit-pad sliders, llz
// (lat/lng/zoom) URL-state hook, arrow-default factors. Used on both
// the home GeoSankey (`/`) and the NYC flow map (`/nyc`). URL-state keys:
//   ws = width scale  (multiplier on ribbon px width)
//   gs = geo scale    (0 = fixed-px ribbon width; 1 = grows with zoom)
//   hp = hit pad      (px hit-padding around ribbons for hover detection)
//   ll = view (lat_lng_zoom)

import { useMemo } from 'react'
import { useUrlState } from 'use-prms'

// Arrow-head defaults matching the geo-sankey demo (https://geo-sankey.rbw.sh/).
// Until upstream (`specs/arrow-defaults.md`) ships these as library defaults
// we hand-compute them here so both maps look consistent.
//   wing  = 0.65  (relative wing width)
//   angle = 60°   (internal arrowhead angle)
//   arrowWingFactor = 1 + 2*wing             = 2.3
//   arrowLenFactor  = arrowWing * tan(60°)/2 ≈ 1.99
export const ARROW_WING = 2.3
export const ARROW_LEN  = 2.3 * Math.tan(60 * Math.PI / 180) / 2

export interface MapView {
  lat: number
  lng: number
  zoom: number
}

/** Lat/lng/zoom URL-state, packed `lat_lng_zoom` (4-decimal lat/lng, 2-decimal zoom). */
export function useMapView(defaultView: () => MapView) {
  const param = useMemo(() => {
    const def = defaultView()
    return {
      encode: (v: MapView) => {
        if (
          Math.abs(v.lat - def.lat) < 0.0001 &&
          Math.abs(v.lng - def.lng) < 0.0001 &&
          Math.abs(v.zoom - def.zoom) < 0.01
        ) return undefined
        return `${v.lat.toFixed(4)}_${v.lng.toFixed(4)}_${v.zoom.toFixed(2)}`
      },
      decode: (s: string | undefined): MapView => {
        if (!s) return def
        const parts = s.split('_').map(Number)
        if (parts.length < 3 || parts.some(isNaN)) return def
        return { lat: parts[0], lng: parts[1], zoom: parts[2] }
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return useUrlState('ll', param)
}

const sliderLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: '0.85rem', color: 'var(--text-muted)',
}

export function useMapWidthScale() {
  const param = useMemo(() => ({
    encode: (v: number) => v === 1 ? undefined : v.toFixed(1),
    decode: (s: string | undefined): number => s !== undefined ? parseFloat(s) : 1,
  }), [])
  return useUrlState('ws', param)
}

export function useMapGeoScale() {
  const param = useMemo(() => ({
    encode: (v: number) => v === 1 ? undefined : String(v),
    decode: (s: string | undefined): number => s !== undefined ? parseFloat(s) : 1,
  }), [])
  return useUrlState('gs', param)
}

export function useMapHitPad() {
  const param = useMemo(() => ({
    encode: (v: number) => v === 4 ? undefined : String(v),
    decode: (s: string | undefined): number => s !== undefined ? parseInt(s) : 4,
  }), [])
  return useUrlState('hp', param)
}

export interface MapControlsProps {
  widthScale: number
  setWidthScale: (v: number) => void
  geoScale: number
  setGeoScale: (v: number) => void
  hitPad?: number
  setHitPad?: (v: number) => void
}

export default function MapControls(p: MapControlsProps) {
  return (
    <>
      <label style={sliderLabel} title="Multiplier on ribbon widths">
        <span>Width</span>
        <input
          type="range" min={0.2} max={3} step={0.1}
          value={p.widthScale}
          onChange={e => p.setWidthScale(parseFloat(e.target.value))}
          style={{ width: 100 }}
        />
        <span style={{ minWidth: 28 }}>{p.widthScale.toFixed(1)}×</span>
      </label>
      <label style={sliderLabel} title="Effect only visible while zooming the map. 0 = ribbons stay the same px width at all zoom levels; 1 = ribbons grow with zoom (fixed geographic width)">
        <span>Zoom</span>
        <input
          type="range" min={0} max={1} step={0.05}
          value={p.geoScale}
          onChange={e => p.setGeoScale(parseFloat(e.target.value))}
          style={{ width: 100 }}
        />
        <span style={{ minWidth: 28 }}>{p.geoScale.toFixed(2)}</span>
      </label>
      {p.hitPad !== undefined && p.setHitPad && (
        <label style={sliderLabel} title="px hit-padding around ribbons for hover detection">
          <span>Hit pad</span>
          <input
            type="range" min={0} max={20} step={1}
            value={p.hitPad}
            onChange={e => p.setHitPad!(parseInt(e.target.value))}
            style={{ width: 80 }}
          />
          <span style={{ minWidth: 28 }}>{p.hitPad}px</span>
        </label>
      )}
    </>
  )
}
