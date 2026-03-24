/** Color-parameterized SVG data-URI icons for crossings/modes.
 *  Each function returns a data URI with the given fill color. */

function svgUri(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg.trim())
}

function enc(color: string): string {
  return color.replace('#', '%23')
}

// --- Agency logos (simplified, recognizable at small sizes) ---

/** PATH logo: bold "PATH" in a rounded rectangle */
function pathLogo(color: string): string {
  const c = enc(color)
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 32">
  <rect x="1" y="1" width="78" height="30" rx="5" fill="none" stroke="${c}" stroke-width="2.5"/>
  <text x="40" y="22.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="19" fill="${c}" letter-spacing="1">PATH</text>
</svg>`)
}

/** Port Authority logo: "PA" in bold rounded rectangle */
function paLogo(color: string): string {
  const c = enc(color)
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 32">
  <rect x="1" y="1" width="54" height="30" rx="5" fill="none" stroke="${c}" stroke-width="2.5"/>
  <text x="28" y="22.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="19" fill="${c}" letter-spacing="1">PA</text>
</svg>`)
}

/** NJ Transit logo: "NJT" in bold with underline bar */
function njtLogo(color: string): string {
  const c = enc(color)
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32">
  <text x="32" y="21" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="20" fill="${c}">NJT</text>
  <rect x="6" y="25" width="52" height="3" rx="1.5" fill="${c}"/>
</svg>`)
}

/** Amtrak logo: simplified pointed-A chevron */
function amtrakLogo(color: string): string {
  const c = enc(color)
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32">
  <polygon points="24,2 44,28 36,28 24,12 12,28 4,28" fill="${c}"/>
  <rect x="14" y="20" width="20" height="3" rx="1" fill="${c}" opacity="0.5"/>
</svg>`)
}

/** Car silhouette */
function carIcon(color: string): string {
  const c = enc(color)
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24" fill="${c}">
  <path d="M33.5 8.5l-3.2-5.3C29.5 1.8 28 1 26.5 1h-13c-1.5 0-3 .8-3.8 2.2L6.5 8.5C4.5 9 3 10.8 3 13v5c0 1.1.9 2 2 2h1c0 1.7 1.3 3 3 3s3-1.3 3-3h16c0 1.7 1.3 3 3 3s3-1.3 3-3h1c1.1 0 2-.9 2-2v-5c0-2.2-1.5-4-3.5-4.5zM12.5 4h15l2.4 4h-19.8l2.4-4zM9 19c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm22 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z"/>
</svg>`)
}

/** Ferry / NY Waterway boat */
function ferryIcon(color: string): string {
  const c = enc(color)
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" fill="${c}">
  <path d="M24 3v7h8v6l5.5 2-1.8 6.5c-2 1.5-4.2 2.5-6.7 2.5-2.2 0-4-.7-5-1.5-1 .8-2.8 1.5-5 1.5s-4-.7-5-1.5c-1 .8-2.8 1.5-5 1.5-2.5 0-4.7-1-6.7-2.5L.5 18l5.5-2v-6h8V3h4v7h2V3h4z"/>
  <path d="M3 28c2 1 4 1.5 6 1.5s4-.5 6-1.5c2 1 4 1.5 6 1.5s4-.5 6-1.5c2 1 4 1.5 6 1.5s4-.5 6-1.5" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
</svg>`)
}

/** Bus silhouette with NJT branding */
function busIcon(color: string): string {
  const c = enc(color)
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 32" fill="${c}">
  <path d="M8 24c0 1 .4 1.9 1.1 2.5V28.5c0 .6.4 1 1 1h1.4c.6 0 1-.4 1-1V27h14v1.5c0 .6.4 1 1 1h1.4c.6 0 1-.4 1-1v-2c.7-.6 1.1-1.5 1.1-2.5V8c0-4-4-5-11-5S8 4 8 8v16zm4 1.5c-1 0-1.7-.7-1.7-1.7s.7-1.7 1.7-1.7 1.7.7 1.7 1.7-.7 1.7-1.7 1.7zm16 0c-1 0-1.7-.7-1.7-1.7s.7-1.7 1.7-1.7 1.7.7 1.7 1.7-.7 1.7-1.7 1.7zM9 14V8h22v6H9z"/>
</svg>`)
}

// --- Crossing → icon (color-parameterized) ---

type IconFn = (color: string) => string

export const CROSSING_ICON_FNS: Record<string, IconFn> = {
  'Lincoln (Bus)': njtLogo,
  'Lincoln (Autos)': carIcon,
  'Holland (Bus)': njtLogo,
  'Holland (Autos)': carIcon,
  'PATH (Downtown)': pathLogo,
  'PATH (Uptown)': pathLogo,
  'Amtrak / NJ Transit': amtrakLogo,
  'Ferries': ferryIcon,
}

export const MODE_ICON_FNS: Record<string, IconFn> = {
  Bus: busIcon,
  Autos: paLogo,
  PATH: pathLogo,
  Rail: amtrakLogo,
  Ferries: ferryIcon,
}
