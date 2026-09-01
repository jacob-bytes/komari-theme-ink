<script setup lang="ts">
import type { Topology } from 'topojson-specification'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { geoGraticule, geoInterpolate, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { useGlobeProjection } from '@/composables/useGlobeProjection'
import { GLOBE_THEME } from '@/constants/globeTheme'
import { REGION_COORDINATES } from '@/utils/regionCoordinates'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'

const props = withDefaults(defineProps<{
  nodes: NodeData[]
  reduceMotion?: boolean
}>(), {
  reduceMotion: false,
})

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
  /** 0~1：背面/边缘的可见度系数，用于替代过去只有 1/0.15 两档的硬切换 */
  opacity: number
  group: RegionGroup
}

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const size = ref({ width: 0, height: 0 })
// 飞线默认关闭：没有真实节点间链路数据，枢纽放射式连线只是装饰性效果，交给用户按需开启
const flylinesEnabled = ref(false)
const canToggleFlylines = computed(() => !props.reduceMotion)

const {
  mode,
  transitionProgress,
  rotation,
  isDragging,
  toggleMode,
  bindDrag,
  buildProjection,
  isPointVisible,
  focusOn,
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
  const nextCode = selectedRegionCode.value === code ? null : code
  selectedRegionCode.value = nextCode
  // 仅球面模式下旋转聚焦：地图模式是等距矩形投影，旋转会让整张地图错位，体验反而更差，
  // 地图模式下点击列表只做高亮/筛选即可
  if (nextCode && mode.value === 'globe') {
    const group = regionGroups.value.find(g => g.code === nextCode)
    if (group)
      focusOn(group.lon, group.lat)
  }
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

// 网格步长放宽到 20°（默认 10°），线条数量减半，配合下方径向渐变淡出，
// 缓解"经纬线密不透风、看起来像钢丝球"的问题
const graticule = geoGraticule().step([20, 20])()
const markers = shallowRef<MarkerPoint[]>([])

// 扫描线当前经度（度），不需要响应式：只在动画循环内部读写，不驱动任何模板渲染
let scanLambda = 0
/** 扫描线每帧推进的经度（度），决定扫描一圈的速度 */
const SCAN_SPEED_DEG = 0.35

/** 构造一条贯穿南北极的经线弧，作为持续扫描的视觉元素 */
function buildScanMeridian(lambda: number): { type: 'LineString', coordinates: [number, number][] } {
  const coordinates: [number, number][] = []
  for (let lat = -90; lat <= 90; lat += 2)
    coordinates.push([lambda, lat])
  return { type: 'LineString', coordinates }
}

// 飞线流动光点的全局进度（0~1 循环）与各条线的初始相位，只在动画循环内部读写
let flylineGlobalT = 0
const FLYLINE_SPEED = 0.006
const flylinePhaseByCode = new Map<string, number>()
function getFlylinePhase(code: string): number {
  let phase = flylinePhaseByCode.get(code)
  if (phase === undefined) {
    phase = Math.random()
    flylinePhaseByCode.set(code, phase)
  }
  return phase
}

/** 边缘可见度系数：正面中心=1，越靠近裁剪边缘越淡，完全背面进一步降到更低的固定值 */
function edgeOpacity(lon: number, lat: number): number {
  const t = transitionProgress.value
  if (t >= 0.999)
    return 1
  const clipDeg = 90 + t * 90
  const [rl, rp] = rotation.value
  const centerLon = -rl
  const centerLat = -rp
  const toRad = Math.PI / 180
  const phi1 = lat * toRad
  const phi2 = centerLat * toRad
  const dLambda = (lon - centerLon) * toRad
  const cosc = Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLambda)
  const distDeg = Math.acos(Math.max(-1, Math.min(1, cosc))) * (180 / Math.PI)
  if (distDeg > clipDeg)
    return 0.12
  const ratio = distDeg / clipDeg
  return 1 - ratio * 0.65
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
  // 球面半径与 buildProjection 内部的 scale() 保持同一计算方式，用于绘制大气层光晕
  const sphereRadius = Math.min(width, height) / 2.3
  const transitionT = transitionProgress.value
  const atmosphereOpacity = 1 - transitionT

  // 大气层发光：画在球体主体之前的最底层，仅球面态明显，过渡到平面地图态时线性淡出
  if (atmosphereOpacity > 0.02) {
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      sphereRadius,
      width / 2,
      height / 2,
      sphereRadius * 1.15,
    )
    gradient.addColorStop(0, `rgba(${GLOBE_THEME.atmosphereRGB}, ${0.28 * atmosphereOpacity})`)
    gradient.addColorStop(1, `rgba(${GLOBE_THEME.atmosphereRGB}, 0)`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }

  // 球体主体：从左上"受光角"到轮廓边缘做径向渐变，而不是一块死板的纯色圆，
  // 制造真实球体应有的明暗过渡，配合下方网格/陆地的中心-边缘渐变共同拉开空间深度
  const lightX = width / 2 - sphereRadius * 0.32
  const lightY = height / 2 - sphereRadius * 0.38
  const sphereGradient = ctx.createRadialGradient(lightX, lightY, sphereRadius * 0.08, width / 2, height / 2, sphereRadius * 1.08)
  sphereGradient.addColorStop(0, GLOBE_THEME.sphereFillLit)
  sphereGradient.addColorStop(1, GLOBE_THEME.sphereFill)
  ctx.beginPath()
  path({ type: 'Sphere' })
  ctx.fillStyle = sphereGradient
  ctx.fill()

  // 经纬网格线：径向渐变淡出——正面中心稍亮，越靠近轮廓边缘越淡（0.26 -> 0.03），
  // 替代过去整张网格线不分远近、密度均匀导致的"钢丝球"感
  const graticuleGradient = ctx.createRadialGradient(width / 2, height / 2, sphereRadius * 0.05, width / 2, height / 2, sphereRadius)
  graticuleGradient.addColorStop(0, `rgba(${GLOBE_THEME.graticuleRGB}, 0.26)`)
  graticuleGradient.addColorStop(0.6, `rgba(${GLOBE_THEME.graticuleRGB}, 0.16)`)
  graticuleGradient.addColorStop(1, `rgba(${GLOBE_THEME.graticuleRGB}, 0.03)`)
  ctx.beginPath()
  path(graticule)
  ctx.strokeStyle = graticuleGradient
  ctx.lineWidth = 0.5
  ctx.stroke()

  if (landFeatures.value) {
    // 陆地改为线框风格：去掉实色填充的单调感，只保留极低填充制造"面板玻璃"质感，
    // 主视觉是加粗描边 + 发光，在深色背景衬托下形成科技感发光线框世界地图。
    // 描边同样按径向渐变淡出：只有正面中心的大陆轮廓保持清晰发光，靠近球体边缘的
    // 大陆逐渐转暗，模拟"近大远小、越往边缘越虚"的空间纵深，而不是整颗球一样亮
    const landGradient = ctx.createRadialGradient(width / 2, height / 2, sphereRadius * 0.1, width / 2, height / 2, sphereRadius)
    landGradient.addColorStop(0, `rgba(${GLOBE_THEME.atmosphereRGB}, 0.95)`)
    landGradient.addColorStop(0.55, `rgba(${GLOBE_THEME.atmosphereRGB}, 0.7)`)
    landGradient.addColorStop(1, `rgba(${GLOBE_THEME.atmosphereRGB}, 0.16)`)
    ctx.beginPath()
    path(landFeatures.value)
    ctx.fillStyle = GLOBE_THEME.landFill
    ctx.fill()
    ctx.lineWidth = 0.8
    ctx.shadowColor = GLOBE_THEME.landGlow
    ctx.shadowBlur = 3
    ctx.strokeStyle = landGradient
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  // 枢纽放射式飞线：仅球面态、用户开启且非弱化动效时绘制，地图模式下大圆弧在等距矩形
  // 投影上会扭曲得很奇怪，直接跳过
  if (flylinesEnabled.value && !props.reduceMotion && transitionT < 0.999) {
    const hub = regionGroups.value[0]
    if (hub) {
      for (const group of regionGroups.value) {
        if (group.code === hub.code || group.onlineCount <= 0)
          continue
        const interpolate = geoInterpolate([hub.lon, hub.lat], [group.lon, group.lat])
        const steps = 40
        const coordinates: [number, number][] = []
        for (let i = 0; i <= steps; i++)
          coordinates.push(interpolate(i / steps))
        const line = { type: 'LineString' as const, coordinates }

        ctx.beginPath()
        path(line)
        ctx.lineWidth = 0.8
        ctx.strokeStyle = GLOBE_THEME.flylineColor
        ctx.stroke()

        const t = (getFlylinePhase(group.code) + flylineGlobalT) % 1
        const dotProjected = projection(interpolate(t))
        if (dotProjected) {
          ctx.beginPath()
          ctx.shadowColor = GLOBE_THEME.flylineGlow
          ctx.shadowBlur = 6
          ctx.fillStyle = GLOBE_THEME.flylineGlow
          ctx.arc(dotProjected[0], dotProjected[1], 1.6, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }
      flylineGlobalT = (flylineGlobalT + FLYLINE_SPEED) % 1
    }
  }

  ctx.beginPath()
  path({ type: 'Sphere' })
  ctx.strokeStyle = GLOBE_THEME.sphereRim
  ctx.lineWidth = 1
  ctx.stroke()

  // 持续扫描的经线弧：只在球面态有意义，随着过渡到平面地图态线性淡出，
  // 平面地图上不保留这条"环绕扫描"视觉，避免与地图内容混淆；弱化动效时不绘制
  const scanOpacity = props.reduceMotion ? 0 : atmosphereOpacity
  if (scanOpacity > 0.02) {
    ctx.beginPath()
    path(buildScanMeridian(scanLambda))
    ctx.lineWidth = 1.4
    ctx.shadowColor = `rgba(${GLOBE_THEME.scanRGB}, ${0.9 * scanOpacity})`
    ctx.shadowBlur = 8
    ctx.strokeStyle = `rgba(${GLOBE_THEME.scanRGB}, ${0.75 * scanOpacity})`
    ctx.stroke()
    ctx.shadowBlur = 0
  }
  if (!props.reduceMotion)
    scanLambda = (scanLambda + SCAN_SPEED_DEG) % 360

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
      opacity: isPointVisible(group.lon, group.lat) ? edgeOpacity(group.lon, group.lat) : 0.12,
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
    <!-- "设备屏幕"外壳：用跟随站点主题的 bg-card + ring-border 包一层实体边框（浅色站点下是
         普通白色卡片边框，深色站点下自动变成深色卡片边框），把深空科技面板当成"镶在浅色/深色
         卡片壳里的一块屏幕"，而不是直接把一块纯黑矩形凌空摆在页面留白上——
         同一层级的"按地区分布"面板也是用 ring-border 卡片语言，两者边框粗细/圆角保持一致，
         视觉上才会读作"一组卡片"而非"一个突兀的黑块 + 一个普通白卡片"。
         壳体内侧再叠一圈更深的内阴影，模拟屏幕嵌入边框缝隙的凹陷质感，让深浅两色之间
         有一层过渡阴影而非直接拼接。 -->
    <div class="relative shrink-0 rounded-lg bg-card p-2 shadow-sm ring-1 ring-inset ring-border lg:w-[60%]">
      <div
        ref="containerRef"
        class="group relative h-72 w-full overflow-hidden rounded-md select-none lg:h-96"
        :style="{
          background: `radial-gradient(circle at 50% 35%, ${GLOBE_THEME.spaceFrom} 0%, ${GLOBE_THEME.spaceTo} 70%)`,
          boxShadow: `inset 0 0 0 1px ${GLOBE_THEME.panelBorder}, inset 0 1px 10px 2px rgba(4, 10, 24, 0.45), 0 0 40px -8px rgba(${GLOBE_THEME.atmosphereRGB}, 0.35)`,
        }"
      >
        <canvas
          ref="canvasRef"
          class="absolute inset-0 h-full w-full touch-pan-y"
          :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
        />

        <!-- 节点标记覆盖层：与 canvas 共用同一个投影，每帧同步位置 -->
        <div class="pointer-events-none absolute inset-0">
          <button
            v-for="marker in markers"
            :key="marker.code"
            type="button"
            class="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-2"
            :class="[
              selectedRegionCode === marker.code && 'ring-2 ring-offset-2',
            ]"
            :style="{
              'left': `${marker.x}px`,
              'top': `${marker.y}px`,
              'width': `${markerRadius(marker.group.nodes.length) * 2}px`,
              'height': `${markerRadius(marker.group.nodes.length) * 2}px`,
              'opacity': marker.opacity,
              'backgroundColor': marker.group.onlineCount > 0 ? GLOBE_THEME.markerAccent : GLOBE_THEME.markerOffline,
              'borderColor': GLOBE_THEME.spaceTo,
              '--tw-ring-color': GLOBE_THEME.markerAccent,
              '--tw-ring-offset-color': GLOBE_THEME.spaceTo,
            }"
            :aria-label="`${marker.group.name}：${marker.group.nodes.length} 个节点`"
            :title="`${marker.group.name} · ${marker.group.nodes.length} 个节点`"
            @click.stop="handleMarkerClick(marker.group)"
          >
            <!-- 在线地区脉冲呼吸圈：仅在线态呼吸，呼应"实时在线"语义；弱化动效时不渲染 -->
            <span
              v-if="!props.reduceMotion && marker.group.onlineCount > 0"
              class="pointer-events-none absolute inset-0 rounded-full animate-ping"
              :style="{ backgroundColor: GLOBE_THEME.markerAccent, opacity: 0.45 }"
            />
            <span class="relative text-[10px] font-bold leading-none tabular-nums" :style="{ color: GLOBE_THEME.spaceTo }">{{ marker.group.nodes.length }}</span>
          </button>
        </div>

        <!-- 地球/地图切换 + 飞线开关：深色玻璃质感，与地球场景本身统一为固定深色科技面板，
           不再套用跟随站点主题的 bg-background 浅色浮层，避免"控件像贴上去的"割裂感 -->
        <div
          class="globe-chip absolute right-3 top-3 flex items-center gap-1 rounded-md p-1 backdrop-blur-md"
          :style="{ backgroundColor: GLOBE_THEME.panelGlassBg, boxShadow: `inset 0 0 0 1px ${GLOBE_THEME.panelBorder}`, color: GLOBE_THEME.panelTextMuted }"
        >
          <Button
            variant="ghost" size="sm" class="h-7 px-2 text-xs"
            data-globe-chip-btn="true"
            :data-active="mode === 'globe' ? 'true' : 'false'"
            :style="mode === 'globe' ? { backgroundColor: GLOBE_THEME.activeChipBg, color: GLOBE_THEME.panelTextActive, boxShadow: `inset 0 0 0 1px ${GLOBE_THEME.activeChipRing}` } : undefined"
            @click="mode !== 'globe' && toggleMode()"
          >
            <Icon icon="tabler:globe" width="14" height="14" />
            地球
          </Button>
          <Button
            variant="ghost" size="sm" class="h-7 px-2 text-xs"
            data-globe-chip-btn="true"
            :data-active="mode === 'map' ? 'true' : 'false'"
            :style="mode === 'map' ? { backgroundColor: GLOBE_THEME.activeChipBg, color: GLOBE_THEME.panelTextActive, boxShadow: `inset 0 0 0 1px ${GLOBE_THEME.activeChipRing}` } : undefined"
            @click="mode !== 'map' && toggleMode()"
          >
            <Icon icon="tabler:map-2" width="14" height="14" />
            地图
          </Button>
          <div class="mx-0.5 h-4 w-px" :style="{ backgroundColor: GLOBE_THEME.panelBorder }" />
          <Button
            variant="ghost" size="sm" class="h-7 px-2 text-xs disabled:opacity-40"
            data-globe-chip-btn="true"
            :data-active="flylinesEnabled ? 'true' : 'false'"
            :style="flylinesEnabled ? { backgroundColor: GLOBE_THEME.activeChipBg, color: GLOBE_THEME.panelTextActive, boxShadow: `inset 0 0 0 1px ${GLOBE_THEME.activeChipRing}` } : undefined"
            :disabled="!canToggleFlylines"
            :aria-pressed="flylinesEnabled"
            title="枢纽放射飞线（装饰效果，无真实链路数据）"
            @click="canToggleFlylines && (flylinesEnabled = !flylinesEnabled)"
          >
            <Icon icon="tabler:route-2" width="14" height="14" />
            飞线
          </Button>
        </div>

        <!-- 汇总统计 -->
        <div
          class="globe-chip absolute left-3 top-3 rounded-md px-2.5 py-1.5 text-xs backdrop-blur-md"
          :style="{ backgroundColor: GLOBE_THEME.panelGlassBg, boxShadow: `inset 0 0 0 1px ${GLOBE_THEME.panelBorder}`, color: GLOBE_THEME.panelTextMuted }"
        >
          <span class="font-bold tabular-nums" :style="{ color: GLOBE_THEME.panelTextActive }">{{ regionGroups.length }}</span> 个地区 ·
          <span class="font-bold tabular-nums" :style="{ color: GLOBE_THEME.markerAccent }">{{ totalOnline }}</span> / {{ props.nodes.length }} 在线
        </div>

        <p
          class="pointer-events-none absolute bottom-3 left-3 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
          :style="{ color: GLOBE_THEME.panelTextMuted }"
        >
          拖拽旋转 · 点击标记查看节点
        </p>
      </div>
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

<style scoped>
/*
 * 地球面板悬浮控件（模式切换/飞线开关/统计角标）固定使用深色玻璃质感，
 * 覆盖 shadcn Button ghost 变体默认跟随站点浅/深色主题的 hover 配色——
 * 否则鼠标悬停时会突然冒出站点主题的浅色高亮，与深空地球场景的沉浸感割裂。
 * 选中态的底色/文字色已经通过内联 style 直接设置（内联样式优先级天然高于类），
 * 这里只需要处理 :hover 这一无法用内联样式表达的伪类状态。
 */
.globe-chip :deep([data-globe-chip-btn='true']:hover:not([data-active='true'])) {
  background-color: rgba(148, 210, 255, 0.12) !important;
  color: #eafcff !important;
}
</style>
