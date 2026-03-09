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
    name: 'Semantic',
    // Mode colors: red=cars, orange=bus, purple=train, blue=ferry
    dayMode: {
      AUTO:  '#DC3545',  // red
      BUS:   '#EF8D2E',  // orange
      PATH:  '#9333EA',  // purple
      RAIL:  '#7C3AED',  // violet (train)
      FERRY: '#14B8A6',  // teal
    },
    crossing: {
      'Lincoln (Bus)':       '#FFA500',  // pure orange (bright, toward yellow)
      'Lincoln (Autos)':     '#EF4444',  // bright red
      'Amtrak / NJ Transit': '#7C3AED',  // violet (train family)
      'PATH (Downtown)':     '#9333EA',  // purple
      'PATH (Uptown)':       '#C084FC',  // light purple
      'Holland (Bus)':       '#C89B7B',  // muted tan / light brown
      'Holland (Autos)':     '#F87171',  // light red / rose
      'Ferry':               '#14B8A6',  // teal
    },
    mode: {
      Autos: '#EF4444',  // red
      Bus:   '#FFA500',  // pure orange
      PATH:  '#9333EA',  // purple
      Rail:  '#7C3AED',  // violet
      Ferry: '#14B8A6',  // teal
    },
  },
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
]

export const DEFAULT_SCHEME = COLOR_SCHEMES[0]
