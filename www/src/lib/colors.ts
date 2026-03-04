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
      'Lincoln (Bus)':       '#EF8D2E',  // orange
      'Lincoln (Autos)':     '#DC3545',  // red
      'Amtrak / NJ Transit': '#E5B820',  // gold
      'PATH (Downtown)':     '#AB63FA',  // purple
      'PATH (Uptown)':       '#CE93F9',  // light purple
      'Holland (Bus)':       '#F5BA6A',  // light orange
      'Holland (Autos)':     '#E8787A',  // pink
      'Ferry':               '#1E88E5',  // blue
    },
  },
]

export const DEFAULT_SCHEME = COLOR_SCHEMES[0]
