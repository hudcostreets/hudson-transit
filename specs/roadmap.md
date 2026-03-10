# Hub Bound Travel - Roadmap

Rename from `hudson-transit` to `hub-bound-travel`. Host at `cbd.hccs.dev`.

## Done

- [URL state (`use-prms`)](done/use-prms.md)
- [Keyboard shortcuts + dark mode](done/kbd-dark-mode.md)
- [Unified hover info](done/hover-info.md)
- [Unified chart](done/unified-chart.md)
- [Crossing/mode icons](done/icons.md)

## Next

- [Full NYMTC extraction (all sectors)](extraction.md)
- [Additional visualizations](visualizations.md)
- [Geo-Sankey flow map](geo-sankey.md)
- [Data API and explorer](data-api.md)
- Project rename + deploy (`hub-bound-travel`, `cbd.hccs.dev`)

## Dependency order

```
Extraction ──→ More visualizations (needs more data)
           ├──→ Geo-Sankey map (needs all sectors + coordinates)
           └──→ Data API (needs clean dataset)
Rename ── can happen anytime
```
