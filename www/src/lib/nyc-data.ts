// Aggregate raw NYMTC sources into per-crossing flow records for the NYC
// flow map. Three sources are joined:
//
//   - `vehicles.json`              → autos by (sector, crossing)  [Section E equivalent]
//   - `bus_passengers.json`        → buses by (sector, crossing)
//   - `appendix_iii_detail.json`   → subway/rail/ferry by facility line, hourly
//
// `appendix_iii_detail.json` is hourly; we sum its passengers across the
// hours that make up each time_period. Vehicles → persons via the same
// `AUTO_OCCUPANCY` ratio used previously. The result is one row per
// (year, crossingId, mode, direction, time_period).

import type { CrossingRecord, Direction, TimePeriod } from './types'
import {
  type AppendixIIIRecord, type NycMode, type NycRecord, type Sector,
  AUTO_OCCUPANCY, SECTION_TO_MODE, TIME_PERIOD_HOURS,
} from './nyc-types'
import {
  type CrossingId, CROSSINGS,
  VEHICLE_TO_CROSSING, FACILITY_TO_CROSSING, normFacility,
  MERGE_SUBWAY_PAIRS,
} from './nyc-crossings'

const TIME_PERIODS: TimePeriod[] = ['peak_1hr', 'peak_period', '24hr']

// ── Legacy aggregation: one row per (year, sector, mode, direction, time_period).
// Still used by `NycBubbleChart`. The flow-map uses the per-crossing version below.
function legacyKey(year: number, sector: Sector, mode: NycMode, direction: Direction, time_period: TimePeriod): string {
  return `${year}|${sector}|${mode}|${direction}|${time_period}`
}

export function buildNycRecords(
  appendixIii: AppendixIIIRecord[],
  vehicles: CrossingRecord[],
): NycRecord[] {
  const acc = new Map<string, NycRecord>()
  const ensure = (year: number, sector: Sector, mode: NycMode, direction: Direction, time_period: TimePeriod): NycRecord => {
    const k = legacyKey(year, sector, mode, direction, time_period)
    let r = acc.get(k)
    if (!r) {
      r = { year, sector, mode, direction, time_period, persons: 0 }
      acc.set(k, r)
    }
    return r
  }
  for (const r of appendixIii) {
    if (r.measure !== 'passengers') continue
    const mode = SECTION_TO_MODE[r.section]
    for (const tp of TIME_PERIODS) {
      const hours = TIME_PERIOD_HOURS[r.direction][tp]
      if (!hours.includes(r.hour)) continue
      ensure(r.year, r.sector, mode, r.direction, tp).persons += r.value
    }
  }
  for (const r of vehicles) {
    if (r.mode !== 'Auto') continue
    const direction = r.direction as Direction
    const time_period = r.time_period as TimePeriod
    const sector = r.sector as Sector
    ensure(r.year, sector, 'Auto', direction, time_period).persons += r.passengers * AUTO_OCCUPANCY
  }
  return [...acc.values()]
}

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

// Detail-source records (subway/rail/ferry per facility line, hourly).
export interface AppendixIIIDetailRecord {
  year: number
  hour: number
  direction: Direction
  section: string
  sector: Sector | 'express' | 'bqnj' | 'bqsi' | 'westchester'
  facility: string
  measure: 'buses' | 'cars' | 'passengers' | 'trains' | 'occupants' | 'vehicles' | 'bicycles'
  value: number
}

export interface CrossingFlow {
  year: number
  crossingId: CrossingId
  mode: NycMode
  direction: Direction
  time_period: TimePeriod
  persons: number
}

// Section letter → mode (B = subway, C = rail, F (or D in detail data) = ferry).
// Section A is bus and is split per-facility (with crossing overlap); we
// pull buses from `bus_passengers.json` instead, since it's already
// aggregated to time_period and is per-crossing rather than per-operator.
const SECTION_TO_MODE_DETAIL: Record<string, NycMode | undefined> = {
  B: 'Subway',
  C: 'Rail',
  D: 'Ferry',  // (rare in detail file; ferry detail isn't actually present yet)
  F: 'Ferry',
}

function key(year: number, c: CrossingId, m: NycMode, d: Direction, t: TimePeriod): string {
  return `${year}|${c}|${m}|${d}|${t}`
}

export function buildCrossingFlows(
  vehicles: CrossingRecord[],
  buses: CrossingRecord[],
  detail: AppendixIIIDetailRecord[],
  appendixIii: { year: number; hour: number; direction: Direction; sector: string; section: string; measure: string; value: number }[],
): CrossingFlow[] {
  const acc = new Map<string, CrossingFlow>()
  const ensure = (year: number, c: CrossingId, m: NycMode, d: Direction, t: TimePeriod): CrossingFlow => {
    const k = key(year, c, m, d, t)
    let r = acc.get(k)
    if (!r) {
      r = { year, crossingId: c, mode: m, direction: d, time_period: t, persons: 0 }
      acc.set(k, r)
    }
    return r
  }

  // ── 1. Autos from vehicles.json (already per-(crossing, time_period))
  for (const r of vehicles) {
    if (r.mode !== 'Auto') continue
    const cid = VEHICLE_TO_CROSSING[`${r.sector}|${r.crossing}`]
    if (!cid) continue
    ensure(r.year, cid, 'Auto', r.direction as Direction, r.time_period as TimePeriod)
      .persons += r.passengers * AUTO_OCCUPANCY
  }

  // ── 2. Buses from bus_passengers.json (already per-(crossing, time_period))
  for (const r of buses) {
    const cid = VEHICLE_TO_CROSSING[`${r.sector}|${r.crossing}`]
    if (!cid) continue
    ensure(r.year, cid, 'Bus', r.direction as Direction, r.time_period as TimePeriod)
      .persons += r.passengers
  }

  // ── 3. Subway / Rail per facility from appendix_iii_detail.json (hourly)
  for (const r of detail) {
    if (r.measure !== 'passengers') continue
    const mode = SECTION_TO_MODE_DETAIL[r.section]
    if (!mode) continue
    const fkey = `${r.sector}|${normFacility(r.facility)}`
    const cid = FACILITY_TO_CROSSING[fkey]
    if (!cid) continue
    for (const tp of TIME_PERIODS) {
      const hours = TIME_PERIOD_HOURS[r.direction][tp]
      if (!hours.includes(r.hour)) continue
      ensure(r.year, cid, mode, r.direction, tp).persons += r.value
    }
  }

  // ── 4. Ferries: appendix_iii (sector-aggregated, section F) into the
  //      single ferry crossing per sector — keep as v1 since we don't yet
  //      route per-route.
  const FERRY_CROSSING: Partial<Record<Sector, CrossingId>> = {
    nj: 'nj-ferry',
    staten_island: 'si-ferry',
  }
  for (const r of appendixIii) {
    if (r.measure !== 'passengers') continue
    if (r.section !== 'F') continue
    const cid = FERRY_CROSSING[r.sector as Sector]
    if (!cid) continue
    for (const tp of TIME_PERIODS) {
      const hours = TIME_PERIOD_HOURS[r.direction as Direction][tp]
      if (!hours.includes(r.hour)) continue
      ensure(r.year, cid, 'Ferry', r.direction as Direction, tp).persons += r.value
    }
  }

  // ── 5. Synthetic LIRR: detail data only breaks out Amtrak Empire Service
  //      (~500/hr, "N.e. Corridor") in Queens Section C; true LIRR (~25k/hr
  //      peak) lives only at the sector level. Compute (queens Section C
  //      total) − (qn-amtrak already accumulated) and route the residual
  //      to qn-lirr.
  for (const r of appendixIii) {
    if (r.measure !== 'passengers') continue
    if (r.section !== 'C') continue
    if (r.sector !== 'queens') continue
    for (const tp of TIME_PERIODS) {
      const hours = TIME_PERIOD_HOURS[r.direction as Direction][tp]
      if (!hours.includes(r.hour)) continue
      ensure(r.year, 'qn-lirr', 'Rail', r.direction as Direction, tp).persons += r.value
    }
  }
  // Subtract Amtrak (already accumulated via the detail-data path in step 3)
  // from the qn-lirr totals — both attribute Section C, so qn-lirr should
  // hold only the residual.
  for (const [, flow] of acc) {
    if (flow.crossingId !== 'qn-lirr') continue
    const amtrak = acc.get(key(flow.year, 'qn-amtrak', 'Rail', flow.direction, flow.time_period))
    if (amtrak) flow.persons = Math.max(0, flow.persons - amtrak.persons)
  }

  return [...acc.values()]
}

export function flowSector(c: CrossingId): Sector {
  return CROSSINGS[c].sector
}

/**
 * Collapse paired local+express subway crossings into their merged-trunk
 * crossings (per `MERGE_SUBWAY_PAIRS`). Other crossings pass through.
 * Records sharing the merged crossingId have their persons summed.
 */
export function mergeSubwayFlows(flows: CrossingFlow[]): CrossingFlow[] {
  const acc = new Map<string, CrossingFlow>()
  for (const f of flows) {
    const cid = MERGE_SUBWAY_PAIRS[f.crossingId] ?? f.crossingId
    const k = key(f.year, cid, f.mode, f.direction, f.time_period)
    const existing = acc.get(k)
    if (existing) existing.persons += f.persons
    else acc.set(k, { ...f, crossingId: cid })
  }
  return [...acc.values()]
}
