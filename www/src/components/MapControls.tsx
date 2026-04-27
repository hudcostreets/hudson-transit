// Shared GeoSankey map controls — width/geo/hit-pad sliders. Used on both
// the home GeoSankey (`/`) and the NYC flow map (`/nyc`). URL-state keys:
//   ws = width scale  (multiplier on ribbon px width)
//   gs = geo scale    (0 = fixed-px ribbon width; 1 = grows with zoom)
//   hp = hit pad      (px hit-padding around ribbons for hover detection)

import { useMemo } from 'react'
import { useUrlState } from 'use-prms'

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
