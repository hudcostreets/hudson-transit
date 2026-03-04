import { createContext, useContext } from 'react'
import type { ColorScheme } from './colors'
import { DEFAULT_SCHEME } from './colors'

export const ColorContext = createContext<ColorScheme>(DEFAULT_SCHEME)

export function useColors(): ColorScheme {
  return useContext(ColorContext)
}
