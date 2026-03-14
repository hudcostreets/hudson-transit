import type { LatLon } from './types'
import { perpAt, fwdAt } from './path'

const { sqrt, max, min } = Math

export function ribbon(
  path: LatLon[],
  halfW: number,
  lngScale: number,
): [number, number][] {
  const n = path.length
  if (n < 2) return []
  const left: [number, number][] = []
  const right: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const [pLat, pLng] = perpAt(path, i)
    left.push([path[i][1] + pLng * halfW * lngScale, path[i][0] + pLat * halfW])
    right.push([path[i][1] - pLng * halfW * lngScale, path[i][0] - pLat * halfW])
  }
  const ring = [...left, ...right.reverse()]
  ring.push(ring[0])
  return ring
}

export interface RibbonArrowOpts {
  wingFactor?: number    // default 1.8
  lenFactor?: number     // default 1.2
  widthPx?: number       // for adaptive wing sizing
}

export function ribbonArrow(
  path: LatLon[],
  halfW: number,
  lngScale: number,
  opts: RibbonArrowOpts = {},
): [number, number][] {
  const {
    wingFactor = 1.8,
    lenFactor = 1.2,
    widthPx,
  } = opts
  const n = path.length
  if (n < 2) return []

  const cumLen = [0]
  for (let i = 1; i < n; i++) {
    const dy = path[i][0] - path[i - 1][0], dx = path[i][1] - path[i - 1][1]
    cumLen.push(cumLen[i - 1] + sqrt(dy * dy + dx * dx))
  }
  const pathLen = cumLen[n - 1]

  const desiredArrowLen = halfW * 2 * lenFactor
  const arrowLen = min(desiredArrowLen, pathLen * 0.4)
  const arrowScale = desiredArrowLen > 0 ? arrowLen / desiredArrowLen : 1

  const effectiveWing = widthPx != null && widthPx < 8
    ? wingFactor + (8 - widthPx) * 0.15
    : wingFactor
  const arrowHalfW = halfW * (1 + (effectiveWing - 1) * arrowScale)
  const ls = lngScale

  const baseDist = pathLen - arrowLen

  const avgStart = max(0, n - 1 - Math.ceil(n * 0.25))
  let fwdLat = path[n - 1][0] - path[avgStart][0]
  let fwdLon = path[n - 1][1] - path[avgStart][1]
  const fwdLen = sqrt(fwdLat * fwdLat + fwdLon * fwdLon)
  if (fwdLen > 0) { fwdLat /= fwdLen; fwdLon /= fwdLen }
  else { fwdLat = fwdAt(path, n - 1)[0]; fwdLon = fwdAt(path, n - 1)[1] }
  const pLat = -fwdLon, pLng = fwdLat

  const baseLat = path[n - 1][0] - fwdLat * arrowLen
  const baseLng = path[n - 1][1] - fwdLon * arrowLen

  const left: [number, number][] = []
  const right: [number, number][] = []

  for (let i = 0; i < n; i++) {
    if (cumLen[i] > baseDist) break
    const [pL, pN] = perpAt(path, i)
    left.push([path[i][1] + pN * halfW * ls, path[i][0] + pL * halfW])
    right.push([path[i][1] - pN * halfW * ls, path[i][0] - pL * halfW])
  }

  left.push([baseLng + pLng * halfW * ls, baseLat + pLat * halfW])
  right.push([baseLng - pLng * halfW * ls, baseLat - pLat * halfW])
  left.push([baseLng + pLng * arrowHalfW * ls, baseLat + pLat * arrowHalfW])
  right.push([baseLng - pLng * arrowHalfW * ls, baseLat - pLat * arrowHalfW])

  const tip: [number, number] = [path[n - 1][1], path[n - 1][0]]
  const ring = [...left, tip, ...right.reverse()]
  ring.push(ring[0])
  return ring
}
