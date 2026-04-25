import type { CrossingLabel, CrossingRecord, Direction, TimePeriod } from './types'
import { CROSSING_LABELS } from './types'

/** Pre-filter crossing records by direction and time period */
export function filterCrossings(
  records: CrossingRecord[],
  direction: Direction,
  timePeriod: TimePeriod,
): CrossingRecord[] {
  return records.filter(r => r.direction === direction && r.time_period === timePeriod)
}

// Default mode → display-label mapping for NJ data. NYC callers can pass
// their own via `aggregateByMode(records, modeLabels)` (e.g. Subway/Rail/
// Ferry/Auto/Bus instead of PATH/Rail/Ferries/Autos/Bus).
const NJ_MODE_LABELS: Record<string, string> = {
  Autos: 'Autos',
  Bus: 'Bus',
  PATH: 'PATH',
  Rail: 'Rail',
  Ferry: 'Ferries',
}

/** Aggregate crossing records by mode (summing across crossings) */
export function aggregateByMode(
  records: CrossingRecord[],
  modeLabels: Record<string, string> = NJ_MODE_LABELS,
) {
  const years = crossingYears(records)
  const byYearMode = new Map<number, Record<string, number>>()
  for (const r of records) {
    if (!byYearMode.has(r.year)) byYearMode.set(r.year, {})
    const m = byYearMode.get(r.year)!
    m[r.mode] = (m[r.mode] ?? 0) + r.passengers
  }
  const labels = Object.values(modeLabels)
  const series: Record<string, number[]> = {}
  for (const [dataMode, label] of Object.entries(modeLabels)) {
    series[label] = years.map(y => byYearMode.get(y)?.[dataMode] ?? 0)
  }
  return { years, series, labels }
}

/** Pivot crossing records into {year -> {label -> passengers}} */
export function pivotCrossings(
  records: CrossingRecord[],
  crossingLabels: CrossingLabel[] = CROSSING_LABELS,
): Map<number, Record<string, number>> {
  const result = new Map<number, Record<string, number>>()
  for (const r of records) {
    const cl = crossingLabels.find(c => c.crossing === r.crossing && c.mode === r.mode)
    if (!cl) continue
    if (!result.has(r.year)) result.set(r.year, {})
    result.get(r.year)![cl.label] = r.passengers
  }
  return result
}

/** Get sorted unique years from crossing records */
export function crossingYears(records: CrossingRecord[]): number[] {
  return [...new Set(records.map(r => r.year))].sort()
}

/** Get crossing values as arrays aligned with years */
export function crossingSeriesArrays(
  records: CrossingRecord[],
  crossingLabels: CrossingLabel[] = CROSSING_LABELS,
) {
  const years = crossingYears(records)
  const pivot = pivotCrossings(records, crossingLabels)
  const labels = crossingLabels.map(c => c.label)
  const series: Record<string, number[]> = {}
  for (const label of labels) {
    series[label] = years.map(y => pivot.get(y)?.[label] ?? 0)
  }
  return { years, series, labels }
}

/** Compute percentage arrays from absolute arrays */
export function toPercentages(
  years: number[],
  series: Record<string, number[]>,
  keys: string[],
): Record<string, number[]> {
  const totals = years.map((_, i) =>
    keys.reduce((sum, k) => sum + (series[k]?.[i] ?? 0), 0)
  )
  const pct: Record<string, number[]> = {}
  for (const k of keys) {
    pct[k] = (series[k] ?? []).map((v, i) => totals[i] > 0 ? v / totals[i] : 0)
  }
  return pct
}
