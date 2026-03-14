import type { LatLon } from './types'

const { sqrt, max, min, PI, sin, cos } = Math

export function cubicBezier(
  p0: LatLon,
  p1: LatLon,
  p2: LatLon,
  p3: LatLon,
  n = 20,
): LatLon[] {
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

export function smoothPath(
  pts: LatLon[],
  segsPerSpan = 12,
): { path: LatLon[]; knots: number[] } {
  const n = pts.length
  if (n < 2) return { path: [...pts], knots: pts.map((_, i) => i) }
  const out: LatLon[] = []
  const knots: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[max(i - 1, 0)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[min(i + 2, n - 1)]
    knots.push(out.length)
    for (let s = 0; s < segsPerSpan; s++) {
      const t = s / segsPerSpan, t2 = t * t, t3 = t2 * t
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  knots.push(out.length)
  out.push(pts[n - 1])
  return { path: out, knots }
}

export function sBezier(start: LatLon, end: LatLon): LatLon[] {
  const dLon = end[1] - start[1]
  const dLat = end[0] - start[0]
  const dist = sqrt(dLat * dLat + dLon * dLon)
  const span = max(Math.abs(dLon) * 0.5, dist * 0.35)
  const cp1: LatLon = [start[0], start[1] + span]
  const cp2: LatLon = [end[0], end[1] - span]
  return cubicBezier(start, cp1, cp2, end)
}

export function directedBezier(
  start: LatLon,
  end: LatLon,
  departBearing?: number,
  arriveBearing?: number,
): LatLon[] {
  const dLat = end[0] - start[0], dLon = end[1] - start[1]
  const dist = sqrt(dLat * dLat + dLon * dLon)
  const span = max(dist * 0.4, 0.001)
  const dRad = (departBearing ?? 90) * PI / 180
  const cp1: LatLon = [start[0] + cos(dRad) * span, start[1] + sin(dRad) * span]
  const aRad = (arriveBearing ?? 90) * PI / 180
  const cp2: LatLon = [end[0] - cos(aRad) * span, end[1] - sin(aRad) * span]
  return cubicBezier(start, cp1, cp2, end)
}

export function bearingPerpLeft(bearing: number): LatLon {
  const rad = bearing * PI / 180
  return [sin(rad), -cos(rad)]
}

export function perpAt(path: LatLon[], i: number): LatLon {
  const n = path.length
  let dy = 0, dx = 0
  if (i < n - 1) { dy += path[i + 1][0] - path[i][0]; dx += path[i + 1][1] - path[i][1] }
  if (i > 0) { dy += path[i][0] - path[i - 1][0]; dx += path[i][1] - path[i - 1][1] }
  const len = sqrt(dy * dy + dx * dx)
  if (len === 0) return [0, 0]
  return [-dx / len, dy / len]
}

export function fwdAt(path: LatLon[], i: number): LatLon {
  const n = path.length
  const next = min(i + 1, n - 1), prev = max(i - 1, 0)
  const dy = path[next][0] - path[prev][0], dx = path[next][1] - path[prev][1]
  const len = sqrt(dy * dy + dx * dx)
  if (len === 0) return [0, 0]
  return [dy / len, dx / len]
}
