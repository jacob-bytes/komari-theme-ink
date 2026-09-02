<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, getStatus, getUptimeDays } from '@/utils/helper'
import { getDiskPercentage, getMemoryPercentage, getTrafficUsed, getTrafficUsedPercentage, hasTrafficLimit } from '@/utils/nodeMetricsHelper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode } from '@/utils/regionHelper'
import { formatCurrencyValue, formatPriceWithCycle, getDaysUntilExpired, getExpireStatus, getRemainingValue, isFreePrice, parseTags } from '@/utils/tagHelper'

const props = withDefaults(defineProps<{
  node: NodeData
  reduceMotion?: boolean
  pingEnabled?: boolean
}>(), {
  reduceMotion: false,
  pingEnabled: true,
})
const emit = defineEmits<{
  click: []
  pingClick: []
}>()
const appStore = useAppStore()
const isFavorite = computed(() => appStore.isFavoriteNode(props.node.uuid))

function toggleFavorite(): void {
  appStore.toggleFavoriteNode(props.node.uuid)
}

function handleKeyboardOpen(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  emit('click')
}

interface RemainingInfoTag {
  icon: string
  text?: string
  prefix?: string
  value?: string
  unit?: string
  className?: string
}

const NODE_METRIC_ICONS = {
  cpu: 'tabler:cpu',
  memory: 'icon-park-outline:memory',
  disk: 'tabler:server-2',
  traffic: 'tabler:arrows-transfer-up-down',
} as const

const isMiniNodeCard = computed(() => appStore.nodeCardSize === 'mini')
const nodeCardXSize = computed(() => appStore.nodeCardSize === 'large' ? 'large' : 'medium')
const nodeCardContentClass = computed(() => appStore.nodeCardSize === 'large' ? 'gap-4' : isMiniNodeCard.value ? 'gap-2' : 'gap-3')
const nodeCardContentPaddingClass = computed(() => isMiniNodeCard.value ? 'pb-2' : '')
const nodeCardMetricGridClass = 'grid-cols-3'
const nodeCardMetricBoxClass = computed(() => isMiniNodeCard.value
  ? 'px-1 py-1'
  : appStore.nodeCardSize === 'compact' ? 'px-1.5 py-1.5' : 'px-2 py-1.5')

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const offlineTime = computed(() => formatDateTime(props.node.time))

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => getMemoryPercentage(props.node))
const memStatus = computed(() => getStatus(memPercentage.value))
const swapTooltip = computed(() => {
  const used = formatBytes(Math.max(0, props.node.swap ?? 0))
  const total = Math.max(0, props.node.swap_total ?? 0)
  return total > 0 ? `Swap 已用 ${used} / 总计 ${formatBytes(total)}` : `Swap 已用 ${used}`
})
const diskPercentage = computed(() => getDiskPercentage(props.node))
const diskStatus = computed(() => getStatus(diskPercentage.value))

// 直接复用 useNodePingDisplay 已有的真实历史采样点阵（latencyRenderBars/lossRenderBars）：
// 每个色块对应一次真实 ping 采样，自带精确到秒的时间戳 + 数值 tooltip，5 档 signal 色阶
// 已经过深浅色/色觉友好适配。避免另起一套「客户端累积近似历史 + 4 档色相」的展示，
// 后者既没有真实时间戳，档位又粗，与列表视图（NodePingListCell）的展示语义不一致。
const {
  latencyDisplay,
  lossDisplay,
  latencyRenderBars,
  lossRenderBars,
  latencyPanelTooltip,
  lossPanelTooltip,
  taskLatencyItems,
  hasTaskLatencyItems,
} = useNodePingDisplay(() => props.node.uuid, { enabled: () => props.pingEnabled })

// 数值文字颜色与色块色阶保持同一套严重度阈值，仅在中高严重度提亮，常态仍为默认前景色
function latencyTextClass(text: string): string {
  const ms = Number.parseFloat(text)
  if (!Number.isFinite(ms))
    return 'text-foreground'
  if (ms > 200)
    return 'text-destructive'
  if (ms > 160)
    return 'text-warning'
  return 'text-foreground'
}
function lossTextClass(text: string): string {
  const pct = Number.parseFloat(text)
  if (!Number.isFinite(pct))
    return 'text-foreground'
  if (pct > 9)
    return 'text-destructive'
  if (pct > 6)
    return 'text-warning'
  return 'text-foreground'
}
const trafficUsedPercentage = computed(() => getTrafficUsedPercentage(props.node))
const trafficUsed = computed(() => getTrafficUsed(props.node))
const nodeMessage = computed(() => props.node.message?.trim() ?? '')
const nodeMessageTooltip = computed(() => {
  const message = nodeMessage.value
  if (!message)
    return ''
  const updatedAt = props.node.status_updated_at ? `\n更新时间：${formatDateTime(props.node.status_updated_at)}` : ''
  return `${message}${updatedAt}`
})

// 流量状态颜色
const trafficStatus = computed(() => {
  if (!hasTrafficLimit(props.node))
    return 'success'
  if (trafficUsedPercentage.value >= 95)
    return 'error'
  if (trafficUsedPercentage.value >= 80)
    return 'warning'
  if (trafficUsedPercentage.value >= 60)
    return 'info'
  return 'success'
})

const trafficPercentageClass = computed(() => {
  if (!hasTrafficLimit(props.node))
    return 'text-muted-foreground'
  if (trafficUsedPercentage.value >= 95)
    return 'text-destructive'
  if (trafficUsedPercentage.value >= 80)
    return 'text-warning'
  if (trafficUsedPercentage.value >= 60)
    return 'text-warning'
  return 'text-success'
})

// 是否显示金额：未登录且开启「未登录隐藏价格」时不显示价格 / 剩余价值，
// 但在线天数、剩余天数等非金额信息仍然展示
const showPrice = computed(() => appStore.privateFeaturesAllowed || !appStore.hidePriceWhenLoggedOut)

const uptimeDaysText = computed(() => {
  const days = getUptimeDays(props.node.uptime)
  return appStore.lang === 'zh-CN' ? `在线 ${days} 天` : `${days} days online`
})

const priceText = computed(() => {
  const node = props.node
  if (node.price === 0 || !showPrice.value)
    return ''
  return formatPriceWithCycle(node.price, node.billing_cycle, node.currency, appStore.lang)
})

// 第三列：剩余天数（始终） + 剩余价值（仅在允许显示金额时），带图标与相邻列对齐
const remainingInfoTags = computed<RemainingInfoTag[]>(() => {
  const node = props.node
  if (node.price === 0)
    return []
  const lang = appStore.lang
  const days = getDaysUntilExpired(node.expired_at)
  const status = getExpireStatus(node.expired_at)
  const items: RemainingInfoTag[] = []
  const expiryClass = status === 'expired' || status === 'critical'
    ? 'text-destructive'
    : status === 'warning' ? 'text-warning' : 'text-muted-foreground'

  if (status === 'unknown') {
    items.push({ icon: 'tabler:calendar-stats', text: '-', className: expiryClass })
  }
  else if (status === 'expired') {
    items.push({ icon: 'tabler:calendar-stats', text: lang === 'zh-CN' ? '已过期' : 'Expired', className: expiryClass })
  }
  else if (status === 'long_term') {
    items.push({ icon: 'tabler:calendar-stats', text: lang === 'zh-CN' ? '长期' : 'Long-term', className: expiryClass })
  }
  else if (lang === 'zh-CN') {
    items.push({ icon: 'tabler:calendar-stats', prefix: '剩余', value: String(days), unit: '天', className: expiryClass })
  }
  else {
    items.push({ icon: 'tabler:calendar-stats', prefix: 'left', value: String(days), unit: 'days', className: expiryClass })
  }

  if (showPrice.value) {
    const text = isFreePrice(node.price)
      ? lang === 'zh-CN' ? '无' : 'N/A'
      : formatCurrencyValue(getRemainingValue(node.price, node.billing_cycle, node.expired_at), node.currency)
    items.push({ icon: 'tabler:coins', text })
  }
  return items
})

const customTags = computed(() => parseTags(props.node.tags).flatMap(t => t.text.length ? t.text.split(' ').filter(Boolean) : [t.text]))

function hasRegion(region: string | null | undefined): boolean {
  return Boolean(region?.trim())
}
</script>

<template>
  <CardX
    hoverable
    :size="nodeCardXSize"
    :content-class="nodeCardContentPaddingClass"
    class="node-card w-full cursor-pointer border-none shadow-[0_0_0_3px] shadow-transparent transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-md hover:border-ring/40 rounded-lg"
    :class="[!props.node.online && '!shadow-destructive/30']"
    role="button"
    tabindex="0"
    :aria-label="`查看节点 ${props.node.name} 详情`"
    @click="emit('click')"
    @keydown="handleKeyboardOpen"
  >
    <!-- 头部：在线点 + 名称 -->
    <template #header>
      <div class="flex items-center gap-2 min-w-0">
        <div class="relative size-2.5 shrink-0">
          <span
            class="size-2.5 rounded-full block"
            :class="props.node.online ? 'bg-success' : 'bg-destructive'"
          />
          <!-- 呼吸动画仅用于离线告警：健康节点保持静态，避免网格中大量卡片同时闪烁的噪音感 -->
          <span
            v-if="!props.reduceMotion && !props.node.online"
            class="animate-ping absolute inset-0 rounded-full opacity-60 bg-destructive"
          />
        </div>
        <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" loading="lazy" class="size-3.5 rounded-sm opacity-80"><span class="text-sm font-bold flex-1 min-w-0 truncate">{{ props.node.name }}</span>
        <DataTooltip
          v-if="nodeMessage"
          :content="nodeMessageTooltip"
          placement="top"
          as="span"
          class="inline-flex shrink-0 text-[var(--status-warn)]"
          content-class="w-56 whitespace-pre-line leading-snug text-left"
        >
          <Icon icon="tabler:alert-triangle-filled" width="14" height="14" aria-label="节点消息" />
        </DataTooltip>
      </div>
    </template>

    <!-- 头部右侧：OS + 国旗 -->
    <template #header-extra>
      <div class="flex gap-1.5 items-center shrink-0">
        <button
          type="button"
          class="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-[var(--status-warn)]"
          :class="isFavorite && 'bg-[var(--status-warn)]/10 text-[var(--status-warn)]'"
          :aria-label="isFavorite ? `取消收藏 ${props.node.name}` : `收藏 ${props.node.name}`"
          :title="isFavorite ? '取消收藏' : '收藏节点'"
          @click.stop="toggleFavorite"
          @keydown.stop
        >
          <Icon :icon="isFavorite ? 'tabler:star-filled' : 'tabler:star'" width="14" height="14" />
        </button>
        <span
          v-if="hasRegion(props.node.region)"
          class="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
        >{{ getRegionCode(props.node.region) }}</span>
      </div>
    </template>

    <template #default>
      <div class="flex flex-col relative" :class="nodeCardContentClass">
        <!-- 在线天数固定展示，价格独立展示，避免不同主机卡片高度不一致 -->
        <div class="relative z-20 flex items-center gap-1.5 -mt-1 h-[19px] overflow-hidden">
          <span class="shrink-0 text-[11px] text-muted-foreground leading-tight">
            {{ uptimeDaysText }}
          </span>
          <span
            v-if="priceText"
            class="min-w-0 truncate text-[11px] text-muted-foreground leading-tight"
          >
            {{ priceText }}
          </span>
        </div>

        <!-- 四项进度条 -->
        <div v-if="isMiniNodeCard" class="grid grid-cols-[3fr_2fr] gap-x-4 gap-y-2">
          <div class="grid grid-cols-2 gap-x-3 gap-y-1">
            <div class="flex flex-col gap-1">
              <div class="flex justify-between text-xs">
                <span class="inline-flex items-center text-muted-foreground" role="img" title="CPU" aria-label="CPU">
                  <Icon :icon="NODE_METRIC_ICONS.cpu" data-node-metric-icon="cpu" width="12" height="12" aria-hidden="true" />
                </span>
                <span class="font-mono tabular-nums font-medium">{{ (props.node.cpu ?? 0).toFixed(1) }}%</span>
              </div>
              <ProgressThin :percentage="props.node.cpu ?? 0" :status="cpuStatus" :height="2" />
            </div>

            <div class="flex flex-col gap-1" :title="swapTooltip">
              <div class="flex justify-between text-xs">
                <span class="inline-flex items-center text-muted-foreground" role="img" title="内存" aria-label="内存">
                  <Icon :icon="NODE_METRIC_ICONS.memory" data-node-metric-icon="memory" width="12" height="12" aria-hidden="true" />
                </span>
                <span class="font-mono tabular-nums font-medium">{{ memPercentage.toFixed(1) }}%</span>
              </div>
              <ProgressThin :percentage="memPercentage" :status="memStatus" :height="2" />
            </div>

            <div class="col-span-2 text-[11px] text-muted-foreground truncate">
              {{ formatBytes(props.node.ram ?? 0) }} / {{ formatBytes(props.node.mem_total ?? 0) }}
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <div class="flex justify-between text-xs">
              <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                <Icon :icon="NODE_METRIC_ICONS.traffic" data-node-metric-icon="traffic" width="12" height="12" class="shrink-0 text-muted-foreground/70" aria-hidden="true" />
                <span class="truncate">流量</span>
              </span>
              <span class="font-mono tabular-nums font-medium" :class="trafficPercentageClass">
                {{ hasTrafficLimit(props.node) ? `${trafficUsedPercentage.toFixed(1)}%` : '∞' }}
              </span>
            </div>
            <ProgressThin :percentage="trafficUsedPercentage" :status="trafficStatus" :height="2" />
            <div class="text-[11px] truncate" :class="trafficUsedPercentage >= 95 ? 'text-destructive' : 'text-muted-foreground'">
              {{ formatBytes(trafficUsed) }}
              <template v-if="hasTrafficLimit(props.node)">
                / {{ formatBytes(props.node.traffic_limit) }}
              </template>
              <template v-else>
                / ∞
              </template>
            </div>
          </div>
        </div>

        <div v-else class="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <!-- CPU -->
          <div class="flex flex-col gap-1">
            <div class="flex justify-between text-xs">
              <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                <span>CPU<span v-if="props.node.cpu_cores" class="text-muted-foreground"> {{ props.node.cpu_cores }} 核</span></span>
              </span>
              <span class="font-mono tabular-nums font-medium">{{ (props.node.cpu ?? 0).toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="props.node.cpu ?? 0" :status="cpuStatus" :height="2" />
            <div class="text-[10px] text-muted-foreground opacity-60 truncate">
              {{ (props.node.load ?? 0).toFixed(2) }}, {{ (props.node.load5 ?? 0).toFixed(2) }}, {{ (props.node.load15 ?? 0).toFixed(2) }}
            </div>
          </div>

          <!-- 内存 -->
          <div class="flex flex-col gap-1" :title="swapTooltip">
            <div class="flex justify-between text-xs">
              <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                <span class="truncate">内存</span>
              </span>
              <span class="font-mono tabular-nums font-medium">{{ memPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="memPercentage" :status="memStatus" :height="2" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ formatBytes(props.node.ram ?? 0) }} / {{ formatBytes(props.node.mem_total ?? 0) }}
            </div>
          </div>

          <!-- 硬盘 -->
          <div class="flex flex-col gap-1">
            <div class="flex justify-between text-xs">
              <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                <span class="truncate">硬盘</span>
              </span>
              <span class="font-mono tabular-nums font-medium">{{ diskPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="diskPercentage" :status="diskStatus" :height="2" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ formatBytes(props.node.disk ?? 0) }} / {{ formatBytes(props.node.disk_total ?? 0) }}
            </div>
          </div>

          <!-- 流量（分级颜色） -->
          <div class="flex flex-col gap-1">
            <div class="flex justify-between text-xs">
              <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                <Icon :icon="NODE_METRIC_ICONS.traffic" data-node-metric-icon="traffic" width="13" height="13" class="shrink-0 text-muted-foreground/70" aria-hidden="true" />
                <span class="truncate">流量</span>
              </span>
              <span class="font-mono tabular-nums font-medium" :class="trafficPercentageClass">
                {{ hasTrafficLimit(props.node) ? `${trafficUsedPercentage.toFixed(1)}%` : '∞' }}
              </span>
            </div>
            <ProgressThin :percentage="trafficUsedPercentage" :status="trafficStatus" :height="2" />
            <div class="text-[11px] truncate" :class="trafficUsedPercentage >= 95 ? 'text-destructive' : 'text-muted-foreground'">
              {{ formatBytes(trafficUsed) }}
              <template v-if="hasTrafficLimit(props.node)">
                / {{ formatBytes(props.node.traffic_limit) }}
              </template>
              <template v-else>
                / ∞
              </template>
            </div>
          </div>
        </div>

        <!-- 三列：网速 / 总流量 / 剩余天数+价格或负载 -->
        <div class="grid gap-1.5" :class="nodeCardMetricGridClass">
          <!-- 实时网速 -->
          <div class="flex flex-col gap-0.5 rounded-lg bg-transparent min-w-0 overflow-hidden" :class="nodeCardMetricBoxClass">
            <div class="text-[11px] text-foreground flex items-center gap-1">
              <Icon icon="tabler:chevron-up" width="11" height="11" class="text-muted-foreground/70" />
              <span class="truncate min-w-0 overflow-hidden">{{ formatBytesPerSecond(props.node.net_out ?? 0) }}</span>
            </div>
            <div class="text-[11px] text-foreground flex items-center gap-1">
              <Icon icon="tabler:chevron-down" width="11" height="11" class="text-muted-foreground/70" />
              <span class="truncate min-w-0 overflow-hidden">{{ formatBytesPerSecond(props.node.net_in ?? 0) }}</span>
            </div>
          </div>

          <!-- 总流量 -->
          <div class="flex flex-col gap-0.5 rounded-lg bg-transparent min-w-0 overflow-hidden" :class="nodeCardMetricBoxClass">
            <div class="text-[11px] text-muted-foreground flex items-center gap-1">
              <Icon icon="tabler:upload" width="11" height="11" />
              <span class="truncate min-w-0 overflow-hidden">{{ formatBytes(props.node.net_total_up ?? 0) }}</span>
            </div>
            <div class="text-[11px] text-muted-foreground flex items-center gap-1">
              <Icon icon="tabler:download" width="11" height="11" />
              <span class="truncate min-w-0 overflow-hidden">{{ formatBytes(props.node.net_total_down ?? 0) }}</span>
            </div>
          </div>

          <!-- 第三列：有价格显示剩余天数+价格，否则显示负载 -->
          <div class="flex flex-col gap-0.5 rounded-lg bg-transparent min-w-0 overflow-hidden" :class="nodeCardMetricBoxClass">
            <template v-if="remainingInfoTags.length">
              <div
                v-for="(item, i) in remainingInfoTags" :key="i"
                class="text-[11px] flex items-center gap-0.5"
                :class="item.className ?? 'text-muted-foreground'"
              >
                <Icon :icon="item.icon" width="11" height="11" class="shrink-0" />
                <span v-if="item.text" class="truncate min-w-0 overflow-hidden">{{ item.text }}</span>
                <template v-else>
                  <span v-if="item.prefix" class="shrink-0">{{ item.prefix }}</span>
                  <span v-if="item.value" class="shrink-0 tabular-nums">{{ item.value }}</span>
                  <span v-if="item.unit" class="shrink-0">{{ item.unit }}</span>
                </template>
              </div>
            </template>
            <template v-else>
              <div class="text-[11px] text-muted-foreground truncate">
                {{ (props.node.load ?? 0).toFixed(2) }}
              </div>
              <div class="text-[11px] text-muted-foreground truncate">
                {{ (props.node.load5 ?? 0).toFixed(2) }} / {{ (props.node.load15 ?? 0).toFixed(2) }}
              </div>
            </template>
          </div>
        </div>

        <!--
          三网：按 ping 任务分项展示延迟，不做跨任务平均。
          后台可能只配置了 1 个任务，也可能配置了多个（如电信/联通/移动三网测速）——
          这里最多取前 3 项，单任务节点这里就是一个数字、没有分隔点，多任务节点用 · 分隔。
          只在存在任务级延迟数据时渲染，不占位、不影响其余节点的卡片高度。
        -->
        <div
          v-if="hasTaskLatencyItems"
          class="flex items-center justify-between gap-2"
          :class="!props.node.online ? 'blur-xs opacity-50' : ''"
        >
          <span class="text-xs font-normal text-muted-foreground">三网</span>
          <div class="flex items-center gap-1 font-mono text-xs font-medium">
            <template v-for="(item, index) in taskLatencyItems" :key="item.key">
              <span v-if="index > 0" class="text-muted-foreground/50">·</span>
              <DataTooltip :content="item.tooltip" placement="top" as="span" content-class="whitespace-nowrap">
                <span :class="latencyTextClass(item.valueText)">{{ item.valueText }}</span>
              </DataTooltip>
            </template>
          </div>
        </div>

        <!-- 延迟 + 丢包（真实历史采样点阵，与列表视图共用同一套展示逻辑，悬浮单格查看时间+数值） -->
        <div class="grid grid-cols-2 gap-2">
          <div
            class="group cursor-pointer rounded-lg bg-muted/50 p-2.5 transition-colors hover:bg-muted"
            :class="!props.node.online ? 'blur-xs opacity-50' : ''"
            role="button" tabindex="0"
            :aria-label="`${props.node.name} 延迟与丢包监测`"
            @click.stop="emit('pingClick')"
            @keydown.enter.stop.prevent="emit('pingClick')"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-normal text-muted-foreground">延迟</span>
              <DataTooltip
                v-if="latencyPanelTooltip"
                :content="latencyPanelTooltip"
                placement="top"
                as="span"
                content-class="whitespace-nowrap"
              >
                <span class="font-mono text-xs font-bold" :class="latencyTextClass(latencyDisplay)">{{ latencyDisplay }}</span>
              </DataTooltip>
              <span v-else class="font-mono text-xs font-bold" :class="latencyTextClass(latencyDisplay)">{{ latencyDisplay }}</span>
            </div>
            <div
              class="mt-1 grid h-2.5 cursor-auto items-end gap-[1.5px] rounded-sm bg-muted/40 p-0.5"
              :style="{ gridTemplateColumns: `repeat(${latencyRenderBars.length}, minmax(0, 1fr))` }"
            >
              <DataTooltip
                v-for="bar in latencyRenderBars"
                :key="bar.key"
                :content="bar.tooltip"
                placement="top"
                as="span"
                class="h-full w-full"
                content-class="whitespace-nowrap"
              >
                <span
                  :aria-label="bar.tooltip"
                  class="block h-full w-full rounded-[1px] transition-all group-hover:opacity-50 hover:scale-y-125 hover:opacity-100"
                  :class="bar.className"
                />
              </DataTooltip>
            </div>
          </div>
          <div
            class="group cursor-pointer rounded-lg bg-muted/50 p-2.5 transition-colors hover:bg-muted"
            :class="!props.node.online ? 'blur-xs opacity-50' : ''"
            role="button" tabindex="0"
            :aria-label="`${props.node.name} 丢包监测`"
            @click.stop="emit('pingClick')"
            @keydown.enter.stop.prevent="emit('pingClick')"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-normal text-muted-foreground">丢包</span>
              <DataTooltip
                v-if="lossPanelTooltip"
                :content="lossPanelTooltip"
                placement="top"
                as="span"
                content-class="whitespace-nowrap"
              >
                <span class="font-mono text-xs font-bold" :class="lossTextClass(lossDisplay)">{{ lossDisplay }}</span>
              </DataTooltip>
              <span v-else class="font-mono text-xs font-bold" :class="lossTextClass(lossDisplay)">{{ lossDisplay }}</span>
            </div>
            <div
              class="mt-1 grid h-2.5 cursor-auto items-end gap-[1.5px] rounded-sm bg-muted/40 p-0.5"
              :style="{ gridTemplateColumns: `repeat(${lossRenderBars.length}, minmax(0, 1fr))` }"
            >
              <DataTooltip
                v-for="bar in lossRenderBars"
                :key="bar.key"
                :content="bar.tooltip"
                placement="top"
                as="span"
                class="h-full w-full"
                content-class="whitespace-nowrap"
              >
                <span
                  :aria-label="bar.tooltip"
                  class="block h-full w-full rounded-[1px] transition-all group-hover:opacity-50 hover:scale-y-125 hover:opacity-100"
                  :class="bar.className"
                />
              </DataTooltip>
            </div>
          </div>
        </div>

        <!-- 自定义标签 -->
        <div v-if="customTags.length > 0" class="flex flex-wrap gap-1">
          <span
            v-for="(tag, i) in customTags" :key="i"
            class="rounded-full bg-primary/8 px-2 py-0.5 text-[11px] leading-tight text-primary ring-1 ring-inset ring-primary/20"
          >{{ tag }}</span>
        </div>

        <!-- 离线遮罩 -->
        <div
          v-if="!props.node.online"
          class="absolute inset-0 flex flex-col items-center justify-center z-10 rounded-xl bg-background/40 backdrop-blur-[2px]"
        >
          <div class="text-sm font-semibold text-destructive">
            离线
          </div>
          <div class="text-[11px] text-muted-foreground mt-1">
            {{ offlineTime }}
          </div>
        </div>
      </div>
    </template>
  </CardX>
</template>

<style scoped>
.node-card {
  position: relative;
  overflow: hidden;
}
</style>
