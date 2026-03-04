// Plotly qualitative color palette (px.colors.qualitative.Plotly)
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

// Day mode colors (matching notebook)
export const DAY_MODE_COLORS: Record<string, string> = {
  AUTO: pc[1],
  BUS: pc[4],
  PATH: pc[9],
  RAIL: pc[3],
  FERRY: pc[0],
}

// Peak crossing colors (sequential assignment per notebook)
export const CROSSING_COLORS: Record<string, string> = {
  'Lincoln (Bus)': pc[0],
  'Lincoln (Autos)': pc[1],
  'Amtrak / NJ Transit': pc[2],
  'PATH (Downtown)': pc[3],
  'PATH (Uptown)': pc[4],
  'Holland (Bus)': pc[5],
  'Holland (Autos)': pc[6],
  'Ferry': pc[7],
}
