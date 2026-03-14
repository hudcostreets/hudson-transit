import type { LatLon } from './types'

const { cos, pow, PI } = Math

export function geoConstants(refLat: number) {
  const refLatRad = refLat * PI / 180
  const cosRef = cos(refLatRad)
  const lngScale = 1 / cosRef
  const degPerPxZ12 = 156543.03 * cosRef / (pow(2, 12) * 111320)
  return { cosRef, lngScale, degPerPxZ12 }
}

export function pxToHalfDeg(
  widthPx: number,
  zoom: number,
  geoScale: number,
  degPerPxZ12: number,
): number {
  return (widthPx / 2) * degPerPxZ12 * pow(2, (geoScale - 1) * (zoom - 12))
}

export function pxToDeg(
  px: number,
  zoom: number,
  geoScale: number,
  degPerPxZ12: number,
): number {
  return px * degPerPxZ12 * pow(2, (geoScale - 1) * (zoom - 12))
}

export function toGeoJSON(path: LatLon[]): [number, number][] {
  return path.map(([lat, lon]) => [lon, lat])
}

export function offsetPath(path: LatLon[], offset: number): LatLon[] {
  if (path.length < 2 || offset === 0) return path
  const { sqrt } = Math
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
