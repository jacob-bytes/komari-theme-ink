<script setup lang="ts">
import type { Topology } from 'topojson-specification'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { geoGraticule10, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { useGlobeProjection } from '@/composables/useGlobeProjection'
import { useThemeVars } from '@/composables/useThemeVars'
import { REGION_COORDINATES } from '@/utils/regionCoordinates'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'

const props = defineProps<{
  nodes: NodeData[]
}>()

const emit = defineEmits<{
  click: [node: NodeData]
}>()

interface RegionGroup {
  code: string
  name: string
  lon: number
  lat: number
  nodes: NodeData[]
  onlineCount: number
}

interface MarkerPoint {
  code: string
  x: number
  y: number
  visible: boolean
  group: RegionGroup
}

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const size = ref({ width: 0, height: 0 })
const themeVars = useThemeVars()

const {
  mode,
  isDragging,
  toggleMode,
  bindDrag,
  buildProjection,
  isPointVisible,
} = useGlobeProjection()

const regionGroups = computed<RegionGroup[]>(() => {
  const map = new Map<string, RegionGroup>()
  for (const node of props.nodes) {
    const code = getRegionCode(node.region)
    const coord = REGION_COORDINATES[code]
    if (!coord)
      continue
    let group = map.get(code)
    if (!group) {
      group = { code, name: getRegionDisplayName(node.region, 'zh'), lon: coord[0], lat: coord[1], nodes: [], onlineCount: 0 }
      map.set(code, group)
    }
    group.nodes.push(node)
    if (node.online)
      group.onlineCount += 1
  }
  return [...map.values()].sort((a, b) => b.nodes.length - a.nodes.length)
})

const unmatchedCount = computed(() => props.nodes.filter(n => !REGION_COORDINATES[getRegionCode(n.region)]).length)
const totalOnline = computed(() => props.nodes.filter(n => n.online).length)

const selectedRegionCode = ref<string | null>(null)
const selectedRegion = computed(() => regionGroups.value.find(g => g.code === selectedRegionCode.value) ?? null)

function selectRegion(code: string): void {
  selectedRegionCode.value = selectedRegionCode.value === code ? null : code
}

function handleMarkerClick(group: RegionGroup): void {
  const onlyNode = group.nodes.length === 1 ? group.nodes[0] : null
  if (onlyNode) {
    emit('click', onlyNode)
    return
  }
  selectRegion(group.code)
}

function handleNodeRowClick(node: NodeData): void {
  emit('click', node)
}

// 世界陆地轮廓：只在首次挂载时按需异步加载，不阻塞首页首屏
const landFeatures = shallowRef<ReturnType<typeof feature> | null>(null)
async function loadLandFeatures(): Promise<void> {
  const mod = await import('world-atlas/countries-110m.json')
  const topology = (mod.default ?? mod) as unknown as Topology
  const countries = topology.objects.countries
  if (!countries)
    return
  landFeatures.value = feature(topology, countries)
}

const graticule = geoGraticule10()
const markers = shallowRef<MarkerPoint[]>([])

/** alpha 以百分比（0-100）表示，例如 6 表示 6% 不透明度 */
function withAlpha(color: string, alpha: number): string {
  return `color-mix(in oklab, ${color} ${Math.round(alpha)}%, transparent)`
}

let rafId = 0
function renderFrame(): void {
  const canvas = canvasRef.value
  const { width, height } = size.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx || width === 0 || height === 0) {
    rafId = requestAnimationFrame(renderFrame)
    return
  }

  const dpr = window.devicePixelRatio || 1
  const targetW = Math.round(width * dpr)
  const targetH = Math.round(height * dpr)
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW
    canvas.height = targetH
  }

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  const projection = buildProjection(width, height)
  const path = geoPath(projection, ctx)
  const vars = themeVars.value

  ctx.beginPath()
  path({ type: 'Sphere' })
  ctx.fillStyle = withAlpha(vars.primaryColor, 6)
  ctx.fill()

  ctx.beginPath()
  path(graticule)
  ctx.strokeStyle = withAlpha(vars.borderColor, 55)
  ctx.lineWidth = 0.5
  ctx.stroke()

  if (landFeatures.value) {
    ctx.beginPath()
    path(landFeatures.value)
    ctx.fillStyle = withAlpha(vars.primaryColor, 16)
    ctx.fill()
    ctx.strokeStyle = withAlpha(vars.primaryColor, 38)
    ctx.lineWidth = 0.6
    ctx.stroke()
  }

  ctx.beginPath()
  path({ type: 'Sphere' })
  ctx.strokeStyle = withAlpha(vars.borderColor, 80)
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.restore()

  const nextMarkers: MarkerPoint[] = []
  for (const group of regionGroups.value) {
    const projected = projection([group.lon, group.lat])
    if (!projected)
      continue
    nextMarkers.push({
      code: group.code,
      x: projected[0],
      y: projected[1],
      visible: isPointVisible(group.lon, group.lat),
      group,
    })
  }
  markers.value = nextMarkers

  rafId = requestAnimationFrame(renderFrame)
}

function markerRadius(count: number): number {
  return Math.min(15, 6 + Math.log2(count + 1) * 3.2)
}

let resizeObserver: ResizeObserver | null = null
let unbindDrag: (() => void) | null = null

onMounted(async () => {
  await loadLandFeatures()
  await nextTick()
  if (containerRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry)
        size.value = { width: entry.contentRect.width, height: entry.contentRect.height }
    })
    resizeObserver.observe(containerRef.value)
    size.value = { width: containerRef.value.clientWidth, height: containerRef.value.clientHeight }
  }
  if (canvasRef.value)
    unbindDrag = bindDrag(canvasRef.value)
  rafId = requestAnimationFrame(renderFrame)
})

onBeforeUnmount(() => {
  if (rafId)
    cancelAnimationFrame(rafId)
  resizeObserver?.disconnect()
  unbindDrag?.()
})

watch(() => props.nodes.map(n => n.uuid).join('|'), () => {
  if (selectedRegionCode.value && !regionGroups.value.some(g => g.code === selectedRegionCode.value))
    selectedRegionCode.value = null
})
</script>

<template>
  <div class="flex flex-col gap-3 lg:flex-row">
    <div
      ref="containerRef"
      class="group relative h-72 w-full shrink-0 overflow-hidden rounded-lg bg-muted/30 ring-1 ring-inset ring-border select-none lg:h-96 lg:w-[60%]"
    >
      <canvas
        ref="canvasRef"
        class="absolute inset-0 h-full w-full touch-none"
        :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
      />

      <!-- 节点标记覆盖层：与 canvas 共用同一个投影，每帧同步位置 -->
      <div class="pointer-events-none absolute inset-0">
        <button
          v-for="marker in markers"
          :key="marker.code"
          type="button"
          class="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background transition-[opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="[
            marker.group.onlineCount > 0 ? 'bg-primary' : 'bg-muted-foreground/60',
            selectedRegionCode === marker.code && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
          ]"
          :style="{
            left: `${marker.x}px`,
            top: `${marker.y}px`,
            width: `${markerRadius(marker.group.nodes.length) * 2}px`,
            height: `${markerRadius(marker.group.nodes.length) * 2}px`,
            opacity: marker.visible ? 1 : 0.15,
          }"
          :aria-label="`${marker.group.name}：${marker.group.nodes.length} 个节点`"
          :title="`${marker.group.name} · ${marker.group.nodes.length} 个节点`"
          @click.stop="handleMarkerClick(marker.group)"
        >
          <span class="text-[10px] font-bold leading-none text-primary-foreground tabular-nums">{{ marker.group.nodes.length }}</span>
        </button>
      </div>

      <!-- 地球/地图切换 -->
      <div class="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-background/80 p-1 shadow-sm ring-1 ring-inset ring-border backdrop-blur-sm">
        <Button
          variant="ghost" size="sm" class="h-7 px-2 text-xs"
          :class="mode === 'globe' && 'bg-background text-selection shadow-sm'"
          @click="mode !== 'globe' && toggleMode()"
        >
          <Icon icon="tabler:globe" width="14" height="14" />
          地球
        </Button>
        <Button
          variant="ghost" size="sm" class="h-7 px-2 text-xs"
          :class="mode === 'map' && 'bg-background text-selection shadow-sm'"
          @click="mode !== 'map' && toggleMode()"
        >
          <Icon icon="tabler:map-2" width="14" height="14" />
          地图
        </Button>
      </div>

      <!-- 汇总统计 -->
      <div class="absolute left-3 top-3 rounded-md bg-background/80 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm ring-1 ring-inset ring-border backdrop-blur-sm">
        <span class="font-bold text-foreground tabular-nums">{{ regionGroups.length }}</span> 个地区 ·
        <span class="font-bold text-primary tabular-nums">{{ totalOnline }}</span> / {{ props.nodes.length }} 在线
      </div>

      <p class="pointer-events-none absolute bottom-3 left-3 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        拖拽旋转 · 点击标记查看节点
      </p>
    </div>

    <!-- 侧边地区/节点列表 -->
    <div class="flex min-h-72 flex-1 flex-col overflow-hidden rounded-lg ring-1 ring-inset ring-border lg:h-96">
      <div class="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span class="text-xs font-medium text-muted-foreground">按地区分布</span>
        <button
          v-if="selectedRegion"
          type="button"
          class="text-xs text-primary hover:underline"
          @click="selectedRegionCode = null"
        >
          查看全部
        </button>
      </div>
      <div class="flex-1 space-y-1 overflow-y-auto p-2">
        <template v-if="selectedRegion">
          <button
            v-for="node in selectedRegion.nodes" :key="node.uuid"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-background/70"
            @click="handleNodeRowClick(node)"
          >
            <span class="size-1.5 shrink-0 rounded-full" :class="node.online ? 'bg-success' : 'bg-destructive'" />
            <span class="min-w-0 flex-1 truncate text-foreground">{{ node.name }}</span>
          </button>
        </template>
        <template v-else>
          <button
            v-for="group in regionGroups" :key="group.code"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-background/70"
            @click="selectRegion(group.code)"
          >
            <span class="size-1.5 shrink-0 rounded-full" :class="group.onlineCount > 0 ? 'bg-primary' : 'bg-muted-foreground/60'" />
            <span class="min-w-0 flex-1 truncate text-foreground">{{ group.name }}</span>
            <span class="shrink-0 rounded-full bg-primary/8 px-1.5 py-0.5 font-mono text-[11px] text-primary ring-1 ring-inset ring-primary/20 tabular-nums">{{ group.nodes.length }}</span>
          </button>
          <p v-if="unmatchedCount > 0" class="px-2 py-1.5 text-[11px] text-muted-foreground">
            另有 {{ unmatchedCount }} 个节点地区信息未知，不显示在地球上
          </p>
          <p v-if="regionGroups.length === 0" class="px-2 py-6 text-center text-xs text-muted-foreground">
            暂无可定位的节点
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
