<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import type { GlobePoint } from '@/utils/lineGlobe'
import { useDocumentVisibility, useElementVisibility, useRafFn } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { esc } from '@/components/blueprint/svg'
import { useNodeGeoClusters } from '@/composables/useNodeGeoClusters'
import { WORLD_OUTLINES } from '@/data/world-outlines'
import { useAppStore } from '@/stores/app'
import { coastPath, formatViewportStatus, layoutLabels, meridianPaths, parallelPaths, projectNode, scanArcPoints } from '@/utils/lineGlobe'

const props = defineProps<{ nodes?: NodeData[] }>()
const appStore = useAppStore()

const containerRef = ref<HTMLDivElement>()
const documentVisibility = useDocumentVisibility()
const elementVisible = useElementVisibility(containerRef)
const shouldRender = computed(() => documentVisibility.value === 'visible' && elementVisible.value)
const shouldAutoRotate = computed(() => !appStore.stopEarth)

const VIEW_W = 500
const VIEW_H = 272
const CX = 250
const CY = 130
const R = 130

/** 初始视角：面向亚洲（东经 100，北纬 20） */
const INITIAL_LON = 100
const INITIAL_LAT = 18
const globeLon = ref(INITIAL_LON)
const globeLat = ref(INITIAL_LAT)
const isDragging = ref(false)
let lastPointerX = 0
let lastPointerY = 0

const clampLat = (v: number) => Math.min(65, Math.max(-65, v))
const wrapLon = (v: number) => ((v + 540) % 360) - 180

/** 视场状态栏（拖拽实时刷新） */
const viewportStatus = computed(() => formatViewportStatus(globeLon.value, globeLat.value))

const { regionClusters } = useNodeGeoClusters({ nodes: () => props.nodes })

interface LabelItem {
  name: string
  coord: [number, number]
}

const labelItems = computed<LabelItem[]>(() => regionClusters.value.map(cluster => ({
  name: cluster.label,
  coord: cluster.coord,
})))

const svg = computed(() => {
  const color = appStore.isDark
    ? { coast: 'var(--globe-coast)', grid: 'var(--globe-grid)', rim: 'var(--globe-rim)', point: 'var(--globe-point)', text: 'var(--globe-text)' }
    : { coast: 'var(--globe-coast)', grid: 'var(--globe-grid)', rim: 'var(--globe-rim)', point: 'var(--globe-point)', text: 'var(--globe-text)' }
  const s: string[] = []

  // 球体轮廓（外圈）
  s.push(`<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${color.rim}" stroke-width="1.5"/>`)
  // 内部淡轮
  s.push(`<circle cx="${CX}" cy="${CY}" r="${R - 2}" fill="none" stroke="${color.grid}" stroke-width="0.75"/>`)

  // 经纬网格
  for (const d of meridianPaths(globeLon.value, globeLat.value, CX, CY, R, 30))
    s.push(`<path d="${d}" fill="none" stroke="${color.grid}" stroke-width="0.6"/>`)
  for (const d of parallelPaths(globeLon.value, globeLat.value, CX, CY, R, 30))
    s.push(`<path d="${d}" fill="none" stroke="${color.grid}" stroke-width="0.6"/>`)

  // 海岸线（面向大陆）
  for (const polygon of WORLD_OUTLINES)
    s.push(`<path d="${coastPath(polygon, globeLon.value, globeLat.value, CX, CY, R)}" fill="none" stroke="${color.coast}" stroke-width="1.1" stroke-linejoin="round" opacity="0.9"/>`)

  // 地区节点标记
  const pts: Array<{ name: string, coord: [number, number], point: GlobePoint }> = []
  for (const item of labelItems.value) {
    const p = projectNode(item.coord, globeLon.value, globeLat.value, CX, CY, R)
    if (p)
      pts.push({ name: item.name, coord: item.coord, point: p })
  }

  if (pts.length) {
    const rows = layoutLabels(pts.map(item => ({
      name: item.name,
      point: item.point,
      side: item.point.x < CX ? 'left' : 'right',
    })), CX, CY, R)

    for (const row of rows) {
      const fade = Math.min(1, Math.max(0, (row.z - 0.02) * 3.5)).toFixed(2)
      const anchor = row.side === 'left' ? 'end' : 'start'
      // 每行一个 callout 分组：节点点 + 折线引线 + 标签文本（hover 联动高亮）
      s.push(`<g class="globe-callout">`)
      s.push(`<circle cx="${row.dotX.toFixed(1)}" cy="${row.dotY.toFixed(1)}" r="3" fill="${color.point}" stroke="${color.rim}" stroke-width="0.8" opacity="${fade}"/>`)
      s.push(`<polyline points="${row.dotX.toFixed(1)},${row.dotY.toFixed(1)} ${row.bendX},${row.dotY.toFixed(1)} ${row.anchorX},${row.textY}" fill="none" stroke="${color.coast}" stroke-width="1.3" stroke-dasharray="4 3" opacity="${(Number(fade) * 0.8).toFixed(2)}"/>`)
      s.push(`<text x="${row.anchorX}" y="${row.textY + 4}" font-size="11" fill="${color.text}" text-anchor="${anchor}" font-weight="600" opacity="${fade}">${esc(row.name)}</text>`)
      s.push(`</g>`)
    }
  }

  // 状态栏（组件内底部居中 + 基线分割线）
  s.push(`<line x1="${CX - 95}" y1="${VIEW_H - 14}" x2="${CX + 95}" y2="${VIEW_H - 14}" stroke="${color.grid}" stroke-width="0.8"/>`)
  s.push(`<text x="${CX}" y="${VIEW_H - 3}" font-size="9" fill="${color.text}" text-anchor="middle" letter-spacing="2">${esc(viewportStatus.value)}</text>`)

  return s.join('')
})

function onPointerDown(e: PointerEvent) {
  isDragging.value = true
  lastPointerX = e.clientX
  lastPointerY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value)
    return
  const dx = e.clientX - lastPointerX
  const dy = e.clientY - lastPointerY
  lastPointerX = e.clientX
  lastPointerY = e.clientY
  globeLon.value = wrapLon(globeLon.value - dx * 0.36)
  globeLat.value = clampLat(globeLat.value + dy * 0.3)
}

function onPointerUp() {
  isDragging.value = false
}

const radarAngle = ref(0)
const radarCanvasRef = ref<HTMLCanvasElement>()
const radarRgb = computed(() => (appStore.isDark ? [0, 195, 255] : [41, 98, 255]))
const preferReducedMotion = ref(false)

function drawRadar() {
  const canvas = radarCanvasRef.value
  if (!canvas || !shouldRender.value || !appStore.globeRadarEnabled || preferReducedMotion.value)
    return
  const rect = canvas.getBoundingClientRect()
  if (rect.width < 4 || rect.height < 4)
    return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
  }
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, rect.width, rect.height)
  const scale = Math.min(rect.width / VIEW_W, rect.height / VIEW_H)
  const cx = (rect.width - VIEW_W * scale) / 2 + CX * scale
  const cy = (rect.height - VIEW_H * scale) / 2 + CY * scale
  const r = R * scale
  const [red, green, blue] = radarRgb.value
  const theta = radarAngle.value
  // 球面扫描弧族：经线弧经正交投影呈弯曲弧线（背面自动剔除）
  const arcs = scanArcPoints(globeLon.value, globeLat.value, cx, cy, r, theta)
  for (const arc of arcs) {
    ctx.beginPath()
    let pen = false
    for (const pt of arc.pts) {
      if (!pt) {
        pen = false
        continue
      }
      if (pen)
        ctx.lineTo(pt.x, pt.y)
      else ctx.moveTo(pt.x, pt.y)
      pen = true
    }
    ctx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${arc.alpha.toFixed(3)})`
    ctx.lineWidth = arc.width
    ctx.stroke()
  }
}

const { pause: pauseRadar, resume: resumeRadar } = useRafFn(() => {
  radarAngle.value = (radarAngle.value + 0.011) % (Math.PI * 2)
  drawRadar()
}, { immediate: false })

const { pause: pauseRaf, resume: resumeRaf } = useRafFn(() => {
  if (!shouldRender.value)
    return
  if (!isDragging.value && shouldAutoRotate.value)
    globeLon.value = wrapLon(globeLon.value + 0.06)
}, { immediate: false })

onMounted(() => {
  preferReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

watch(shouldRender, (visible) => {
  if (visible) {
    resumeRaf()
    resumeRadar()
  }
  else {
    pauseRaf()
    pauseRadar()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  pauseRaf()
  pauseRadar()
})
</script>

<template>
  <div ref="containerRef" class="line-globe-host relative h-full w-full min-h-54 select-none touch-none">
    <svg
      :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
      class="line-globe-svg absolute inset-0 h-full w-full"
      role="img"
      aria-label="线状图纸地球"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      v-html="svg"
    />
    <canvas
      ref="radarCanvasRef"
      class="radar-canvas pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.line-globe-svg {
  contain: layout paint;
  cursor: grab;
  transition: opacity 0.45s ease;
}
.line-globe-svg:active {
  cursor: grabbing;
}
</style>
