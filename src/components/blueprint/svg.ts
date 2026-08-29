// 蓝图视图共享的 SVG 渲染辅助(与原型 blueprint.html 的 render 逻辑同构)
// CSS 变量名以 --bp-* 形式继承自 .bp-root 作用域。

const RE_AMP = /&/g
const RE_LT = /</g
const RE_GT = />/g

export function esc(s: string): string {
  return s.replace(RE_AMP, '&amp;').replace(RE_LT, '&lt;').replace(RE_GT, '&gt;')
}

export const INK = 'var(--bp-ink)'
export const FAINT = 'var(--bp-faint)'
export const GHOST = 'var(--bp-ghost)'
export const WARN = 'var(--bp-warn)'
export const ALERT = 'var(--bp-alert)'

export function lineLen(x1: number, y1: number, x2: number, y2: number): number {
  return Math.round(Math.hypot(x2 - x1, y2 - y1)) + 2
}

export function seg(x1: number, y1: number, x2: number, y2: number, stroke = INK, w = 1.5): string {
  return `<line class="bp-draw" style="--len:${lineLen(x1, y1, x2, y2)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"/>`
}

export function txt(
  x: number,
  y: number,
  s: string,
  size: number,
  fill = INK,
  anchor: 'start' | 'middle' | 'end' = 'start',
  weight = 400,
  ls = 1,
  textLength?: number,
): string {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}" letter-spacing="${ls}"${textLength ? ` textLength="${textLength}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(s)}</text>`
}

/**
 * 宽度感知截断（中文/全角=2 单位，其他=1 单位），超长加省略号。
 * 用于 SVG 文本：避免 textLength 强制拉伸短文字、也避免长文字溢出框。
 */
export function fitText(s: string, maxW: number): string {
  let w = 0
  let out = ''
  for (const ch of s) {
    const cw = ch.charCodeAt(0) > 255 ? 2 : 1
    if (w + cw > maxW) {
      out += '…'
      return out
    }
    out += ch
    w += cw
  }
  return out
}
