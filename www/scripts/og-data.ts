/**
 * Precompute the per-view series the OG-image cards draw (`worker/og.ts`), so
 * the Worker bundles a few KB of aggregates instead of the ~4MB of source JSON
 * (and doesn't re-derive them per isolate). Reuses the FE's own aggregation,
 * labels, and colors, so cards match the charts.
 *
 * Output: `worker/og-data.json` (generated; gitignored). Run by `pnpm og-data`,
 * which `deploy:worker` and `typecheck:worker` call first.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import crossingsData from '../src/data/crossings.json'
import appendixIiiData from '../src/data/appendix_iii.json'
import vehiclesData from '../src/data/vehicles.json'
import { CROSSING_LABELS, type CrossingRecord, type Direction, type TimePeriod } from '../src/lib/types'
import { DEFAULT_SCHEME } from '../src/lib/colors'
import { buildNycRecords } from '../src/lib/nyc-data'
import { NYC_MODE_ORDER, SECTOR_LABELS, type AppendixIIIRecord } from '../src/lib/nyc-types'
import { MODE_COLORS, SECTOR_COLORS, SECTOR_ORDER } from '../src/lib/nyc-colors'
import type { OgData, OgSeries } from '../worker/og-types'

const DIRECTIONS: Direction[] = ['entering', 'leaving']
const TIME_PERIODS: TimePeriod[] = ['peak_1hr', 'peak_period', '24hr']

const crossings = crossingsData as CrossingRecord[]
const years = [...new Set(crossings.map(r => r.year))].sort((a, b) => a - b)

// `/` groups NJ crossings by crossing (default) or mode; labels + colors as `UnifiedChart`.
const MODE_LABEL: Record<string, string> = { Autos: 'Autos', Bus: 'Bus', PATH: 'PATH', Rail: 'Rail', Ferry: 'Ferries' }
const NJ_MODE_ORDER = ['Autos', 'Bus', 'Rail', 'PATH', 'Ferries']

function series<K extends string>(
  keys: readonly K[],
  label: (k: K) => string,
  color: (k: K) => string,
  value: (k: K, year: number) => number,
): OgSeries[] {
  return keys
    .map(k => ({ label: label(k), color: color(k), values: years.map(y => Math.round(value(k, y))) }))
    .filter(s => s.values.some(v => v > 0))
}

const nyc = buildNycRecords(appendixIiiData as AppendixIIIRecord[], vehiclesData as CrossingRecord[])

const data: OgData = { years, index: {}, nyc: {} }
for (const dir of DIRECTIONS) {
  for (const tp of TIME_PERIODS) {
    const key = `${dir}|${tp}`
    const nj = crossings.filter(r => r.direction === dir && r.time_period === tp)
    const sum = (pred: (r: CrossingRecord) => boolean, year: number) =>
      nj.filter(r => r.year === year && pred(r)).reduce((s, r) => s + r.passengers, 0)
    data.index[key] = {
      crossing: series(
        CROSSING_LABELS,
        c => c.label,
        c => DEFAULT_SCHEME.crossing[c.label],
        (c, y) => sum(r => r.crossing === c.crossing && r.mode === c.mode, y),
      ),
      mode: series(
        NJ_MODE_ORDER,
        m => m,
        m => DEFAULT_SCHEME.mode[m],
        (m, y) => sum(r => MODE_LABEL[r.mode] === m, y),
      ),
    }
    const active = nyc.filter(r => r.direction === dir && r.time_period === tp)
    const nycSum = (pred: (r: typeof active[number]) => boolean, year: number) =>
      active.filter(r => r.year === year && pred(r)).reduce((s, r) => s + r.persons, 0)
    data.nyc[key] = {
      mode: series(NYC_MODE_ORDER, m => m, m => MODE_COLORS[m], (m, y) => nycSum(r => r.mode === m, y)),
      sector: series(SECTOR_ORDER, s => SECTOR_LABELS[s], s => SECTOR_COLORS[s], (s, y) => nycSum(r => r.sector === s, y)),
    }
  }
}

const out = join(dirname(fileURLToPath(import.meta.url)), '../worker/og-data.json')
writeFileSync(out, JSON.stringify(data) + '\n')
console.error(`Wrote ${out} (${JSON.stringify(data).length} bytes)`)
