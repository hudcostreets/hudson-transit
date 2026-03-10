export interface HourlyRecord {
  year: number
  hour: number
  direction: string
  category: string  // 'mode' | 'sector' | 'total_persons' | 'transit_passengers' | 'motor_vehicles'
  key: string
  persons: number
}

export interface PeakRecord {
  year: number
  category: string  // 'total_persons' | 'transit_passengers' | 'motor_vehicles'
  peak_accumulation: number
  peak_hour?: number
}
