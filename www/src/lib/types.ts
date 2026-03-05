export interface CrossingRecord {
  year: number
  sector: string
  crossing: string
  mode: string
  direction: string
  time_period: string
  passengers: number
}

export type ViewMode = 'scatter' | 'bar' | 'pct'
export type Direction = 'entering' | 'leaving'
export type TimePeriod = 'peak_1hr' | 'peak_period' | '24hr'
export type Granularity = 'crossing' | 'mode'

export interface CrossingLabel {
  crossing: string
  mode: string
  label: string
}

export const CROSSING_LABELS: CrossingLabel[] = [
  { crossing: 'All Ferry Points', mode: 'Ferry', label: 'Ferry' },
  { crossing: 'Lincoln Tunnel', mode: 'Bus', label: 'Lincoln (Bus)' },
  { crossing: 'Amtrak/N.J. Transit Tunnels', mode: 'Rail', label: 'Amtrak / NJ Transit' },
  { crossing: 'Downtown PATH Tunnel', mode: 'PATH', label: 'PATH (Downtown)' },
  { crossing: 'Uptown PATH Tunnel', mode: 'PATH', label: 'PATH (Uptown)' },
  { crossing: 'Holland Tunnel', mode: 'Bus', label: 'Holland (Bus)' },
  { crossing: 'Lincoln Tunnel', mode: 'Autos', label: 'Lincoln (Autos)' },
  { crossing: 'Holland Tunnel', mode: 'Autos', label: 'Holland (Autos)' },
]
