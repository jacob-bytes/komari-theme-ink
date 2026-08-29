export interface LoadChartPalette {
  primary: string
  primaryAreaStrong: string
  primaryAreaFaint: string
  secondary: string
  tertiary: string
  tertiaryAreaStrong: string
  tertiaryAreaFaint: string
  quaternary: string
  quinary: string
  senary: string
}

const DEFAULT_LOAD_CHART_PALETTE: LoadChartPalette = {
  primary: '#18181b',
  primaryAreaStrong: 'rgba(24, 24, 27, 0.12)',
  primaryAreaFaint: 'rgba(24, 24, 27, 0.03)',
  secondary: '#52525b',
  tertiary: '#71717a',
  tertiaryAreaStrong: 'rgba(113, 113, 122, 0.12)',
  tertiaryAreaFaint: 'rgba(113, 113, 122, 0.03)',
  quaternary: '#a1a1aa',
  quinary: '#3f3f46',
  senary: '#d4d4d8',
}

const ACCESSIBLE_LOAD_CHART_PALETTE: LoadChartPalette = {
  primary: '#D55E00',
  primaryAreaStrong: 'rgba(213, 94, 0, 0.25)',
  primaryAreaFaint: 'rgba(213, 94, 0, 0.02)',
  secondary: '#E69F00',
  tertiary: '#009E73',
  tertiaryAreaStrong: 'rgba(0, 158, 115, 0.25)',
  tertiaryAreaFaint: 'rgba(0, 158, 115, 0.02)',
  quaternary: '#CC79A7',
  quinary: '#0072B2',
  senary: '#56B4E9',
}

const DEFAULT_SERIES_PALETTE = [
  '#18181b',
  '#52525b',
  '#71717a',
  '#a1a1aa',
  '#3f3f46',
  '#d4d4d8',
  '#27272a',
  '#e4e4e7',
]

const ACCESSIBLE_SERIES_PALETTE = [
  '#0072B2',
  '#E69F00',
  '#009E73',
  '#CC79A7',
  '#D55E00',
  '#56B4E9',
  '#F0C94A',
  '#6B7280',
]

export const ACCESSIBLE_LINE_TYPES = ['solid', 'dashed', 'dotted'] as const

export function getLoadChartPalette(accessible: boolean): LoadChartPalette {
  return accessible ? ACCESSIBLE_LOAD_CHART_PALETTE : DEFAULT_LOAD_CHART_PALETTE
}

export function getChartSeriesPalette(accessible: boolean): string[] {
  return [...(accessible ? ACCESSIBLE_SERIES_PALETTE : DEFAULT_SERIES_PALETTE)]
}
