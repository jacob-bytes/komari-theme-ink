<script setup lang="ts">
import type { BlueprintData } from './types'
import { computed } from 'vue'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { ALERT, esc, FAINT, fitText, GHOST, INK, seg, txt, WARN } from './svg'

const props = defineProps<{ data: BlueprintData }>()
const emit = defineEmits<{ (e: 'drill', zone: string): void }>()

/* 紧凑分区符号布局：190×64，每行 4 个，跳线先画后用纸色矩形遮蔽（stubs-first） */
const ZW = 190
const ZH = 64
const GX = 14
const GY = 38
const PER_ROW = 4
const TOP = 96
const LEFT = 72

const viewH = computed(() => 96 + Math.ceil(props.data.zones.length / PER_ROW) * (ZH + GY) + 30)
const RE_ISO_CODE = /^[A-Z]{2}$/

const svg = computed(() => {
  const { zones, totals } = props.data
  const s: string[] = []
  const rows = Math.ceil(zones.length / PER_ROW)
  s.push(`<g class="bp-draw" style="--len:2000">`)
  s.push(`<rect x="60" y="46" width="920" height="22" fill="none" stroke="${INK}" stroke-width="2"/>`)
  s.push(`<rect x="66" y="52" width="908" height="10" fill="none" stroke="${GHOST}" stroke-width="1"/>`)
  s.push(`</g>`)
  s.push(txt(70, 61, `总线 · komari-core · 轮询 5s · ${zones.length} 分区 · 正常 ${totals.online} · 告警 ${totals.warn} · 离线 ${totals.offline}`, 11, INK, 'start', 700, 2))
  /* 竖向干线 + 每台水平跳线（先画，随后纸色分区符号遮蔽穿行部分） */
  const spineBottom = TOP + (rows - 1) * (ZH + GY) + ZH / 2
  s.push(seg(50, 68, 50, spineBottom))
  zones.forEach((z, i) => {
    const x = LEFT + (i % PER_ROW) * (ZW + GX)
    const y = TOP + Math.floor(i / PER_ROW) * (ZH + GY)
    s.push(seg(50, y + ZH / 2, x, y + ZH / 2))
  })
  /* 分区符号 */
  zones.forEach((z, i) => {
    const x = LEFT + (i % PER_ROW) * (ZW + GX)
    const y = TOP + Math.floor(i / PER_ROW) * (ZH + GY)
    const warn = z.warn > 0
    const off = z.offline > 0
    s.push(`<g class="bp-zsym" data-zone="${esc(z.name)}" tabindex="0" role="button" aria-label="打开分区 ${esc(z.name)}">`)
    s.push(`<rect class="bp-zb" x="${x}" y="${y}" width="${ZW}" height="${ZH}" fill="var(--bp-paper)" stroke="${warn ? WARN : INK}" stroke-width="${warn ? 2 : 1.5}"${off ? ' stroke-dasharray="8 4"' : ''}/>`)
    /* 国旗固定 26×18 区域，右侧显示地域名（超长截断）；无旗标时名字占满 */
    const flagUrl = regionFlagUrl(z.name)
    let tx = x + 12
    if (flagUrl) {
      s.push(`<image href="${flagUrl}" x="${tx}" y="${y + 9}" width="26" height="18" preserveAspectRatio="xMidYMid meet"/>`)
      tx += 32
    }
    /* 13.5px 文字基线 y+23：视觉中心约 y+18，与国旗(26×18, y+9)中心 y+18 对齐 */
    s.push(txt(tx, y + 23, fitText(regionName(z.name), flagUrl ? 15 : 20), 13.5, INK, 'start', 700, 1.5))
    /* 台数只显示一次；告警/离线数量按需追加，不重复显示在线数与台数 */
    s.push(txt(x + 12, y + 48, `${z.nodes.length} 台`, 10, FAINT, 'start', 400, 0.5))
    let sx = x + 60
    if (z.warn)
      s.push(txt(sx, y + 48, `▲ ${z.warn}`, 10, WARN, 'start', 700, 0.5))
    if (z.offline) {
      sx = z.warn ? sx + 44 : sx
      s.push(txt(sx, y + 48, `✕ ${z.offline}`, 10, ALERT, 'start', 700, 0.5))
    }
    s.push(`</g>`)
    /* 详图索引气泡 */
    s.push(`<g class="bp-bubble" data-zone="${esc(z.name)}" tabindex="0" role="button" aria-label="打开分区 ${esc(z.name)}">`)
    s.push(`<circle cx="${x + ZW}" cy="${y + ZH}" r="9" stroke="${INK}" stroke-width="1.5" fill="var(--bp-paper)"/>`)
    s.push(txt(x + ZW, y + ZH + 3.5, String(i + 1), 10, INK, 'middle', 700))
    s.push(`</g>`)
  })
  s.push(txt(1020, viewH.value - 8, 'KOM-26-001 · 总图', 9, FAINT, 'end', 400, 0.5))
  return s.join('')
})

/** 地域 → 旗标静态路径（仅解析出合法 ISO 代码时返回，避免自定义地域 404） */
function regionFlagUrl(region: string): string {
  const code = getRegionCode(region)
  return RE_ISO_CODE.test(code) ? `/images/flags/${code.trim()}.svg` : ''
}

/** 地域 → 显示名（regionHelper 中文名；未命中时回退原始值） */
function regionName(region: string): string {
  return getRegionDisplayName(region) || region
}

function onClick(e: Event) {
  const t = (e.target as Element).closest('[data-zone]')
  if (t)
    emit('drill', (t as HTMLElement).dataset.zone!)
}
</script>

<template>
  <div class="bp-ga-wrap">
    <svg :viewBox="`0 0 1040 ${viewH}`" role="img" aria-label="节点拓扑总图" @click="onClick" @keydown.enter="onClick" v-html="svg" />
  </div>
</template>
