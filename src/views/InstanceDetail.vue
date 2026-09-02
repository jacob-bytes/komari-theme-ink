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
import { formatBytesWithConfig, formatDateTime, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { hasTrafficLimit as checkHasTrafficLimit, getDiskPercentage, getMemoryPercentage, getTrafficUsed, getTrafficUsedPercentage } from '@/utils/nodeMetricsHelper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode } from '@/utils/regionHelper'

/** 指标图标：与 NodeCard 列表卡片保持一致的视觉语言 */
const METRIC_ICONS = {
  cpu: 'tabler:cpu',
  memory: 'icon-park-outline:memory',
  disk: 'tabler:server-2',
  traffic: 'tabler:arrows-transfer-up-down',
  gpu: 'tabler:brand-nvidia',
} as const

/** 「设备信息」卡片图标：与「资源使用」卡片同一套视觉语言，让两行看起来是同一体系 */
const DETAIL_ICONS = {
  device: 'tabler:server',
  cpu: 'tabler:cpu',
  arch: 'tabler:binary',
  virtualization: 'tabler:box-multiple',
  os: 'tabler:device-desktop',
  kernel: 'tabler:code',
  uptime: 'tabler:stopwatch',
  lastReport: 'tabler:clock',
} as const

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

const hasRegion = (region: string) => !!region
const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'minute')

const hasTrafficLimit = computed(() => checkHasTrafficLimit(data.value ?? { traffic_limit: 0 }))

/** 操作系统图标：与首页节点列表使用同一套匹配规则，保证视觉一致 */
const osIconSrc = computed(() => data.value ? getOSImage(data.value.os) : '')
const osDisplayName = computed(() => data.value ? getOSName(data.value.os) : '')

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

  return metrics
})

/** CPU 字段悬浮提示：型号常被截断，鼠标悬停展示完整型号及物理核心数 */
const cpuTooltip = computed(() => {
  const node = data.value
  if (!node)
    return ''
  const lines = [`${node.cpu_name || '-'}`]
  lines.push(node.cpu_physical_cores ? `${node.cpu_cores} vCPU（${node.cpu_physical_cores} 物理核心）` : `${node.cpu_cores} vCPU`)
  return lines.join('\n')
})

interface DeviceInfoField {
  key: string
  label: string
  icon: string
  value: string
  tooltip?: string
  iconSrc?: string
  span: 1 | 2
}

/** 「设备信息」统一网格：CPU / 架构 / 虚拟化 / 操作系统 / 内核版��� / 运行时间 / 最后上报——全部是低频、
 *  基本不变的静态身份数据，因此合并到同一张卡片、同一套网格中展示，不再拆成左右两张高度不对称的卡片。
 *  网格采用与上方「资源使用」行相同的 2/4 列断点，保证两行在宽度和分栏边界上严格对齐。
 *  GPU 只有节点确实配备时才追加一格；没有 GPU 的机器不再固定留出一格「无」造成空白噪音。 */
const deviceInfoFields = computed(() => {
  const node = data.value
  if (!node)
    return []

  const fields: DeviceInfoField[] = [
    {
      key: 'cpu',
      label: 'CPU',
      icon: DETAIL_ICONS.cpu,
      value: node.cpu_name || '-',
      tooltip: cpuTooltip.value,
      span: 2,
    },
    {
      key: 'arch',
      label: '架构',
      icon: DETAIL_ICONS.arch,
      value: node.arch || '-',
      span: 1,
    },
    {
      key: 'virtualization',
      label: '虚拟化',
      icon: DETAIL_ICONS.virtualization,
      value: node.virtualization || '-',
      span: 1,
    },
    {
      key: 'os',
      label: '操作系统',
      icon: DETAIL_ICONS.os,
      value: osDisplayName.value || node.os || '-',
      iconSrc: osIconSrc.value,
      span: 1,
    },
    {
      key: 'kernel',
      label: '内核版本',
      icon: DETAIL_ICONS.kernel,
      value: node.kernel_version || '-',
      span: 1,
    },
    {
      key: 'uptime',
      label: '运行时间',
      icon: DETAIL_ICONS.uptime,
      value: formatUptime(node.uptime ?? 0),
      span: 1,
    },
    {
      key: 'lastReport',
      label: '最后上报',
      icon: DETAIL_ICONS.lastReport,
      value: formatDateTime(node.time),
      span: 1,
    },
  ]

  const gpuName = node.gpu_name && node.gpu_name.toLowerCase() !== 'none' ? node.gpu_name : ''
  if (gpuName) {
    fields.push({
      key: 'gpu',
      label: 'GPU',
      icon: METRIC_ICONS.gpu,
      value: node.online ? `${gpuName} · ${(node.gpu ?? 0).toFixed(1)}%` : gpuName,
      span: 1,
    })
  }

  return fields
})
</script>

<template>
  <div class="instance-detail space-y-4 pt-4">
    <div v-if="!data" class="px-4 pb-4">
      <CardX>
        <Empty icon="tabler:server-off" description="节点不存在或已被删除">
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

      <!-- 资源使用：主视觉行，固定 4 项（CPU/内存/硬盘/流量），进度条颜色跟随健康阈值实时变化。
           GPU 大多数节点用不上，不再作为第 5 项占用这一行，改在下方「设备信息」卡片中按需展示。 -->
      <div class="px-4">
        <div data-resource-metrics class="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      <!-- 设备信息：CPU / 架构 / 虚拟化 / 操作系统 / 内核版本 / 运行时间 / 最后上报等静态身份字段统一放入
           同一张卡片，网格断点（grid-cols-2 sm:grid-cols-4）与上方「资源使用」行完全一致，两行严格对齐，
           不再出现左右两张卡片高度不对称、栅格错位的问题。 -->
      <div v-if="deviceInfoFields.length" class="px-4">
        <div data-device-info class="rounded-xl border border-border bg-muted/40 p-3.5">
          <div class="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground">
            <Icon :icon="DETAIL_ICONS.device" :width="13" :height="13" />
            设备信息
          </div>
          <div class="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <template v-for="field in deviceInfoFields" :key="field.key">
              <DataTooltip
                v-if="field.tooltip"
                as="div"
                placement="bottom"
                :content="field.tooltip"
                class="block max-w-full cursor-help rounded-lg bg-background/60 px-3 py-2.5"
                :class="field.span === 2 ? 'col-span-2' : 'col-span-1'"
                content-class="w-max max-w-72 whitespace-pre-line break-words px-2 py-1.5 text-left leading-relaxed"
              >
                <span class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Icon :icon="field.icon" :width="12" :height="12" />
                  {{ field.label }}
                </span>
                <span class="mt-1 block max-w-full truncate font-mono text-sm font-semibold text-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-3">{{ field.value }}</span>
              </DataTooltip>
              <div
                v-else
                class="min-w-0 rounded-lg bg-background/60 px-3 py-2.5"
                :class="field.span === 2 ? 'col-span-2' : 'col-span-1'"
              >
                <span class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Icon :icon="field.icon" :width="12" :height="12" />
                  {{ field.label }}
                </span>
                <span class="mt-1 flex items-center gap-1.5 truncate font-mono text-sm font-semibold text-foreground">
                  <img v-if="field.iconSrc" loading="lazy" :src="field.iconSrc" :alt="field.value" class="size-3.5 shrink-0">
                  <span class="truncate">{{ field.value }}</span>
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <NodeUptimeTimeline :uuid="data.uuid" :online="data.online" />

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
