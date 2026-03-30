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
    // Mode colors: red=cars, orange=bus, purple=train, teal=ferry
    // Amtrak shifted toward blue to distinguish from PATH purples
    dayMode: {
      AUTO:  '#DC3545',  // red
      BUS:   '#EF8D2E',  // orange
      PATH:  '#9333EA',  // purple
      RAIL:  '#4F46E5',  // indigo (shifted from violet → blue)
      FERRY: '#14B8A6',  // teal
    },
    crossing: {
      'Lincoln (Bus)':       '#FFA500',  // pure orange
      'Lincoln (Autos)':     '#EF4444',  // bright red
      'Amtrak / NJ Transit': '#4F46E5',  // indigo (distinct from PATH purple)
      'PATH (Downtown)':     '#9333EA',  // purple
      'PATH (Uptown)':       '#C084FC',  // light purple
      'Holland (Bus)':       '#C89B7B',  // muted tan
      'Holland (Autos)':     '#F87171',  // light red / rose
      'Ferries':             '#14B8A6',  // teal
    },
    mode: {
      Autos:   '#EF4444',  // red
      Bus:     '#FFA500',  // pure orange
      PATH:    '#9333EA',  // purple
      Rail:    '#4F46E5',  // indigo
      Ferries: '#14B8A6',  // teal
    },
  },
  {
    name: 'Tyler',
    // High-contrast palette: warmer Amtrak, cooler PATH, distinct from each other
    dayMode: {
      AUTO:  '#E11D48',  // rose
      BUS:   '#F59E0B',  // amber
      PATH:  '#8B5CF6',  // violet
      RAIL:  '#2563EB',  // blue
      FERRY: '#059669',  // emerald
    },
    crossing: {
      'Lincoln (Bus)':       '#F59E0B',  // amber
      'Lincoln (Autos)':     '#E11D48',  // rose
      'Amtrak / NJ Transit': '#2563EB',  // blue (clearly not purple)
      'PATH (Downtown)':     '#8B5CF6',  // violet
      'PATH (Uptown)':       '#A78BFA',  // light violet
      'Holland (Bus)':       '#D97706',  // dark amber
      'Holland (Autos)':     '#FB7185',  // pink
      'Ferries':             '#059669',  // emerald
    },
    mode: {
      Autos:   '#E11D48',  // rose
      Bus:     '#F59E0B',  // amber
      PATH:    '#8B5CF6',  // violet
      Rail:    '#2563EB',  // blue
      Ferries: '#059669',  // emerald
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
      'Ferries':               pc[7],
    },
    mode: {
      Autos: pc[1],
      Bus:   pc[0],
      PATH:  pc[3],
      Rail:  pc[2],
      Ferries: pc[7],
    },
  },
]

export const DEFAULT_SCHEME = COLOR_SCHEMES[0]
