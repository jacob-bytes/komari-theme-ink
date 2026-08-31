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

// 与 globals.css 的 --primary: oklch(0.55 0.16 258) 同色相，
// 保证图表主色与按钮/焦点环等品牌色出自同一套色板，而非 Tailwind 默认蓝(#2563eb, 217°)。
const DEFAULT_LOAD_CHART_PALETTE: LoadChartPalette = {
  primary: '#2d6fcd',
  primaryAreaStrong: 'rgba(45, 111, 205, 0.12)',
  primaryAreaFaint: 'rgba(45, 111, 205, 0.04)',
  secondary: '#9cb9e5',
  tertiary: '#6d9adc',
  tertiaryAreaStrong: 'rgba(109, 154, 220, 0.1)',
  tertiaryAreaFaint: 'rgba(109, 154, 220, 0.03)',
  quaternary: '#6d9adc',
  quinary: '#9cb9e5',
  senary: '#3f6fb8',
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
  '#2d6fcd',
  '#6d9adc',
  '#9cb9e5',
  '#3f6fb8',
  '#bccfec',
  '#06489c',
  '#d2dff2',
  '#9cb9e5',
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
