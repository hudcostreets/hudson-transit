/** SVG data-URI icons for each crossing/mode, sized for Plotly layout.images */

function svgDataUri(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg.trim())
}

// Bus silhouette
const busSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23555">
  <path d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 001 1h1a1 1 0 001-1v-1h8v1a1 1 0 001 1h1a1 1 0 001-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4S4 2.5 4 6v10zm3.5 1a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm9 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM5 10V6h14v4H5z"/>
</svg>`

// Car silhouette
const carSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23555">
  <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm11 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM5 11l1.5-4.5h11L19 11H5z"/>
</svg>`

// Train (PATH/Rail)
const trainSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23555">
  <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2h3.54l2 2H18v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm9 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM18 10H6V6h12v4z"/>
</svg>`

// Ferry/boat
const ferrySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23555">
  <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42a1 1 0 00-.66 1.28L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z"/>
</svg>`

export const CROSSING_ICONS: Record<string, string> = {
  'Lincoln (Bus)': svgDataUri(busSvg),
  'Lincoln (Autos)': svgDataUri(carSvg),
  'Holland (Bus)': svgDataUri(busSvg),
  'Holland (Autos)': svgDataUri(carSvg),
  'PATH (Downtown)': svgDataUri(trainSvg),
  'PATH (Uptown)': svgDataUri(trainSvg),
  'Amtrak / NJ Transit': svgDataUri(trainSvg),
  'Ferry': svgDataUri(ferrySvg),
}

export const MODE_ICONS: Record<string, string> = {
  'Bus': svgDataUri(busSvg),
  'Autos': svgDataUri(carSvg),
  'PATH': svgDataUri(trainSvg),
  'Rail': svgDataUri(trainSvg),
  'Ferry': svgDataUri(ferrySvg),
}
