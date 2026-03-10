# URL State via `use-prms`

All chart toggle state persisted in URL params:

| Param | Key | Values |
|-------|-----|--------|
| view | `y` | (default: bubble), `n` (bar), `p` (pct), `c` (recovery) |
| direction | `d` | (default: NJ→NY), `nynj` (NY→NJ) |
| time period | `t` | (default: 1h), `3h`, `1d` |
| granularity | `g` | `c` (crossing, default), `m` (mode) |
| annotations | `A` | (default: on), present = off |

Recovery merged as 4th view mode in `UnifiedChart`. Single chart, single toggle bar.
