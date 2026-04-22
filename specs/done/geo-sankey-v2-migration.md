# Migrate GeoSankey component to FlowGraph + `geo-sankey/react` hooks

## Context

`geo-sankey` HEAD has two APIs:

1. **FlowTree** (legacy) — hierarchical `FlowTree` type, rendered via
   `renderFlows()`. `GeoSankey.tsx` currently uses this for the ferry
   Sankey overlay (lines 64–117: `FERRY_TREES`).

2. **FlowGraph** (current) — flat `{ nodes: GFlowNode[], edges: GFlowEdge[] }`.
   Rendered via `renderFlowGraph` / `renderFlowGraphSinglePoly`. Supports
   editing, undo/redo, selection, per-edge styling, auto-weight
   propagation, and export/import.

FlowTree is vestigial — no new features ship for it. This spec migrates
hbt's ferry rendering from FlowTree → FlowGraph and optionally adopts
the editing hooks so users can tweak the diagram and export it.

## What's new in `geo-sankey` HEAD

### Core (`geo-sankey`)

- `GFlowNode.velocity?: number` — per-node bezier control-point distance.
- `GFlowEdge.weight: number | 'auto'` — auto-derived weights (merge
  output = sum of inputs, through-node output = input, split outputs
  share remainder).
- `resolveEdgeWeights(graph)` — topological resolver.
- `renderEdgeCenterlines(graph, opts)` — per-edge bezier LineStrings for
  hit-testing.
- `FlowGraphOpts.mPerWeight?: number` — physical-unit widths (meters per
  weight, zoom-aware).

### React (`geo-sankey/react`)

Composable hooks:

| Hook | Purpose |
|---|---|
| `useGraphState(initial)` | Graph + undo/redo machine (`graph`, `setGraph`, `pushGraph`, `undo`, `redo`) |
| `useGraphSelection(graph)` | Selection array, `toggleOrReplace`, `selectedNodes/Edges`, `resolvedWeights`, `nodeRoleOf`, `aggEdge` |
| `useGraphMutations(gs, sel)` | `addNode`, `deleteNode`, `renameNode`, `addEdge`, `splitEdgeAt`, `reverseEdge`, … (13 ops) |
| `useSceneIO(args)` | Export JSON/TS, copy graph to clipboard, paste-import modal, auto-fit |

Reference components:

| Component | Purpose |
|---|---|
| `<Drawer>` + `Row`, `Slider`, `Check` | Collapsible side drawer with form primitives |
| `<SelectionSection>` | Drawer content for selected nodes/edges (role, id, label, weight, add-edge dropdowns) |
| `<NodeOverlay>` | On-map rotation + velocity handles for selected node |

Scene serialization:
- `graphToTS(graph)` — emits `{ nodes: [...], edges: [...] }` as a TS literal.
  Paste-friendly for the "edit in browser → feed to Claude → update source" flow.
- `sceneToTS(scene)` / `sceneToJSON(scene)` — full scene with opts + view.
- `parseScene(text)` — accepts JSON, TS literal, or bare graph literal.

## Migration steps

### 1. Replace `FERRY_TREES` with a `FlowGraph` literal

The existing tree:
```ts
const FERRY_TREES: FlowTree[] = [
  { dest: 'MT39', destPos: [...], root: { type: 'merge', ... } },
  { dest: 'BPT',  destPos: [...], root: { type: 'merge', ... } },
  { dest: 'Hob So', destPos: [...], root: { type: 'split', ... } },
]
```

Becomes a flat graph:
```ts
import type { FlowGraph } from 'geo-sankey'

const ferryGraph: FlowGraph = {
  nodes: [
    { id: 'hob-so',   pos: [40.7359, -74.0275], bearing: 90, label: 'Hob So' },
    { id: 'hob-split', pos: [40.7359, -74.0230], bearing: 90 },
    { id: 'hob-14',   pos: [40.7505, -74.0241], bearing: 90, label: 'Hob 14' },
    { id: 'whk',      pos: [40.7771, -74.0136], label: 'WHK' },
    { id: 'ut-merge',  pos: [40.7530, -74.0160], bearing: 30 },
    { id: 'mt-merge',  pos: [40.7565, -74.0120], bearing: 110 },
    { id: 'mt39',      pos: [40.7555, -74.0060], label: 'MT39' },
    { id: 'ph',        pos: [40.7138, -74.0337], label: 'PH' },
    { id: 'dt-merge',  pos: [40.7142, -74.0210], bearing: 90 },
    { id: 'bpt',       pos: [40.7142, -74.0169], label: 'BPT' },
  ],
  edges: [
    { from: 'hob-so', to: 'hob-split', weight: 0.30 },
    { from: 'hob-split', to: 'ut-merge', weight: 0.15 },
    { from: 'hob-split', to: 'dt-merge', weight: 0.15 },
    { from: 'hob-14', to: 'ut-merge', weight: 0.20 },
    { from: 'ut-merge', to: 'mt-merge', weight: 'auto' },
    { from: 'whk', to: 'mt-merge', weight: 0.30 },
    { from: 'mt-merge', to: 'mt39', weight: 'auto' },
    { from: 'ph', to: 'dt-merge', weight: 0.20 },
    { from: 'dt-merge', to: 'bpt', weight: 'auto' },
  ],
}
```

The weights here are fractions of total ferry pax — hbt's `pxPerWeight`
callback scales them by actual volume + maxPassengers.

### 2. Replace `renderFlows` with `renderFlowGraphSinglePoly`

Before:
```ts
const fc = renderFlows(FERRY_TREES, {
  refLat: REF_LAT, zoom, geoScale, color, key,
  pxPerWeight, arrowWing, arrowLen,
  reverse: direction === 'leaving',
  singlePoly: true, plugFraction: 0.3, plugBearingDeg: 1,
})
```

After:
```ts
import { renderFlowGraphSinglePoly } from 'geo-sankey'

const fc = renderFlowGraphSinglePoly(ferryGraph, {
  refLat: REF_LAT, zoom, geoScale, pxPerWeight,
  color, wing: 0.4, angle: 45,
  bezierN: 20, nodeApproach: 0.5, creaseSkip: 1,
})
```

Note: `renderFlowGraphSinglePoly` doesn't have a `reverse` param. For
the `direction === 'leaving'` case, either:
- Reverse the graph edges (swap `from`/`to` on all edges).
- Or pass a `reversed` copy of the graph.

A one-liner: `const g = direction === 'leaving' ? reverseGraph(ferryGraph) : ferryGraph`
where `reverseGraph` swaps `from`/`to` on all edges.

### 3. (Optional) Adopt editing hooks

If you want users to be able to tweak the ferry diagram in-browser and
export the result:

```tsx
import { useGraphState, useGraphSelection, useGraphMutations, useSceneIO } from 'geo-sankey/react'

const gs = useGraphState(ferryGraph)
const sel = useGraphSelection(gs.graph)
const mut = useGraphMutations(gs, sel)
const io = useSceneIO({ graph: gs.graph, ... })
```

Then render `<NodeOverlay>`, `<SelectionSection>`, etc. as desired.

Alternatively, since the demo site at `geo-sankey.rbw.sh` already has
the full editing UI, you can:
1. Open the HBT Ferry example there.
2. Edit to taste (move nodes, adjust weights, etc.).
3. `cmd+shift+g` to copy the graph as a TS literal.
4. Paste into your source file.

### 4. Remove FlowTree imports

Delete all imports of `FlowTree`, `FlowNode`, `renderFlows`, `flowSources`
from `geo-sankey`. Replace with `FlowGraph` + `renderFlowGraph*`.

The non-ferry flows (tunnel/bridge ribbon arrows) currently use their own
rendering path (`smoothPath`, `ribbonArrow`, `offsetPath`). Those are
low-level geo-sankey helpers that still work. No migration needed for them
unless you want them as FlowGraph edges too.

## What stays the same

- `pxToHalfDeg`, `offsetPath`, `smoothPath`, `ribbonArrow` — low-level
  geometry helpers still exported from `geo-sankey`, unchanged. The tunnel
  flow rendering that uses these directly doesn't need to change.
- `use-prms` URL state management, `react-map-gl/maplibre` map rendering —
  hbt already uses these, no change.
- The `workspace:*` dependency resolves to whatever's on disk. Just make
  sure hbt's pnpm-workspace includes the geo-sankey path, or symlink.

## Not needed

- No `flowTreeToFlowGraph` converter. The FlowTree data is small and
  hand-written; rewriting it as FlowGraph is clearer than auto-converting.
- No changes to the tunnel/bridge rendering (those use low-level helpers,
  not FlowTree or FlowGraph).
