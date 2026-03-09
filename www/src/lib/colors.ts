// Plotly qualitative color palette
const pc = [
  '#636EFA', // 0
  '#EF553B', // 1
  '#00CC96', // 2
  '#AB63FA', // 3
  '#FFA15A', // 4
  '#19D3F3', // 5
  '#FF6692', // 6
  '#B6E880', // 7
  '#FF97FF', // 8
  '#FECB52', // 9
]

export interface ColorScheme {
  name: string
  dayMode: Record<string, string>
  crossing: Record<string, string>
  mode: Record<string, string>
}

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    name: 'Plotly',
    dayMode: {
      AUTO:  pc[1],
      BUS:   pc[4],
      PATH:  pc[9],
      RAIL:  pc[3],
      FERRY: pc[0],
    },
    crossing: {
      'Lincoln (Bus)':       pc[0],
      'Lincoln (Autos)':     pc[1],
      'Amtrak / NJ Transit': pc[2],
      'PATH (Downtown)':     pc[3],
      'PATH (Uptown)':       pc[4],
      'Holland (Bus)':       pc[5],
      'Holland (Autos)':     pc[6],
      'Ferry':               pc[7],
    },
    mode: {
      Autos: pc[1],
      Bus:   pc[0],
      PATH:  pc[3],
      Rail:  pc[2],
      Ferry: pc[7],
    },
  },
  {
    name: 'Semantic',
    dayMode: {
      AUTO:  '#DC3545',  // red
      BUS:   '#EF8D2E',  // orange
      PATH:  '#AB63FA',  // purple
      RAIL:  '#E5B820',  // gold
      FERRY: '#1E88E5',  // blue
    },
    crossing: {
      'Lincoln (Bus)':       '#FF9F1C',  // bright orange
      'Lincoln (Autos)':     '#EF4444',  // bright red
      'Amtrak / NJ Transit': '#FACC15',  // yellow-gold
      'PATH (Downtown)':     '#A855F7',  // purple
      'PATH (Uptown)':       '#D8B4FE',  // light purple
      'Holland (Bus)':       '#22D3EE',  // cyan (distinct from gold)
      'Holland (Autos)':     '#FB7185',  // rose pink
      'Ferry':               '#3B82F6',  // bright blue
    },
    mode: {
      Autos: '#EF4444',  // bright red
      Bus:   '#FF9F1C',  // bright orange
      PATH:  '#A855F7',  // purple
      Rail:  '#FACC15',  // yellow-gold
      Ferry: '#3B82F6',  // bright blue
    },
  },
]

export const DEFAULT_SCHEME = COLOR_SCHEMES[0]
