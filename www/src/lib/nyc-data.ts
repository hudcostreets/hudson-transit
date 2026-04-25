// Aggregate raw AppendixIII (hourly) + vehicles (pre-aggregated) into
// `NycRecord[]` with one row per (year, sector, mode, direction, time_period).
//
// - AppendixIII passengers (sections A/B/C/F) are summed across the
//   hours that make up each time_period.
// - Auto persons are derived from `vehicles.json` mode='Auto' by
//   multiplying vehicle counts by `AUTO_OCCUPANCY` (~1.30, derived
//   from NJ where both pass + veh counts exist).

import type { CrossingRecord, Direction, TimePeriod } from './types'
import {
  type AppendixIIIRecord, type NycMode, type NycRecord, type Sector,
  AUTO_OCCUPANCY, SECTION_TO_MODE, TIME_PERIOD_HOURS,
} from './nyc-types'

const TIME_PERIODS: TimePeriod[] = ['peak_1hr', 'peak_period', '24hr']

function key(year: number, sector: Sector, mode: NycMode, direction: Direction, time_period: TimePeriod): string {
  return `${year}|${sector}|${mode}|${direction}|${time_period}`
}

export function buildNycRecords(
  appendixIii: AppendixIIIRecord[],
  vehicles: CrossingRecord[],
): NycRecord[] {
  const acc = new Map<string, NycRecord>()
  const ensure = (year: number, sector: Sector, mode: NycMode, direction: Direction, time_period: TimePeriod): NycRecord => {
    const k = key(year, sector, mode, direction, time_period)
    let r = acc.get(k)
    if (!r) {
      r = { year, sector, mode, direction, time_period, persons: 0 }
      acc.set(k, r)
    }
    return r
  }

  // AppendixIII: sum hourly passengers into each time_period bucket.
  for (const r of appendixIii) {
    if (r.measure !== 'passengers') continue
    const mode = SECTION_TO_MODE[r.section]
    for (const tp of TIME_PERIODS) {
      const hours = TIME_PERIOD_HOURS[r.direction][tp]
      if (!hours.includes(r.hour)) continue
      ensure(r.year, r.sector, mode, r.direction, tp).persons += r.value
    }
  }

  // Vehicles → autos via occupancy.
  for (const r of vehicles) {
    if (r.mode !== 'Auto') continue
    const direction = r.direction as Direction
    const time_period = r.time_period as TimePeriod
    const sector = r.sector as Sector
    ensure(r.year, sector, 'Auto', direction, time_period).persons += r.passengers * AUTO_OCCUPANCY
  }

  return [...acc.values()]
}

// Total persons across all sector × mode for a given (year, direction, time_period).
// Used to compute mode-share / sector-share percentages.
export function totalsByYear(
  records: NycRecord[],
  direction: Direction,
  time_period: TimePeriod,
): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of records) {
    if (r.direction !== direction || r.time_period !== time_period) continue
    out.set(r.year, (out.get(r.year) ?? 0) + r.persons)
  }
  return out
}
