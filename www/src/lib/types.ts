export interface ModeRecord {
  year: number
  sector: string
  mode: string
  direction: string
  time_period: string
  passengers: number
}

export interface CrossingRecord {
  year: number
  sector: string
  crossing: string
  mode: string
  time_period: string
  passengers: number
}

export type DayMode = 'AUTO' | 'BUS' | 'PATH' | 'RAIL' | 'FERRY'

export const DAY_MODES: DayMode[] = ['AUTO', 'BUS', 'PATH', 'RAIL', 'FERRY']

export interface CrossingLabel {
  crossing: string
  mode: string
  label: string
}

export const CROSSING_LABELS: CrossingLabel[] = [
  { crossing: 'Lincoln Tunnel', mode: 'Bus', label: 'Lincoln (Bus)' },
  { crossing: 'Lincoln Tunnel', mode: 'Autos', label: 'Lincoln (Autos)' },
  { crossing: 'Amtrak/N.J. Transit Tunnels', mode: 'Rail', label: 'Amtrak / NJ Transit' },
  { crossing: 'Downtown PATH Tunnel', mode: 'PATH', label: 'PATH (Downtown)' },
  { crossing: 'Uptown PATH Tunnel', mode: 'PATH', label: 'PATH (Uptown)' },
  { crossing: 'Holland Tunnel', mode: 'Bus', label: 'Holland (Bus)' },
  { crossing: 'Holland Tunnel', mode: 'Autos', label: 'Holland (Autos)' },
  { crossing: 'All Ferry Points', mode: 'Ferry', label: 'Ferry' },
]
