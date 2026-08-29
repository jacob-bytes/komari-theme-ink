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
  primary: '#0ea5e9',
  primaryAreaStrong: 'rgba(14, 165, 233, 0.08)',
  primaryAreaFaint: 'rgba14, 165, 233, 0.02)',
  secondary: '#64748b',
  tertiary: '#10b981',
  tertiaryAreaStrong: 'rgba(16, 185, 129, 0.08)',
  tertiaryAreaFaint: 'rgba(16, 185, 129, 0.02)',
  quaternary: '#6366f1',
  quinary: '#10b981',
  senary: '#8b5cf6',
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
  '#0ea5e9',
  '#64748b',
  '#10b981',
  '#6366f1',
  '#f59e0b',
  '#06b6d4',
  '#8b5cf6',
  '#f43f5e',
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
