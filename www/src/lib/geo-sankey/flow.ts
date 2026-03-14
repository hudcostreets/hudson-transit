import type { LatLon, FlowNode, FlowTree, FlowRenderOpts } from './types'
import { geoConstants, pxToHalfDeg, pxToDeg } from './geo'
import { directedBezier, bearingPerpLeft } from './path'
import { ribbon, ribbonArrow } from './ribbon'

const { max, cos, sin, PI } = Math

export function nodeWeight(node: FlowNode): number {
  return node.type === 'source'
    ? node.weight
    : node.children.reduce((s, c) => s + nodeWeight(c), 0)
}

export function nodeSources(node: FlowNode): { id?: string; pos: LatLon }[] {
  if (node.type === 'source') return [{ id: node.id, pos: node.pos }]
  return node.children.flatMap(c => nodeSources(c))
}

export interface FlowFeature {
  ring: [number, number][]
  width: number
  nodeId?: string
  terminal: boolean
}

export function renderFlowTree(
  tree: FlowTree,
  maxPax: number,
  totalPax: number,
  opts: FlowRenderOpts,
): FlowFeature[] {
  const {
    zoom,
    refLat,
    geoScale = 1,
    widthScale = 1,
    arrowWingFactor = 1.8,
    arrowLenFactor = 1.2,
  } = opts
  const { lngScale, degPerPxZ12 } = geoConstants(refLat)

  const pxW = (weight: number) =>
    max(1, (Math.round(totalPax * weight) / maxPax) * 30 * widthScale)

  function nodeWidth(node: FlowNode): number {
    if (node.type === 'source') return pxW(node.weight)
    return node.children.reduce((s, c) => s + nodeWidth(c), 0)
  }

  const features: FlowFeature[] = []

  function renderNode(
    node: FlowNode,
    targetPos: LatLon,
    terminal: boolean,
    arriveBearing?: number,
    straightEnd?: LatLon,
  ) {
    const width = nodeWidth(node)
    const hw = pxToHalfDeg(width, zoom, geoScale, degPerPxZ12)
    const departBearing = node.type === 'merge' ? node.bearing : undefined
    let curveStart = node.pos
    const straightStart: LatLon[] = []
    if (node.type === 'merge') {
      const depLen = hw * 1.5
      const rad = node.bearing * PI / 180
      curveStart = [
        node.pos[0] + cos(rad) * depLen,
        node.pos[1] + sin(rad) * depLen * lngScale,
      ]
      straightStart.push(node.pos)
    }
    const curvePts = directedBezier(curveStart, targetPos, departBearing, arriveBearing)
    const path = [...straightStart, ...curvePts, ...(straightEnd ? [straightEnd] : [])]
    const ring = terminal
      ? ribbonArrow(path, hw, lngScale, {
          wingFactor: arrowWingFactor,
          lenFactor: arrowLenFactor,
          widthPx: width,
        })
      : ribbon(path, hw, lngScale)
    if (ring.length) {
      features.push({
        ring,
        width,
        nodeId: node.type === 'source' ? node.id : undefined,
        terminal,
      })
    }

    if (node.type === 'merge') {
      const [perpLat, perpLon] = bearingPerpLeft(node.bearing)
      const rad = node.bearing * PI / 180
      const fwdLat = cos(rad), fwdLon = sin(rad)
      const approachLen = hw * 1.5

      const childWidths = node.children.map(c => nodeWidth(c))
      const totalW = childWidths.reduce((s, w) => s + w, 0)
      let cumW = 0
      for (let ci = 0; ci < node.children.length; ci++) {
        const cw = childWidths[ci]
        const centerOffset = -totalW / 2 + cumW + cw / 2
        cumW += cw
        const offsetDeg = pxToDeg(centerOffset, zoom, geoScale, degPerPxZ12)
        const childEnd: LatLon = [
          node.pos[0] + perpLat * offsetDeg,
          node.pos[1] + perpLon * offsetDeg * lngScale,
        ]
        const childApproach: LatLon = [
          childEnd[0] - fwdLat * approachLen,
          childEnd[1] - fwdLon * approachLen * lngScale,
        ]
        renderNode(node.children[ci], childApproach, false, node.bearing, childEnd)
      }
    }
  }

  renderNode(tree.root, tree.destPos, true)
  return features
}
