import type { ModeRecord, CrossingRecord, DayMode } from './types'
import { CROSSING_LABELS, DAY_MODES } from './types'

/** Pivot mode records into {year -> {mode -> passengers}} for "entering" direction */
export function pivotModes(records: ModeRecord[]): Map<number, Record<string, number>> {
  const entering = records.filter(r => r.direction === 'entering')
  const result = new Map<number, Record<string, number>>()
  for (const r of entering) {
    if (!result.has(r.year)) result.set(r.year, {})
    result.get(r.year)![r.mode] = r.passengers
  }
  return result
}

/** Get sorted unique years from mode records */
export function modeYears(records: ModeRecord[]): number[] {
  return [...new Set(records.filter(r => r.direction === 'entering').map(r => r.year))].sort()
}

/** Get mode entering values as arrays aligned with years */
export function modeSeriesArrays(records: ModeRecord[]) {
  const years = modeYears(records)
  const pivot = pivotModes(records)
  const series: Record<string, number[]> = {}
  for (const mode of DAY_MODES) {
    series[mode] = years.map(y => pivot.get(y)?.[mode] ?? 0)
  }
  return { years, series }
}

/** Pivot crossing records into {year -> {label -> passengers}} */
export function pivotCrossings(records: CrossingRecord[]): Map<number, Record<string, number>> {
  const result = new Map<number, Record<string, number>>()
  for (const r of records) {
    const cl = CROSSING_LABELS.find(c => c.crossing === r.crossing && c.mode === r.mode)
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
export function crossingSeriesArrays(records: CrossingRecord[]) {
  const years = crossingYears(records)
  const pivot = pivotCrossings(records)
  const labels = CROSSING_LABELS.map(c => c.label)
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

/** Compute recovery percentages relative to a base year */
export function recoveryPct(
  records: ModeRecord[],
  baseYear: number,
): { years: number[], series: Record<DayMode, number[]> } {
  const { years, series } = modeSeriesArrays(records)
  const baseIdx = years.indexOf(baseYear)
  if (baseIdx === -1) return { years: [], series: {} as Record<DayMode, number[]> }
  const filteredYears = years.filter(y => y >= baseYear)
  const result = {} as Record<DayMode, number[]>
  for (const mode of DAY_MODES) {
    const base = series[mode][baseIdx]
    result[mode] = filteredYears.map(y => {
      const idx = years.indexOf(y)
      return base > 0 ? series[mode][idx] / base : 0
    })
  }
  return { years: filteredYears, series: result }
}
