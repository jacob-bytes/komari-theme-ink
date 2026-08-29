<script setup lang="ts">
import type { BlueprintData, BlueprintNode } from './types'
import { computed, ref, watch } from 'vue'
import { getRegionDisplayName } from '@/utils/regionHelper'
import { ALERT, esc, FAINT, fitText, INK, seg, txt, WARN } from './svg'

const props = defineProps<{ data: BlueprintData, drilledZone?: string | null }>()
const emit = defineEmits<{ (e: 'open', uuid: string): void }>()

const openZones = ref<Set<string>>(new Set())

// 默认展开第一个含告警/离线的分区
watch(
  () => props.data.zones,
  (zones) => {
    if (openZones.value.size === 0) {
      const az = zones.find(z => z.warn > 0 || z.offline > 0)
      if (az)
        openZones.value = new Set([az.name])
    }
  },
  { immediate: true },
)

watch(
  () => props.drilledZone,
  (z) => {
    if (z) {
      openZones.value.add(z)
      const el = document.getElementById(`bp-zone-${z}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  },
)

const boxW = 396
const nodeW = 172
const nodeH = 34
const gap = 10
const boxGap = 16
const rowGap = 30
const top = 44
const RE_RELAY = /中转|relay/i

interface GroupBox { label: string, relay: boolean, items: BlueprintNode[], h: number }

function zoneSvg(zName: string): string {
  const items = props.data.flat.filter(n => n.region === zName)
  const groups = buildGroups(items)
  const boxes: GroupBox[] = groups.map(g => ({
    ...g,
    h: 34 + Math.ceil(g.items.length / 2) * (nodeH + gap) + 4,
  }))
  const layout: { b: GroupBox, x: number, y: number }[] = []
  let ly = top
  let rowMax = 0
  boxes.forEach((b, i) => {
    if (i > 0 && i % 2 === 0) {
      ly += rowMax + rowGap
      rowMax = 0
    }
    layout.push({ b, x: 44 + (i % 2) * (boxW + boxGap), y: ly })
    rowMax = Math.max(rowMax, b.h)
  })
  const H = ly + rowMax + 10
  const s: string[] = []
  const zone = props.data.zones.find(z => z.name === zName)
  s.push(txt(8, 22, `${zName} · ${items.length} 台 · 图 DWG-01-0${props.data.zones.indexOf(zone!) + 1}`, 11, FAINT, 'start', 700, 2))
  const stubYs = layout.map(L => L.y + L.b.h / 2)
  s.push(seg(24, 28, 24, Math.max(...stubYs)))
  layout.forEach(L => s.push(seg(24, L.y + L.b.h / 2, L.x, L.y + L.b.h / 2, INK, L.b.relay ? 2.5 : 1.2)))
  layout.forEach((L) => {
    const { x, y, b } = L
    s.push(`<rect x="${x}" y="${y}" width="${boxW}" height="${b.h}" fill="var(--bp-paper)" stroke="${b.relay ? WARN : FAINT}" stroke-width="${b.relay ? 1.8 : 1.2}"${b.relay ? '' : ' stroke-dasharray="6 4"'}/>`)
    s.push(seg(x, y + b.h / 2, x + 8, y + b.h / 2, INK, b.relay ? 2.5 : 1.2))
    s.push(txt(x + 10, y + 17, `${b.label} · ${b.items.length} 台`, 10.5, b.relay ? WARN : FAINT, 'start', 700, 1.5))
    if (b.relay)
      s.push(txt(x + boxW - 10, y + 17, '干线 → 落地', 9, FAINT, 'end', 400, 1))
    b.items.forEach((n, j) => {
      const nx = x + 12 + (j % 2) * (nodeW + gap)
      const ny = y + 26 + Math.floor(j / 2) * (nodeH + gap)
      s.push(nodeSymbol(n, nx, ny))
    })
  })
  return `<svg viewBox="0 0 1000 ${H}" role="img" aria-label="分区 ${zName}">${s.join('')}</svg>`
}

function nodeSymbol(n: BlueprintNode, x: number, y: number): string {
  const off = n.status === 'offline'
  const warn = n.status === 'warn'
  // 只显示主机名 + 状态标记（不携带 CPU/备注）；超长用 fitText 截断(…)
  let m = `<g class="bp-sym${off ? ' bp-off' : ''}" data-host="${esc(n.uuid)}" tabindex="0" role="button" aria-label="明细 ${esc(n.tag)}">`
  m += `<rect class="bp-nb" x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" fill="var(--bp-paper)" stroke="${warn ? WARN : INK}" stroke-width="${warn ? 1.8 : 1.5}"${off ? ' stroke-dasharray="5 4"' : ''}/>`
  m += txt(x + 8, y + 23, fitText(n.tag, 16), 12.5, off ? FAINT : INK, 'start', 700, 1)
  if (off)
    m += txt(x + nodeW - 8, y + 23, '✕', 11, ALERT, 'end', 700)
  else if (warn)
    m += txt(x + nodeW - 8, y + 23, '▲', 11, WARN, 'end', 700)
  else
    m += `<circle cx="${x + nodeW - 12}" cy="${y + 17}" r="3.5" fill="none" stroke="${INK}" stroke-width="1.2"/>`
  return `${m}</g>`
}

function buildGroups(items: BlueprintNode[]): { label: string, relay: boolean, items: BlueprintNode[] }[] {
  const grouped = new Map<string, BlueprintNode[]>()
  const ungrouped: BlueprintNode[] = []
  for (const n of items) {
    if (n.group) {
      const g = grouped.get(n.group) ?? []
      g.push(n)
      grouped.set(n.group, g)
    }
    else {
      ungrouped.push(n)
    }
  }
  const out = Array.from(grouped.entries(), ([label, ns]) => ({
    label,
    relay: RE_RELAY.test(label),
    items: ns,
  }))
  if (ungrouped.length)
    out.push({ label: '未分组', relay: false, items: ungrouped })
  return out
}

/** 分区（地区 emoji/代码）→ 中文名（未命中回退原值） */
function regionTitle(region: string): string {
  return getRegionDisplayName(region) || region
}

function stamp(zName: string): { text: string, cls: string } | null {
  const z = props.data.zones.find(x => x.name === zName)
  if (z?.warn)
    return { text: '有告警', cls: '' }
  if (z?.offline)
    return { text: '部分离线', cls: '' }
  return null
}

function toggle(name: string) {
  const next = new Set(openZones.value)
  if (next.has(name))
    next.delete(name)
  else
    next.add(name)
  openZones.value = next
}

function onClick(e: Event) {
  const t = (e.target as Element).closest('[data-host]')
  if (t)
    emit('open', (t as HTMLElement).dataset.host!)
}

const orderedZones = computed(() => props.data.zones)

function zoneIndex(zName: string): number {
  return props.data.zones.findIndex(x => x.name === zName)
}
</script>

<template>
  <div>
    <div
      v-for="z in orderedZones"
      :id="`bp-zone-${z.name}`"
      :key="z.name"
      class="bp-detail"
      :class="{ 'bp-open': openZones.has(z.name) }"
    >
      <div class="bp-dhead" tabindex="0" role="button" :aria-expanded="openZones.has(z.name) ? 'true' : 'false'" @click="toggle(z.name)" @keydown.enter="toggle(z.name)">
        <span class="bp-bub">{{ zoneIndex(z.name) + 1 }}</span>
        <h2>{{ regionTitle(z.name) }}</h2>
        <span class="bp-meta">{{ z.nodes.length }} 台 · 正常 {{ z.online }} · 告警 {{ z.warn }} · 离线 {{ z.offline }} · 图 DWG-01-0{{ zoneIndex(z.name) + 1 }}</span>
        <span v-if="stamp(z.name)" class="bp-stamp" :class="stamp(z.name)!.cls">{{ stamp(z.name)!.text }}</span>
        <span class="bp-tw">+</span>
      </div>
      <div class="bp-dbody">
        <div class="bp-ga-wrap" @click="onClick" @keydown.enter="onClick" v-html="zoneSvg(z.name)" />
      </div>
    </div>
  </div>
</template>
