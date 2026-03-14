export type LatLon = [number, number]  // [lat, lon]

export type FlowNode =
  | { type: 'source'; id?: string; pos: LatLon; weight: number }
  | { type: 'merge'; pos: LatLon; bearing: number; children: FlowNode[] }

export interface FlowTree {
  id: string
  destPos: LatLon
  root: FlowNode
}

export interface FlowRenderOpts {
  zoom: number
  refLat: number
  geoScale?: number
  widthScale?: number
  maxWidthPx?: number
  arrowWingFactor?: number
  arrowLenFactor?: number
}
