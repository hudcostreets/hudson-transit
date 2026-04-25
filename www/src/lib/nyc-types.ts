// Multi-sector aggregation types for /nyc views.
//
// AppendixIII records are hourly. To roll them up to time periods we
// sum across hours: peak_1hr is a single hour; peak_period spans 3
// hours; 24hr is all 24 hours. Direction matters: entering peaks at
// 8am / 7-10am, leaving at 5pm / 4-7pm.

import type { Direction, TimePeriod } from './types'

export type Sector = 'nj' | 'queens' | 'brooklyn' | '60th_street' | 'staten_island' | 'roosevelt_island'

export type NycMode = 'Auto' | 'Bus' | 'Subway' | 'Rail' | 'Ferry'

export interface AppendixIIIRecord {
  year: number
  hour: number
  direction: Direction
  section: 'A' | 'B' | 'C' | 'F'
  sector: Sector
  measure: 'buses' | 'cars' | 'passengers' | 'trains'
  value: number
}

// Aggregated to a single (sector, mode, time_period, direction, year) cell.
export interface NycRecord {
  year: number
  sector: Sector
  mode: NycMode
  direction: Direction
  time_period: TimePeriod
  persons: number
}

// Section → mode mapping for AppendixIII passenger counts.
export const SECTION_TO_MODE: Record<'A' | 'B' | 'C' | 'F', NycMode> = {
  A: 'Bus',
  B: 'Subway',  // includes PATH within nj
  C: 'Rail',
  F: 'Ferry',
}

// Hours covered by each (time_period, direction) combination, matching
// the convention in `crossings.json` / `vehicles.json`.
export const TIME_PERIOD_HOURS: Record<Direction, Record<TimePeriod, number[]>> = {
  entering: {
    peak_1hr: [8],
    peak_period: [7, 8, 9],
    '24hr': Array.from({ length: 24 }, (_, i) => i),
  },
  leaving: {
    peak_1hr: [17],
    peak_period: [16, 17, 18],
    '24hr': Array.from({ length: 24 }, (_, i) => i),
  },
}

// Mean ratio of auto persons / auto vehicles in NJ across years/time
// periods/directions, derived from cross-checking `crossings.json`
// against `vehicles.json`. Stable at 1.28–1.32; we use 1.30. Applied
// uniformly to all sectors (NYMTC doesn't publish a per-sector rate).
export const AUTO_OCCUPANCY = 1.30

export const SECTOR_LABELS: Record<Sector, string> = {
  nj: 'NJ',
  queens: 'Queens',
  brooklyn: 'Brooklyn',
  '60th_street': '60th St',
  staten_island: 'Staten Island',
  roosevelt_island: 'Roosevelt Is.',
}

export const NYC_MODE_ORDER: NycMode[] = ['Auto', 'Bus', 'Subway', 'Rail', 'Ferry']
