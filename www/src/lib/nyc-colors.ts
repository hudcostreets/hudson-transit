// `/nyc` series colors + stacking order, shared by `NycBubbleChart` and the
// OG-image data build (`scripts/og-data.ts`).
import { DEFAULT_SCHEME } from './colors'
import type { NycMode, Sector } from './nyc-types'

export const MODE_COLORS: Record<NycMode, string> = {
  Auto: DEFAULT_SCHEME.mode.Autos,
  Bus: DEFAULT_SCHEME.mode.Bus,
  Subway: DEFAULT_SCHEME.mode.PATH,
  Rail: DEFAULT_SCHEME.mode.Rail,
  Ferry: DEFAULT_SCHEME.mode.Ferries,
}
export const SECTOR_COLORS: Record<Sector, string> = {
  nj: '#EF8D2E',
  queens: '#9333EA',
  brooklyn: '#14B8A6',
  '60th_street': '#4F46E5',
  staten_island: '#FFA500',
  roosevelt_island: '#FECB52',
}

export const SECTOR_ORDER: Sector[] = ['60th_street', 'queens', 'brooklyn', 'nj', 'staten_island', 'roosevelt_island']
