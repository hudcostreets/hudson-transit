/** Shape of `og-data.json` (written by `scripts/og-data.ts`). */
export interface OgSeries {
  label: string
  color: string
  /** Passengers per year, aligned with `OgData.years`. */
  values: number[]
}

/** Keyed by `${direction}|${timePeriod}`, then granularity. */
export interface OgData {
  years: number[]
  index: Record<string, { crossing: OgSeries[]; mode: OgSeries[] }>
  nyc: Record<string, { mode: OgSeries[]; sector: OgSeries[] }>
}
