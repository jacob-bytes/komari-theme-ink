<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { Empty } from '@/components/ui/empty'
import { ProgressThin } from '@/components/ui/progress-thin'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNodeProviderMetadata } from '@/composables/useNodeProviderMetadata'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { hasTrafficLimit as checkHasTrafficLimit, getDiskPercentage, getMemoryPercentage, getTrafficUsed, getTrafficUsedPercentage } from '@/utils/nodeMetricsHelper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode } from '@/utils/regionHelper'

import { formatPrice, formatPriceWithCycle, getExpireStatus, getExpireStatusColor, getExpireText, parseTags } from '@/utils/tagHelper'

/** 指标图标：与 NodeCard 列表卡片保持一致的视觉语言 */
const METRIC_ICONS = {
  cpu: 'tabler:cpu',
  memory: 'icon-park-outline:memory',
  disk: 'tabler:server-2',
  traffic: 'tabler:arrows-transfer-up-down',
  gpu: 'tabler:brand-nvidia',
} as const

/** 详情信息卡片图标：与「资源使用」卡片同一套视觉语言，让两行看起来是同一体系 */
const DETAIL_ICONS = {
  system: 'tabler:device-desktop',
  cpu: 'tabler:cpu',
  rate: 'tabler:gauge',
  renewal: 'tabler:calendar-time',
} as const

/** 徽章状态到 Tailwind 语义色类的映射，跟随明暗主题自动切换 */
const STATUS_BADGE_CLASS: Record<'error' | 'warning' | 'success' | 'default', string> = {
  error: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/10 text-warning',
  success: 'bg-success/10 text-success',
  default: 'bg-muted text-muted-foreground',
}

const LoadChart = defineAsyncComponent(() => import('@/components/LoadChart.vue'))
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))

const route = useRoute()
const router = useRouter()

const appStore = useAppStore()
const nodesStore = useNodesStore()
const activeDetailSection = ref<'overview' | 'load' | 'ping'>('overview')
const data = computed(() => nodesStore.visibleNodesByUuid.get(String(route.params.id)))
const detailNodes = computed(() => nodesStore.visibleNodes)
const detailNodeIndex = computed(() => detailNodes.value.findIndex(node => node.uuid === data.value?.uuid))
const isFavoriteNode = computed(() => data.value ? appStore.isFavoriteNode(data.value.uuid) : false)

const { getNodeProviderMetadata } = useNodeProviderMetadata({
  nodes: () => data.value ? [data.value] : [],
  customAliases: () => appStore.providerAliases,
  enabled: () => Boolean(data.value),
  allowGeoLookup: () => appStore.privateFeaturesAllowed,
  geoPermission: 'providerGeoLookup',
})

onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' })
})

// 当节点数据加载后尝试获取厂商信息
// 注：节点 IP 通常不直接暴露，这里用节点 uuid 作为 fallback 标识
// 如果 data.value 有 ip 字段则直接用，否则跳过
watch(data, () => {
  activeDetailSection.value = 'overview'
}, { immediate: true })

function navigateDetailNode(offset: number): void {
  const nodes = detailNodes.value
  const index = detailNodeIndex.value
  if (nodes.length < 2 || index < 0)
    return
  const target = nodes[(index + offset + nodes.length) % nodes.length]
  if (target)
    void router.push({ name: 'instance-detail', params: { id: target.uuid } })
}

function selectDetailNode(event: Event): void {
  const uuid = (event.target as HTMLSelectElement).value
  if (uuid && uuid !== data.value?.uuid)
    void router.push({ name: 'instance-detail', params: { id: uuid } })
}

function toggleCurrentFavorite(): void {
  if (data.value)
    appStore.toggleFavoriteNode(data.value.uuid)
}

// 机房/厂商展示
const providerMetadata = computed(() => data.value ? getNodeProviderMetadata(data.value) : null)
const vpsProvider = computed(() => providerMetadata.value?.provider ?? null)

// 节点自定义标签
const customTags = computed(() => parseTags(data.value?.tags).map(t => t.text))

// 未登录且开启「未登录隐藏价格」时，屏蔽金额类指标（剩余时间为天数，仍显示）
const showPrice = computed(() => appStore.privateFeaturesAllowed || !appStore.hidePriceWhenLoggedOut)

const hasRegion = (region: string) => !!region
const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'minute')

const nodePriceText = computed(() => {
  if (!data.value)
    return '-'
  if (Number(data.value.price) <= 0)
    return formatPrice(0, data.value.currency, appStore.lang)
  return formatPriceWithCycle(data.value.price, data.value.billing_cycle, data.value.currency, appStore.lang)
})

const remainingTimeText = computed(() => {
  if (!data.value?.expired_at)
    return '-'
  return getExpireText(data.value.expired_at, appStore.lang)
})

const hasTrafficLimit = computed(() => checkHasTrafficLimit(data.value ?? { traffic_limit: 0 }))

/** 操作系统图标：与首页节点列表使用同一套匹配规则，保证视觉一致 */
const osIconSrc = computed(() => data.value ? getOSImage(data.value.os) : '')
const osDisplayName = computed(() => data.value ? getOSName(data.value.os) : '')

/** 在线/离线状态悬浮提示：紧凑徽章省略了精确时间，鼠标悬停展示完整上报/离线时间 */
const statusTooltip = computed(() => {
  const node = data.value
  if (!node)
    return ''
  const label = node.online ? '最近上报' : '离线时间'
  return `${label}：${formatDateTime(node.time)}`
})

/** 流量状态颜色：无限流量视为健康，超限阶梯与首页节点卡片保持一致（60%/80%/95%） */
const trafficStatus = computed(() => {
  const node = data.value
  if (!node || !hasTrafficLimit.value)
    return 'default' as const
  const pct = getTrafficUsedPercentage(node)
  if (pct >= 95)
    return 'error' as const
  if (pct >= 80)
    return 'warning' as const
  if (pct >= 60)
    return 'info' as const
  return 'default' as const
})

/** 「资源使用」主视觉行：CPU/内存/硬盘/流量（含 GPU，若节点提供）四到五项指标，进度条颜色跟随健康阈值变化 */
const resourceMetrics = computed(() => {
  const node = data.value
  if (!node)
    return []

  const memPct = getMemoryPercentage(node)
  const diskPct = getDiskPercentage(node)
  const trafficPct = hasTrafficLimit.value ? getTrafficUsedPercentage(node) : 0
  const trafficUsedBytes = getTrafficUsed(node)

  interface ResourceMetric {
    key: string
    label: string
    icon: string
    percentage: number
    status: 'default' | 'info' | 'warning' | 'error'
    primaryText: string
    subText: string
  }

  const metrics: ResourceMetric[] = [
    {
      key: 'cpu',
      label: 'CPU',
      icon: METRIC_ICONS.cpu,
      percentage: node.cpu ?? 0,
      status: getStatus(node.cpu ?? 0),
      primaryText: `${(node.cpu ?? 0).toFixed(1)}%`,
      subText: `负载 ${(node.load ?? 0).toFixed(2)} · ${(node.load5 ?? 0).toFixed(2)} · ${(node.load15 ?? 0).toFixed(2)}`,
    },
    {
      key: 'memory',
      label: '内存',
      icon: METRIC_ICONS.memory,
      percentage: memPct,
      status: getStatus(memPct),
      primaryText: `${memPct.toFixed(1)}%`,
      subText: `${formatBytes(node.ram)} / ${formatBytes(node.mem_total)}`,
    },
    {
      key: 'disk',
      label: '硬盘',
      icon: METRIC_ICONS.disk,
      percentage: diskPct,
      status: getStatus(diskPct),
      primaryText: `${diskPct.toFixed(1)}%`,
      subText: `${formatBytes(node.disk)} / ${formatBytes(node.disk_total)}`,
    },
    {
      key: 'traffic',
      label: '流量',
      icon: METRIC_ICONS.traffic,
      percentage: trafficPct,
      status: trafficStatus.value,
      primaryText: hasTrafficLimit.value ? `${trafficPct.toFixed(1)}%` : '无限',
      subText: hasTrafficLimit.value
        ? `${formatBytes(trafficUsedBytes)} / ${formatBytes(node.traffic_limit)}`
        : `已用 ${formatBytes(trafficUsedBytes)}`,
    },
  ]

  if (node.gpu_name) {
    metrics.push({
      key: 'gpu',
      label: 'GPU',
      icon: METRIC_ICONS.gpu,
      percentage: node.gpu ?? 0,
      status: getStatus(node.gpu ?? 0),
      primaryText: `${(node.gpu ?? 0).toFixed(1)}%`,
      subText: node.gpu_name,
    })
  }

  return metrics
})

/** 系统字段悬浮提示：内核版本等信息在紧凑视图中被省略，鼠标悬停可查看完整详情 */
const systemTooltip = computed(() => {
  const node = data.value
  if (!node)
    return ''
  const lines = [`系统：${[node.os, node.arch].filter(Boolean).join(' · ') || '-'}`]
  if (node.kernel_version)
    lines.push(`内核：${node.kernel_version}`)
  if (node.virtualization)
    lines.push(`虚拟化：${node.virtualization}`)
  return lines.join('\n')
})

/** CPU 字段悬浮提示：型号常被截断，鼠标悬停展示完整型号及物理核心、GPU 等信息 */
const cpuTooltip = computed(() => {
  const node = data.value
  if (!node)
    return ''
  const lines = [`${node.cpu_name || '-'}`]
  lines.push(node.cpu_physical_cores ? `${node.cpu_cores} vCPU（${node.cpu_physical_cores} 物理核心）` : `${node.cpu_cores} vCPU`)
  if (node.gpu_name) {
    lines.push(node.online ? `GPU：${node.gpu_name}（${node.gpu.toFixed(1)}%）` : `GPU：${node.gpu_name}`)
  }
  return lines.join('\n')
})

/** 到期徽章：复用全站统一的过期阈值（5 天危险 / 10 天警告），替换此前硬编码的 7 天判断 */
const expireBadgeClass = computed(() => {
  const node = data.value
  if (!node?.expired_at)
    return STATUS_BADGE_CLASS.default
  return STATUS_BADGE_CLASS[getExpireStatusColor(getExpireStatus(node.expired_at))]
})

/** 「详情信息」次要行：系统、CPU 型号（悬浮展示完整信息）、实时速率、续费到期状态 */
const detailInfoFields = computed(() => {
  const node = data.value
  if (!node)
    return []

  return [
    {
      label: '系统',
      icon: DETAIL_ICONS.system,
      value: [node.os, node.arch].filter(Boolean).join(' · '),
      tooltip: systemTooltip.value,
    },
    {
      label: 'CPU',
      icon: DETAIL_ICONS.cpu,
      value: `${node.cpu_name} (${node.cpu_cores} vCPU)`,
      tooltip: cpuTooltip.value,
    },
    {
      label: '实时速率',
      icon: DETAIL_ICONS.rate,
      value: '',
      upValue: formatBytesPerSecond(node.net_in),
      downValue: formatBytesPerSecond(node.net_out),
      sub: `累计 ↑${formatBytes(node.net_total_up)} · ↓${formatBytes(node.net_total_down)}`,
    },
    {
      label: '续费',
      icon: DETAIL_ICONS.renewal,
      value: showPrice.value ? nodePriceText.value : '***',
      sub: remainingTimeText.value,
      badgeClass: expireBadgeClass.value,
    },
  ]
})
</script>

<template>
  <div class="instance-detail space-y-4 pt-4">
    <div v-if="!data" class="px-4 pb-4">
      <CardX>
        <Empty description="节点不存在或已被删除">
          <template #extra>
            <Button @click="router.push('/')">
              返回首页
            </Button>
          </template>
        </Empty>
      </CardX>
    </div>

    <template v-else>
      <!-- 顶部导航 -->
      <div class="px-4 flex flex-wrap gap-2 items-center sm:gap-4">
        <Button variant="ghost" size="icon-sm" class="bg-background/50 hover:bg-background" aria-label="返回首页" @click="router.push('/')">
          <Icon icon="tabler:arrow-left" :width="16" :height="16" />
        </Button>
        <div class="min-w-0 text-xl font-bold flex items-center gap-2">
          <img
            v-if="osIconSrc"
            :src="osIconSrc"
            :alt="osDisplayName"
            width="18"
            height="18"
            class="size-4.5 shrink-0 rounded-[3px] object-contain"
          >
          <span class="truncate">{{ data.name }}</span>
          <span v-if="hasRegion(data.region)" class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">{{ getRegionCode(data.region) }}</span>
          <DataTooltip
            as="div"
            placement="bottom"
            :content="statusTooltip"
            class="cursor-help"
          >
            <span
              class="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-normal"
              :class="data.online ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'"
            >
              <span class="size-1.5 rounded-full" :class="data.online ? 'bg-success' : 'bg-destructive'" />
              {{ data.online ? `在线 ${formatUptime(data.uptime)}` : '离线' }}
            </span>
          </DataTooltip>
          <template v-if="customTags.length">
            <span
              v-for="(tag, i) in customTags" :key="i"
              class="rounded-xl bg-muted/60 px-2 py-0.5 text-[11px] font-normal leading-tight text-muted-foreground ring-1 ring-inset ring-border/60 backdrop-blur-xs"
            >{{ tag }}</span>
          </template>
        </div>
        <div class="ml-auto flex h-8 shrink-0 items-center gap-1 rounded-md bg-background/50 p-0.5 backdrop-blur-xs">
          <Button
            variant="ghost" size="icon-sm"
            class="size-7 rounded-sm shadow-none"
            :class="isFavoriteNode && 'text-[var(--status-warn)]'"
            :aria-label="isFavoriteNode ? '取消收藏当前节点' : '收藏当前节点'"
            :title="isFavoriteNode ? '取消收藏' : '收藏节��'"
            @click="toggleCurrentFavorite"
          >
            <Icon :icon="isFavoriteNode ? 'tabler:star-filled' : 'tabler:star'" :width="14" :height="14" />
          </Button>
          <Button
            variant="ghost" size="icon-sm" class="size-7 rounded-sm shadow-none"
            :disabled="detailNodes.length < 2"
            aria-label="上一个节点" title="上一个节点"
            @click="navigateDetailNode(-1)"
          >
            <Icon icon="tabler:chevron-left" :width="14" :height="14" />
          </Button>
          <select
            :value="data.uuid"
            class="h-7 max-w-34 rounded-sm border-0 bg-transparent px-1 text-xs text-foreground outline-none sm:max-w-48"
            aria-label="切换节点"
            @change="selectDetailNode"
          >
            <option v-for="node in detailNodes" :key="node.uuid" :value="node.uuid">
              {{ node.name }}
            </option>
          </select>
          <Button
            variant="ghost" size="icon-sm" class="size-7 rounded-sm shadow-none"
            :disabled="detailNodes.length < 2"
            aria-label="下一个节点" title="下一个节点"
            @click="navigateDetailNode(1)"
          >
            <Icon icon="tabler:chevron-right" :width="14" :height="14" />
          </Button>
        </div>
        <!-- 厂商标识 -->
        <DataTooltip
          v-if="vpsProvider"
          as="div"
          placement="bottom"
          :content="vpsProvider.tooltipLines.join('\n')"
          class="max-w-full"
          content-class="w-72 whitespace-pre-wrap break-words px-2 py-1.5 text-left leading-relaxed"
        >
          <div class="flex max-w-full items-center gap-1.5 rounded-full bg-background/50 px-3 py-1 text-xs text-muted-foreground">
            <Icon :icon="vpsProvider.primary.icon" :width="14" :height="14" class="shrink-0" />
            <span class="whitespace-normal break-words leading-snug">{{ vpsProvider.displayName }}</span>
          </div>
        </DataTooltip>
      </div>

      <div v-if="appStore.nodeDetailSectionTabsEnabled" class="px-4 overflow-x-auto">
        <Tabs v-model="activeDetailSection" class="w-full">
          <TabsList class="w-max h-8 bg-background/50 backdrop-blur-xl rounded-md">
            <TabsTrigger value="overview" class="h-6.5 flex-none shrink-0 gap-1 text-xs border-none data-[state=active]:text-selection shadow-none rounded-sm">
              <Icon icon="tabler:layout-dashboard" :width="12" :height="12" />
              概览
            </TabsTrigger>
            <TabsTrigger value="load" class="h-6.5 flex-none shrink-0 gap-1 text-xs border-none data-[state=active]:text-selection shadow-none rounded-sm">
              <Icon icon="tabler:activity" :width="12" :height="12" />
              负载
            </TabsTrigger>
            <TabsTrigger value="ping" class="h-6.5 flex-none shrink-0 gap-1 text-xs border-none data-[state=active]:text-selection shadow-none rounded-sm">
              <Icon icon="tabler:timeline" :width="12" :height="12" />
              延迟
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <!-- 资源使用：主视觉行，进度条颜色跟随健康阈值实时变化 -->
      <div class="px-4">
        <div
          data-resource-metrics
          class="grid grid-cols-2 gap-3 sm:grid-cols-4"
          :class="resourceMetrics.length > 4 && 'sm:grid-cols-5'"
        >
          <div
            v-for="metric in resourceMetrics" :key="metric.key"
            class="min-w-0 rounded-xl border border-border bg-muted/40 px-3.5 py-3"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground">
                <Icon :icon="metric.icon" :width="13" :height="13" />
                {{ metric.label }}
              </span>
              <span
                class="font-mono text-sm font-semibold"
                :class="{
                  'text-destructive': metric.status === 'error',
                  'text-warning': metric.status === 'warning',
                  'text-info': metric.status === 'info',
                  'text-foreground': metric.status === 'default',
                }"
              >{{ metric.primaryText }}</span>
            </div>
            <ProgressThin :percentage="metric.percentage" :status="metric.status" :height="4" class="mt-2.5" />
            <div class="mt-1.5 truncate text-[11px] text-muted-foreground">
              {{ metric.subText }}
            </div>
          </div>
        </div>
      </div>

      <!-- 详情信息：系统、CPU 型号、实时速率与续费到期状态。
           与上方「资源使用」行使用同一套卡片语言（独立卡片 + border + bg-muted/40 + 相同断点），
           而非之前的单个大容器内用竖线分隔字段——两行现在是同一视觉体系的延续，而不是两种风格拼接。 -->
      <div class="px-4">
        <div
          data-detail-summary
          class="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <div
            v-for="field in detailInfoFields" :key="field.label"
            class="min-w-0 rounded-xl border border-border bg-muted/40 px-3.5 py-3"
          >
            <span class="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground">
              <Icon :icon="field.icon" :width="13" :height="13" />
              {{ field.label }}
            </span>
            <DataTooltip
              v-if="field.tooltip"
              as="div"
              placement="bottom"
              :content="field.tooltip"
              class="mt-2 block max-w-full cursor-help"
              content-class="w-max max-w-72 whitespace-pre-line break-words px-2 py-1.5 text-left leading-relaxed"
            >
              <span class="block max-w-full truncate font-mono text-sm font-semibold text-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-3">{{ field.value }}</span>
            </DataTooltip>
            <div v-else class="mt-2 max-w-full truncate font-mono text-sm font-semibold text-foreground">
              <template v-if="field.upValue">
                <span class="text-foreground">↑ {{ field.upValue }}</span>
                <span class="text-muted-foreground"> · </span>
                <span class="text-foreground">↓ {{ field.downValue }}</span>
              </template>
              <template v-else>
                {{ field.value }}
              </template>
            </div>
            <div v-if="field.sub" class="mt-1.5 truncate text-[11px] text-muted-foreground">
              <template v-if="field.label === '续费'">
                <span
                  class="inline-flex rounded-full px-2 py-0.5 text-[10px] leading-tight"
                  :class="field.badgeClass"
                >{{ field.sub }}</span>
              </template>
              <template v-else>
                {{ field.sub }}
              </template>
            </div>
          </div>
        </div>
      </div>

      <LoadChart v-if="!appStore.nodeDetailSectionTabsEnabled || activeDetailSection === 'load'" :uuid="data.uuid" class="px-4" />
      <PingChart v-if="!appStore.nodeDetailSectionTabsEnabled || activeDetailSection === 'ping'" :uuid="data.uuid" class="px-4" />
    </template>
  </div>
</template>

<style scoped>
/* 在线状态 · 翡翠绿呼吸灯 */
.status-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(16 185 129);
  animation: status-pulse 1.6s ease-in-out infinite;
}
@keyframes status-pulse {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgb(16 185 129 / 0.5);
  }
  50% {
    opacity: 0.65;
    box-shadow: 0 0 0 4px rgb(16 185 129 / 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .status-pulse {
    animation: none;
  }
}
</style>
