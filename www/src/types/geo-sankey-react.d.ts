// Interim type shim for `geo-sankey/react`. The upstream dist-branch
// publishes this subpath as raw `.ts`/`.tsx` source; strict tsconfig flags
// (`noUnusedLocals`, `noUnusedParameters`) then surface upstream lint
// errors on every downstream build. Remove this file (and the tsconfig
// `paths` entry) once geo-sankey ships `react/` as compiled `.js` + `.d.ts`
// — see `geo-sankey/specs/react-subpath-dist.md`.
declare module 'geo-sankey/react' {
  import type { ReactNode, RefObject, Dispatch } from 'react'
  import type { FlowGraph } from 'geo-sankey'

  export type GraphAction = any

  export interface UseGraphState {
    graph: FlowGraph
    setGraph: (next: FlowGraph | ((g: FlowGraph) => FlowGraph)) => void
    pushGraph: (next: FlowGraph | ((g: FlowGraph) => FlowGraph)) => void
    pushHistory: (snapshot: FlowGraph) => void
    undo: () => void
    redo: () => void
    canUndo: boolean
    canRedo: boolean
    pastLen: number
    futureLen: number
    dispatch: Dispatch<GraphAction>
  }
  export function useGraphState(initial: FlowGraph | (() => FlowGraph)): UseGraphState

  export type SelectionRef =
    | { type: 'node'; id: string }
    | { type: 'edge'; from: string; to: string }
  export type NodeRole = 'source' | 'sink' | 'split' | 'merge' | 'through' | 'isolated'
  export function selRefEq(a: SelectionRef, b: SelectionRef): boolean

  export interface UseGraphSelection {
    selections: SelectionRef[]
    setSelections: (next: SelectionRef[] | ((prev: SelectionRef[]) => SelectionRef[])) => void
    selection: SelectionRef | null
    toggleOrReplace: (ref: SelectionRef, shift: boolean) => void
    selectedNodes: any[]
    selectedEdges: any[]
    selectedNodeIds: string[]
    selectedEdgeIds: string[]
    resolvedWeights: Map<string, number>
    nodeRoleOf: (id: string) => NodeRole
    aggEdge: (k: string, fromStyle?: boolean) => unknown
  }
  export function useGraphSelection(graph: FlowGraph, opts?: { persist?: 'sessionStorage' | 'none' }): UseGraphSelection

  export interface UseGraphMutations {
    renameNode: (oldId: string, newId: string) => void
    duplicateNodes: (ids: string[]) => void
    updateNode: (id: string, patch: Partial<{ pos: [number, number]; bearing: number; label: string; velocity: number }>) => void
    addNode: (pos: [number, number]) => void
    deleteNode: (id: string) => void
    addEdge: (from: string, to: string) => void
    updateEdge: (from: string, to: string, patch: Partial<{ weight: number | 'auto' }>) => void
    updateEdgeStyle: (from: string, to: string, patch: Partial<{ color: string; opacity: number; widthScale: number }>) => void
    deleteEdge: (from: string, to: string) => void
    reverseEdge: (from: string, to: string) => void
    splitEdgeAt: (from: string, to: string, pos: [number, number]) => void
    applyEdgeStyle: (patch: Partial<{ color: string; opacity: number; widthScale: number }>) => void
    applyEdgeWeight: (weight: number | 'auto') => void
  }
  export function useGraphMutations(gs: UseGraphState, sel: UseGraphSelection): UseGraphMutations

  export interface UseNodeDrag {
    onDragStart: (e: any) => void
    dragging: string | null
    dragPan: boolean
  }
  export function useNodeDrag(mapRef: RefObject<any>, gs: UseGraphState, sel: UseGraphSelection): UseNodeDrag

  export interface UseMapInteraction {
    [k: string]: any
  }
  export function useMapInteraction(...args: any[]): UseMapInteraction

  export interface UseSceneIOArgs {
    graph: FlowGraph
    opts: any
    view: { lat: number; lng: number; zoom: number }
    title: string
    pushGraph: (next: FlowGraph | ((g: FlowGraph) => FlowGraph)) => void
    applyOpts: (o: any) => void
    setView: (v: { lat: number; lng: number; zoom: number }) => void
    mapRef: RefObject<any>
  }
  export interface UseSceneIO {
    exportSceneJSON: () => void
    exportSceneTS: () => void
    copySceneAsTS: () => Promise<void>
    copyGraphAsTS: () => Promise<void>
    openImport: () => void
    openPaste: () => void
    ui: ReactNode
  }
  export function useSceneIO(args: UseSceneIOArgs): UseSceneIO

  export type Scene = any
  export function sceneToTS(scene: Scene): string
  export function sceneToJSON(scene: Scene): string
  export function graphToTS(graph: FlowGraph): string
  export function parseScene(text: string): Scene

  export interface DrawerSection { [k: string]: any }
  const Drawer: (props: any) => any
  export default Drawer
  export const Row: (props: any) => any
  export const Slider: (props: any) => any
  export const Check: (props: any) => any

  export const SelectionSection: (props: any) => any

  export interface NodeOverlayProps {
    nodeId: string
    bearing: number
    pos: [number, number]
    velocity?: number
    refLat: number
    mapRef: RefObject<any>
    onBeginDrag: () => void
    onDragTransient: (bearing: number, velocity: number | undefined) => void
    onResetVelocity: () => void
  }
  export const NodeOverlay: (props: NodeOverlayProps) => any
}
