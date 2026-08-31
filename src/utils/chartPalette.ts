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
  primary: '#2563eb',
  primaryAreaStrong: 'rgba(37, 99, 235, 0.12)',
  primaryAreaFaint: 'rgba(37, 99, 235, 0.04)',
  secondary: '#93c5fd',
  tertiary: '#60a5fa',
  tertiaryAreaStrong: 'rgba(96, 165, 250, 0.1)',
  tertiaryAreaFaint: 'rgba(96, 165, 250, 0.03)',
  quaternary: '#60a5fa',
  quinary: '#93c5fd',
  senary: '#3b82f6',
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
  '#2563eb',
  '#60a5fa',
  '#93c5fd',
  '#3b82f6',
  '#7dd3fc',
  '#1d4ed8',
  '#bfdbfe',
  '#93c5fd',
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
