<script setup lang="ts">
import type { GeneralCardKey } from '@/stores/app'
import type { NodeData } from '@/stores/nodes'
import type { CurrencyCode, ExchangeRateSource } from '@/utils/financeHelper'
import type { TopNodeMetric } from '@/utils/nodeMetricsHelper'
import { Icon } from '@iconify/vue'
import { useNow } from '@vueuse/core'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { UI_CONFIG } from '@/constants/ui'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import * as financeHelper from '@/utils/financeHelper'
import { formatBytesPerSecondSplit, formatBytesSplit } from '@/utils/helper'
import {
  getConnectionCount,
  getExpiryDays,
  getHighLoadMetrics,
  getRealtimeTotalSpeed,
  getTrafficUsed,
  getTrafficUsedPercentage,
  isExpiringNode,
  isHighLoadNode,
  isTrafficWarningNode,
} from '@/utils/nodeMetricsHelper'
import { getRegionDisplayName } from '@/utils/regionHelper'
import { isFreeNode } from '@/utils/tagHelper'

interface GeneralMetricCard {
  key: GeneralCardKey
  label: string
  icon: string
  value: string
  unit?: string
  tooltip?: string
  action?: 'financeDetails'
}

interface OnlineStats {
  count: number
  totalSpeed: { up: number, down: number }
  avgCpu: number
  totalGpu: number
  gpuNodeCount: number
  avgLoad: number
  avgLoad5: number
  avgLoad15: number
  totalProcesses: number
  totalConnectionsTcp: number
  totalConnectionsUdp: number
  trafficPeak: TopNodeMetric | null
  uploadPeakNode: TopNodeMetric | null
  downloadPeakNode: TopNodeMetric | null
  gpuPeakNode: TopNodeMetric | null
  connectionPeakNode: TopNodeMetric | null
  highLoadNodes: NodeData[]
}

const props = defineProps<{
  nodes?: NodeData[]
  transitionKey?: string
}>()
const appStore = useAppStore()
const nodesStore = useNodesStore()
const FinanceDetailsDialog = defineAsyncComponent(() => import('@/components/FinanceDetailsDialog.vue'))
// 未登录且开启「未登录隐藏价格」时，屏蔽金额类信息
const showPrice = computed(() => appStore.privateFeaturesAllowed || !appStore.hidePriceWhenLoggedOut)
const exchangeRates = ref(financeHelper.DEFAULT_EXCHANGE_RATES)
const dailyExchangeRates = ref(financeHelper.DEFAULT_EXCHANGE_RATES)
const exchangeRateSource = ref<ExchangeRateSource | 'loading'>('loading')
const exchangeRateUpdatedAt = ref<number | null>(null)
const financeCurrency = ref<CurrencyCode>('CNY')
const excludeFreeNodes = ref(true)
const financeDetailsOpen = ref(false)
const currentTime = useNow({ interval: 1000 })
const summaryNodes = computed(() => props.nodes ?? nodesStore.visibleNodes)
const summaryTransitionKey = computed(() => props.transitionKey ?? nodesStore.visibleNodes.length)
const offlineCount = computed(() => summaryNodes.value.filter(n => !n.online).length)
/** netSpeed 卡迷你趋势采样（每 2s 采一次全域上下行总和，保留 30 点） */
const overviewAuxLines = computed<Record<string, string>>(() => {
  const nodes = summaryNodes.value
  const offline = nodes.filter(n => !n.online).length
  const highLoad = nodes.filter(n => (n.cpu ?? 0) >= 90).length
  const up = nodes.reduce((sum, n) => sum + (n.net_out ?? 0), 0)
  const down = nodes.reduce((sum, n) => sum + (n.net_in ?? 0), 0)
  const upFmt = formatBytesSplit(up)
  const downFmt = formatBytesSplit(down)
  return {
    onlineNodes: offline > 0 ? `● ${offline} 台离线` : '● 全部在线',
    highLoadNodes: highLoad > 0 ? `● ${highLoad} 台高负载` : '● 无高负载节点',
    totalTraffic: `今日 ↑${upFmt.value}${upFmt.unit} · ↓${downFmt.value}${downFmt.unit}`,
  }
})
const netHistory = ref<number[]>([])
const cpuHistory = ref<number[]>([])
let netTimer: number | undefined

/** 每 2s 采一次全域上下行总速率与在线节点平均 CPU，供迷你趋势图使用，各保留 30 点 */
function sampleOverviewMetrics() {
  const onlineNodes = summaryNodes.value.filter(n => n.online)
  const total = summaryNodes.value.reduce((sum, n) => sum + (n.net_out ?? 0) + (n.net_in ?? 0), 0) / 1024
  const cpuAvg = onlineNodes.length > 0 ? onlineNodes.reduce((sum, n) => sum + (n.cpu ?? 0), 0) / onlineNodes.length : 0
  netHistory.value = [...netHistory.value, Math.round(total * 10) / 10].slice(-30)
  cpuHistory.value = [...cpuHistory.value, Math.round(cpuAvg * 10) / 10].slice(-30)
}

/** 支持迷你趋势图的卡片 key 到其历史数据的映射 */
const SPARKLINE_HISTORIES: Partial<Record<GeneralCardKey, () => number[]>> = {
  netSpeed: () => netHistory.value,
  avgCpu: () => cpuHistory.value,
}

function sparkHistoryFor(key: GeneralCardKey): number[] {
  return SPARKLINE_HISTORIES[key]?.() ?? []
}
function sparkPoints(data: number[]): string {
  if (data.length < 2)
    return ''
  const min = Math.min(...data)
  const max = Math.max(...data, min + 1)
  return data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = 22 - ((v - min) / (max - min)) * 20
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}
function sparkArea(data: number[]): string {
  const pts = sparkPoints(data)
  return pts ? `${pts} 100,24 0,24` : ''
}

const metricSwitchTransitionProps = computed(() => ({
  ...(appStore.disablePageAnimation
    ? { css: false }
    : { name: 'metric-switch', mode: 'out-in' as const }),
}))

function getMetricSwitchStyle(index: number): Record<string, string> {
  return {
    '--metric-switch-delay': `${index * UI_CONFIG.motion.staggerMs}ms`,
  }
}

function formatBytesText(bytes: number): string {
  const formatted = formatBytesSplit(bytes, appStore.byteDecimals)
  return `${formatted.value} ${formatted.unit}`
}

function formatSpeedText(bytes: number): string {
  const formatted = formatBytesPerSecondSplit(bytes, appStore.byteDecimals)
  return `${formatted.value} ${formatted.unit}`
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('zh-CN')
}

function formatDecimal(value: number, digits = 1): string {
  if (!Number.isFinite(value))
    return '0'
  return value.toFixed(digits)
}

function formatTopNodeSpeed(metric: TopNodeMetric | null, fallback = '-'): { value: string, unit?: string, tooltip?: string } {
  if (!metric || metric.value <= 0)
    return { value: fallback }

  const formatted = formatBytesPerSecondSplit(metric.value, appStore.byteDecimals)
  return {
    value: formatted.value,
    unit: formatted.unit,
    tooltip: `${metric.node.name}\n↑ ${formatSpeedText(metric.node.net_out || 0)}\n↓ ${formatSpeedText(metric.node.net_in || 0)}`,
  }
}

function formatTopNodePercentage(metric: TopNodeMetric | null): { value: string, unit?: string, tooltip?: string } {
  if (!metric)
    return { value: '-' }

  const gpuName = metric.node.gpu_name?.trim()
  return {
    value: formatDecimal(metric.value),
    unit: '%',
    tooltip: [metric.node.name, gpuName, `GPU ${formatDecimal(metric.value)}%`].filter(Boolean).join('\n'),
  }
}

function formatNodeNames(nodes: NodeData[], formatter?: (node: NodeData) => string, max = 8): string {
  if (nodes.length === 0)
    return '暂无节点'

  const lines = nodes.slice(0, max).map(node => formatter ? formatter(node) : node.name)
  if (nodes.length > max)
    lines.push(`… 还有 ${nodes.length - max} 台`)
  return lines.join('\n')
}

function getDistribution(nodes: NodeData[], selector: (node: NodeData) => string | null | undefined): Array<[string, number]> {
  const map = new Map<string, number>()
  for (const node of nodes) {
    const key = selector(node)?.trim() || '未知'
    map.set(key, (map.get(key) || 0) + 1)
  }

  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
}

function getKnownDistribution(nodes: NodeData[], selector: (node: NodeData) => string | null | undefined): Array<[string, number]> {
  const map = new Map<string, number>()
  for (const node of nodes) {
    const key = selector(node)?.trim()
    if (!key)
      continue
    map.set(key, (map.get(key) || 0) + 1)
  }

  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
}

function formatDistributionTooltip(entries: Array<[string, number]>): string {
  if (entries.length === 0)
    return '暂无数据'

  return entries.slice(0, 8).map(([key, count]) => `${key}: ${count} 台`).join('\n')
}

function formatExpiryNode(node: NodeData): string {
  const days = getExpiryDays(node)
  if (days === null)
    return `${node.name}: 未知`
  if (days <= 0)
    return `${node.name}: 已过期`
  return `${node.name}: ${days} 天`
}

function getNodePeriodCostCNY(node: NodeData, periodDays: number): number {
  if (excludeFreeNodes.value && isFreeNode(node))
    return 0

  return financeHelper.calculatePeriodCostCNY(node, exchangeRates.value, periodDays)
}

function formatCostCard(amountCNY: number): { value: string, unit?: string } {
  if (!showPrice.value)
    return { value: '***' }

  const targetRate = exchangeRates.value[financeCurrency.value] || 1
  const formatted = financeHelper.formatFinanceAmount(amountCNY * targetRate, financeCurrency.value)
  return {
    value: `${formatted.symbol}${formatted.value}`,
  }
}

function updateTopMetric(current: TopNodeMetric | null, node: NodeData, value: number): TopNodeMetric | null {
  if (!Number.isFinite(value))
    return current

  if (!current || value > current.value)
    return { node, value: Math.max(0, value) }

  return current
}

const onlineStats = computed<OnlineStats>(() => {
  const stats: OnlineStats = {
    count: 0,
    totalSpeed: { up: 0, down: 0 },
    avgCpu: 0,
    totalGpu: 0,
    gpuNodeCount: 0,
    avgLoad: 0,
    avgLoad5: 0,
    avgLoad15: 0,
    totalProcesses: 0,
    totalConnectionsTcp: 0,
    totalConnectionsUdp: 0,
    trafficPeak: null,
    uploadPeakNode: null,
    downloadPeakNode: null,
    gpuPeakNode: null,
    connectionPeakNode: null,
    highLoadNodes: [],
  }

  for (const node of summaryNodes.value) {
    if (!node.online)
      continue

    stats.count += 1
    stats.totalSpeed.up += node.net_out || 0
    stats.totalSpeed.down += node.net_in || 0
    stats.avgCpu += node.cpu || 0
    stats.avgLoad += node.load || 0
    stats.avgLoad5 += node.load5 || 0
    stats.avgLoad15 += node.load15 || 0
    stats.totalProcesses += node.process || 0
    stats.totalConnectionsTcp += node.connections || 0
    stats.totalConnectionsUdp += node.connections_udp || 0
    stats.trafficPeak = updateTopMetric(stats.trafficPeak, node, getRealtimeTotalSpeed(node))
    stats.uploadPeakNode = updateTopMetric(stats.uploadPeakNode, node, node.net_out || 0)
    stats.downloadPeakNode = updateTopMetric(stats.downloadPeakNode, node, node.net_in || 0)
    stats.connectionPeakNode = updateTopMetric(stats.connectionPeakNode, node, getConnectionCount(node))
    const hasGpu = Boolean(node.gpu_name?.trim()) || (node.gpu || 0) > 0
    if (hasGpu) {
      stats.totalGpu += node.gpu || 0
      stats.gpuNodeCount += 1
      stats.gpuPeakNode = updateTopMetric(stats.gpuPeakNode, node, node.gpu || 0)
    }
    if (isHighLoadNode(node, appStore.homeHighLoadThreshold))
      stats.highLoadNodes.push(node)
  }

  if (stats.count > 0) {
    stats.avgCpu /= stats.count
    stats.avgLoad /= stats.count
    stats.avgLoad5 /= stats.count
    stats.avgLoad15 /= stats.count
  }

  return stats
})

const totalSpeed = computed(() => onlineStats.value.totalSpeed)

const totalTraffic = computed(() => {
  const up = summaryNodes.value.reduce((sum, node) => sum + (node.net_total_up || 0), 0)
  const down = summaryNodes.value.reduce((sum, node) => sum + (node.net_total_down || 0), 0)
  return { up, down }
})

const formattedTrafficUp = computed(() => formatBytesSplit(totalTraffic.value.up, appStore.byteDecimals))
const formattedTrafficDown = computed(() => formatBytesSplit(totalTraffic.value.down, appStore.byteDecimals))
const totalTrafficTooltip = computed(() => formatBytesSplit(totalTraffic.value.up + totalTraffic.value.down, appStore.byteDecimals))

const formattedSpeedUp = computed(() => formatBytesPerSecondSplit(totalSpeed.value.up, appStore.byteDecimals))
const formattedSpeedDown = computed(() => formatBytesPerSecondSplit(totalSpeed.value.down, appStore.byteDecimals))

// ==================== 内存 / 硬盘 / 交换内存 汇总 ====================
// 离线节点的 ram / disk / swap 为 0，不影响 used 求和；total 是静态库存信息，按全量统计
const totalMemory = computed(() => {
  let used = 0
  let total = 0
  for (const node of summaryNodes.value) {
    used += node.ram || 0
    total += node.mem_total || 0
  }
  return { used, total }
})

const totalDisk = computed(() => {
  let used = 0
  let total = 0
  for (const node of summaryNodes.value) {
    used += node.disk || 0
    total += node.disk_total || 0
  }
  return { used, total }
})

const totalSwap = computed(() => {
  let used = 0
  let total = 0
  for (const node of summaryNodes.value) {
    used += node.swap || 0
    total += node.swap_total || 0
  }
  return { used, total }
})

const formattedMemoryUsed = computed(() => formatBytesSplit(totalMemory.value.used, appStore.byteDecimals))
const formattedMemoryTotal = computed(() => formatBytesSplit(totalMemory.value.total, appStore.byteDecimals))
const formattedDiskUsed = computed(() => formatBytesSplit(totalDisk.value.used, appStore.byteDecimals))
const formattedDiskTotal = computed(() => formatBytesSplit(totalDisk.value.total, appStore.byteDecimals))
const formattedSwapUsed = computed(() => formatBytesSplit(totalSwap.value.used, appStore.byteDecimals))
const formattedSwapTotal = computed(() => formatBytesSplit(totalSwap.value.total, appStore.byteDecimals))

const onlineNodeCount = computed(() => onlineStats.value.count)
const totalNodeCount = computed(() => summaryNodes.value.length)
const avgCpu = computed(() => onlineStats.value.avgCpu)
const avgGpu = computed(() => onlineStats.value.gpuNodeCount > 0
  ? onlineStats.value.totalGpu / onlineStats.value.gpuNodeCount
  : null)
const gpuNodes = computed(() => summaryNodes.value.filter(node => Boolean(node.gpu_name?.trim()) || (node.gpu || 0) > 0))
const onlineGpuNodes = computed(() => gpuNodes.value.filter(node => node.online))
const gpuPeakNode = computed(() => onlineStats.value.gpuPeakNode)
const avgLoad = computed(() => onlineStats.value.avgLoad)
const avgLoad5 = computed(() => onlineStats.value.avgLoad5)
const avgLoad15 = computed(() => onlineStats.value.avgLoad15)
const totalProcesses = computed(() => onlineStats.value.totalProcesses)
const totalConnectionsTcp = computed(() => onlineStats.value.totalConnectionsTcp)
const totalConnectionsUdp = computed(() => onlineStats.value.totalConnectionsUdp)
const totalCpuCores = computed(() => summaryNodes.value.reduce((sum, node) => sum + (node.cpu_cores || 0), 0))
const trafficQuota = computed(() => {
  let used = 0
  let limit = 0

  for (const node of summaryNodes.value) {
    if ((node.traffic_limit || 0) <= 0)
      continue
    used += getTrafficUsed(node)
    limit += node.traffic_limit || 0
  }

  return { used, limit }
})
const trafficQuotaPercentage = computed(() => {
  if (trafficQuota.value.limit <= 0)
    return 0
  return trafficQuota.value.used / trafficQuota.value.limit * 100
})

const trafficPeak = computed(() => onlineStats.value.trafficPeak)
const uploadPeakNode = computed(() => onlineStats.value.uploadPeakNode)
const downloadPeakNode = computed(() => onlineStats.value.downloadPeakNode)
const connectionPeakNode = computed(() => onlineStats.value.connectionPeakNode)
const offlineNodes = computed(() => summaryNodes.value.filter(node => !node.online))
const highLoadNodes = computed(() => onlineStats.value.highLoadNodes)
const expiringNodes = computed(() => summaryNodes.value.filter(node => isExpiringNode(node, appStore.homeExpiringDays)))
const trafficWarningNodes = computed(() => summaryNodes.value.filter(node => isTrafficWarningNode(node, appStore.homeTrafficWarningThreshold)))
const regionDistribution = computed(() => getKnownDistribution(summaryNodes.value, node => getRegionDisplayName(node.region)))
const systemDistribution = computed(() => getDistribution(summaryNodes.value, node => node.os))
const virtualizationDistribution = computed(() => getDistribution(summaryNodes.value, node => node.virtualization))
const monthlyCostCNY = computed(() => summaryNodes.value.reduce((sum, node) => sum + getNodePeriodCostCNY(node, 30), 0))
const yearlyCostCNY = computed(() => summaryNodes.value.reduce((sum, node) => sum + getNodePeriodCostCNY(node, 365), 0))

const remainingValueCNY = computed(() => {
  return financeHelper.calculateTotalRemainingValueCNY(summaryNodes.value, exchangeRates.value, excludeFreeNodes.value)
})
const remainingValue = computed(() => {
  const targetRate = exchangeRates.value[financeCurrency.value] || 1
  return remainingValueCNY.value * targetRate
})
const formattedRemainingValue = computed(() => {
  return financeHelper.formatFinanceAmount(remainingValue.value, financeCurrency.value)
})
const totalValueCNY = computed(() => {
  return financeHelper.calculateTotalValueCNY(summaryNodes.value, exchangeRates.value, excludeFreeNodes.value)
})
const totalValue = computed(() => {
  const targetRate = exchangeRates.value[financeCurrency.value] || 1
  return totalValueCNY.value * targetRate
})
const formattedTotalValue = computed(() => {
  return financeHelper.formatFinanceAmount(totalValue.value, financeCurrency.value)
})
const totalValueTooltip = computed(() => {
  if (!showPrice.value)
    return '总价值\n***'
  return `总价值\n${formattedTotalValue.value.symbol}${formattedTotalValue.value.value}`
})

const trafficPeakCard = computed(() => formatTopNodeSpeed(trafficPeak.value))
const uploadPeakCard = computed(() => formatTopNodeSpeed(uploadPeakNode.value))
const downloadPeakCard = computed(() => formatTopNodeSpeed(downloadPeakNode.value))
const gpuPeakCard = computed(() => formatTopNodePercentage(gpuPeakNode.value))
const currentTimeText = computed(() => currentTime.value.toLocaleTimeString('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}))
const currentDateText = computed(() => currentTime.value.toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
}))
const connectionPeakTooltip = computed(() => {
  const metric = connectionPeakNode.value
  if (!metric)
    return '暂无数据'
  return `${metric.node.name}\nTCP ${formatCount(metric.node.connections || 0)}\nUDP ${formatCount(metric.node.connections_udp || 0)}`
})
const monthlyCostCard = computed(() => formatCostCard(monthlyCostCNY.value))
const yearlyCostCard = computed(() => formatCostCard(yearlyCostCNY.value))

function getCardDefinition(key: GeneralCardKey): GeneralMetricCard {
  switch (key) {
    case 'currentTime':
      return {
        key: 'currentTime',
        label: '当前时间',
        icon: 'tabler:clock',
        value: currentTimeText.value,
        tooltip: currentDateText.value,
      }
    case 'memory':
      return {
        key: 'memory',
        label: '内存用量',
        icon: 'icon-park-outline:memory',
        value: formattedMemoryUsed.value.value,
        unit: `${formattedMemoryUsed.value.unit} / ${formattedMemoryTotal.value.value} ${formattedMemoryTotal.value.unit}`,
      }
    case 'disk':
      return {
        key: 'disk',
        label: '硬盘用量',
        icon: 'tabler:server-2',
        value: formattedDiskUsed.value.value,
        unit: `${formattedDiskUsed.value.unit} / ${formattedDiskTotal.value.value} ${formattedDiskTotal.value.unit}`,
      }
    case 'remainingValue':
      return {
        key: 'remainingValue',
        label: '剩余价值',
        icon: 'tabler:cash',
        value: showPrice.value ? `${formattedRemainingValue.value.symbol}${formattedRemainingValue.value.value}` : '***',
        tooltip: totalValueTooltip.value,
        action: showPrice.value ? 'financeDetails' : undefined,
      }
    case 'totalTraffic':
      return {
        key: 'totalTraffic',
        label: '累计流量',
        icon: 'tabler:download',
        value: totalTrafficTooltip.value.value,
        unit: totalTrafficTooltip.value.unit,
        tooltip: `↑ ${formattedTrafficUp.value.value} ${formattedTrafficUp.value.unit}\n↓ ${formattedTrafficDown.value.value} ${formattedTrafficDown.value.unit}`,
      }
    case 'netSpeed':
      return {
        key: 'netSpeed',
        label: '实时速率',
        icon: 'tabler:arrows-exchange',
        value: `↑${formattedSpeedUp.value.value}`,
        unit: `KB/s · ↓${formattedSpeedDown.value.value} ${formattedSpeedDown.value.unit}`,
        tooltip: `上行 ${formattedSpeedUp.value.value} ${formattedSpeedUp.value.unit} · 下行 ${formattedSpeedDown.value.value} ${formattedSpeedDown.value.unit}`,
      }
    case 'systemLoad':
      return {
        key: 'systemLoad',
        label: '平均态势',
        icon: 'tabler:gauge',
        value: formatDecimal(avgCpu.value),
        unit: `% · 负载 ${formatDecimal(avgLoad.value)}`,
        tooltip: `全群平均 CPU ${formatDecimal(avgCpu.value)}% · 平均负载 ${formatDecimal(avgLoad.value)}`,
      }
    case 'uploadSpeed':
      return {
        key: 'uploadSpeed',
        label: '实时上行',
        icon: 'tabler:chevrons-up',
        value: formattedSpeedUp.value.value,
        unit: formattedSpeedUp.value.unit,
      }
    case 'downloadSpeed':
      return {
        key: 'downloadSpeed',
        label: '实时下行',
        icon: 'tabler:chevrons-down',
        value: formattedSpeedDown.value.value,
        unit: formattedSpeedDown.value.unit,
      }
    case 'onlineNodes':
      return {
        key: 'onlineNodes',
        label: '在线节点',
        icon: 'tabler:activity-heartbeat',
        value: formatCount(onlineNodeCount.value),
        unit: `/ ${formatCount(totalNodeCount.value)} · 离线 ${formatCount(offlineCount.value)}`,
      }
    case 'avgCpu':
      return {
        key: 'avgCpu',
        label: '平均 CPU',
        icon: 'tabler:cpu',
        value: formatDecimal(avgCpu.value),
        unit: '%',
      }
    case 'avgGpu':
      return {
        key: 'avgGpu',
        label: '平均 GPU',
        icon: 'tabler:device-desktop-analytics',
        value: avgGpu.value === null ? '-' : formatDecimal(avgGpu.value),
        unit: avgGpu.value === null ? undefined : '%',
        tooltip: formatNodeNames(onlineGpuNodes.value, node => `${node.name}: ${formatDecimal(node.gpu || 0)}%`),
      }
    case 'avgLoad':
      return {
        key: 'avgLoad',
        label: '平均负载',
        icon: 'tabler:chart-line',
        value: formatDecimal(avgLoad.value, 2),
        tooltip: `1m ${formatDecimal(avgLoad.value, 2)}\n5m ${formatDecimal(avgLoad5.value, 2)}\n15m ${formatDecimal(avgLoad15.value, 2)}`,
      }
    case 'swap':
      return {
        key: 'swap',
        label: '交换内存',
        icon: 'icon-park-outline:switch',
        value: formattedSwapUsed.value.value,
        unit: `${formattedSwapUsed.value.unit} / ${formattedSwapTotal.value.value} ${formattedSwapTotal.value.unit}`,
      }
    case 'processes':
      return {
        key: 'processes',
        label: '进程总数',
        icon: 'tabler:list-numbers',
        value: formatCount(totalProcesses.value),
      }
    case 'connections':
      return {
        key: 'connections',
        label: '连接数',
        icon: 'tabler:plug-connected',
        value: formatCount(totalConnectionsTcp.value + totalConnectionsUdp.value),
        tooltip: `TCP ${formatCount(totalConnectionsTcp.value)}\nUDP ${formatCount(totalConnectionsUdp.value)}`,
      }
    case 'cpuCores':
      return {
        key: 'cpuCores',
        label: 'CPU 核心',
        icon: 'tabler:chip',
        value: formatCount(totalCpuCores.value),
        unit: 'Core',
      }
    case 'gpuNodes':
      return {
        key: 'gpuNodes',
        label: 'GPU 节点',
        icon: 'tabler:device-imac',
        value: formatCount(gpuNodes.value.length),
        unit: `/ ${formatCount(totalNodeCount.value)}`,
        tooltip: formatNodeNames(gpuNodes.value, node => `${node.name}: ${node.gpu_name?.trim() || 'GPU'}`),
      }
    case 'gpuPeakNode':
      return {
        key: 'gpuPeakNode',
        label: 'GPU 峰值',
        icon: 'tabler:chart-histogram',
        value: gpuPeakCard.value.value,
        unit: gpuPeakCard.value.unit,
        tooltip: gpuPeakCard.value.tooltip,
      }
    case 'trafficQuota':
      return {
        key: 'trafficQuota',
        label: '流量配额',
        icon: 'tabler:gauge',
        value: trafficQuota.value.limit > 0 ? formatDecimal(trafficQuotaPercentage.value) : '-',
        unit: trafficQuota.value.limit > 0 ? '%' : undefined,
        tooltip: trafficQuota.value.limit > 0
          ? `${formatBytesText(trafficQuota.value.used)} / ${formatBytesText(trafficQuota.value.limit)}`
          : '无限流量',
      }
    case 'trafficPeak':
      return {
        key: 'trafficPeak',
        label: '实时峰值',
        icon: 'tabler:activity',
        value: trafficPeakCard.value.value,
        unit: trafficPeakCard.value.unit,
        tooltip: trafficPeakCard.value.tooltip,
      }
    case 'uploadPeakNode':
      return {
        key: 'uploadPeakNode',
        label: '上行最高',
        icon: 'tabler:arrow-big-up-lines',
        value: uploadPeakCard.value.value,
        unit: uploadPeakCard.value.unit,
        tooltip: uploadPeakCard.value.tooltip,
      }
    case 'downloadPeakNode':
      return {
        key: 'downloadPeakNode',
        label: '下行最高',
        icon: 'tabler:arrow-big-down-lines',
        value: downloadPeakCard.value.value,
        unit: downloadPeakCard.value.unit,
        tooltip: downloadPeakCard.value.tooltip,
      }
    case 'offlineNodes':
      return {
        key: 'offlineNodes',
        label: '离线节点',
        icon: 'tabler:plug-connected-x',
        value: formatCount(offlineNodes.value.length),
        unit: `/ ${formatCount(totalNodeCount.value)}`,
        tooltip: formatNodeNames(offlineNodes.value),
      }
    case 'highLoadNodes':
      return {
        key: 'highLoadNodes',
        label: '高负载节点',
        icon: 'tabler:alert-triangle',
        value: formatCount(highLoadNodes.value.length),
        unit: `/ ${formatCount(onlineNodeCount.value)}`,
        tooltip: formatNodeNames(highLoadNodes.value, (node) => {
          const metrics = getHighLoadMetrics(node, appStore.homeHighLoadThreshold)
          return `${node.name}: ${metrics.map(metric => `${metric.label} ${formatDecimal(metric.percentage)}%`).join(' / ')}`
        }),
      }
    case 'expiringNodes':
      return {
        key: 'expiringNodes',
        label: '即将到期',
        icon: 'tabler:calendar-exclamation',
        value: formatCount(expiringNodes.value.length),
        unit: '台',
        tooltip: formatNodeNames(expiringNodes.value, formatExpiryNode),
      }
    case 'trafficWarnings':
      return {
        key: 'trafficWarnings',
        label: '流量预警',
        icon: 'tabler:traffic-cone',
        value: formatCount(trafficWarningNodes.value.length),
        unit: '台',
        tooltip: formatNodeNames(trafficWarningNodes.value, node => `${node.name}: ${formatDecimal(getTrafficUsedPercentage(node))}%`),
      }
    case 'connectionPeakNode':
      return {
        key: 'connectionPeakNode',
        label: '连接峰值',
        icon: 'tabler:plug-connected',
        value: connectionPeakNode.value ? formatCount(connectionPeakNode.value.value) : '-',
        tooltip: connectionPeakTooltip.value,
      }
    case 'regionDistribution':
      return {
        key: 'regionDistribution',
        label: '地区分布',
        icon: 'tabler:map-pin',
        value: formatCount(regionDistribution.value.length),
        unit: '个',
        tooltip: formatDistributionTooltip(regionDistribution.value),
      }
    case 'systemDistribution':
      return {
        key: 'systemDistribution',
        label: '系统分布',
        icon: 'tabler:device-desktop',
        value: systemDistribution.value[0]?.[0] ?? '-',
        unit: systemDistribution.value[0] ? `${systemDistribution.value[0][1]} 台` : undefined,
        tooltip: formatDistributionTooltip(systemDistribution.value),
      }
    case 'virtualizationDistribution':
      return {
        key: 'virtualizationDistribution',
        label: '虚拟化',
        icon: 'tabler:box-multiple',
        value: virtualizationDistribution.value[0]?.[0] ?? '-',
        unit: virtualizationDistribution.value[0] ? `${virtualizationDistribution.value[0][1]} 台` : undefined,
        tooltip: formatDistributionTooltip(virtualizationDistribution.value),
      }
    case 'monthlyCost':
      return {
        key: 'monthlyCost',
        label: '月费用估算',
        icon: 'tabler:calendar-dollar',
        value: monthlyCostCard.value.value,
        unit: monthlyCostCard.value.unit,
      }
    case 'yearlyCost':
      return {
        key: 'yearlyCost',
        label: '年费用估算',
        icon: 'tabler:receipt-2',
        value: yearlyCostCard.value.value,
        unit: yearlyCostCard.value.unit,
      }
    default:
      return getCardDefinition('memory')
  }
}

const visibleCards = computed(() => appStore.generalCardOrder.map(getCardDefinition))
const shouldRenderHeader = computed(() => visibleCards.value.length > 0)
const wrapperClass = 'p-4 grid grid-cols-1 gap-2 h-auto'
const cardGridClass = 'grid grid-cols-2 md:grid-cols-4 gap-2'
const cardClass = 'group relative z-10 h-full bg-card/75 backdrop-blur-sm md:bg-card md:backdrop-blur-none border-border hover:bg-secondary transition-all'
const cardPositionClasses = [
  'col-span-1',
  'col-span-1',
  'col-span-1',
  'col-span-1',
  'col-span-1',
  'col-span-1',
  'col-span-1',
]
const unitClass = 'text-[11px] md:text-xs font-medium text-muted-foreground truncate'

function getCardPositionClass(index: number): string {
  return cardPositionClasses[index] ?? 'col-span-1'
}

function activateCard(card: GeneralMetricCard) {
  if (card.action === 'financeDetails')
    financeDetailsOpen.value = true
}

function handleCardKeydown(event: KeyboardEvent, card: GeneralMetricCard) {
  if (!card.action || (event.key !== 'Enter' && event.key !== ' '))
    return
  event.preventDefault()
  activateCard(card)
}

function updateFinanceCurrency(currency: CurrencyCode) {
  financeCurrency.value = currency
  financeHelper.setStoredFinanceCurrency(currency)
}

function updateExcludeFreeNodes(exclude: boolean) {
  excludeFreeNodes.value = exclude
  financeHelper.setExcludeFreeNodes(exclude)
}

function updateExchangeRate(currency: CurrencyCode, value: number) {
  financeHelper.setExchangeRateOverride(currency, value)
  exchangeRates.value = { ...exchangeRates.value, [currency]: value, CNY: 1 }
}

function resetExchangeRates() {
  financeHelper.clearExchangeRateOverrides()
  exchangeRates.value = { ...dailyExchangeRates.value }
}

onMounted(() => {
  sampleOverviewMetrics()
  netTimer = window.setInterval(sampleOverviewMetrics, 2000)
})

onMounted(async () => {
  financeCurrency.value = financeHelper.getStoredFinanceCurrency()
  excludeFreeNodes.value = financeHelper.shouldExcludeFreeNodes()

  const { rates, source, updatedAt } = await financeHelper.getDailyExchangeRates()
  dailyExchangeRates.value = rates
  exchangeRates.value = financeHelper.applyExchangeRateOverrides(rates)
  exchangeRateSource.value = source
  exchangeRateUpdatedAt.value = updatedAt
})
onUnmounted(() => {
  if (netTimer !== undefined)
    window.clearInterval(netTimer)
})
</script>

<template>
  <div v-if="shouldRenderHeader" :class="wrapperClass">
    <div v-if="visibleCards.length > 0" :class="cardGridClass">
      <CardX
        v-for="(card, index) in visibleCards"
        :key="card.key"
        :data-general-card-key="card.key"
        hoverable
        class="group" :class="[cardClass, getCardPositionClass(index), card.action && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring']"
        :style="{ height: '112px' }"
        content-class="h-full !p-3 flex flex-col justify-between overflow-hidden group-hover:overflow-visible group-focus-within:overflow-visible"
        :role="card.action ? 'button' : undefined"
        :tabindex="card.action ? 0 : undefined"
        :aria-label="card.action ? `查看${card.label}明细` : undefined"
        @click="activateCard(card)"
        @keydown="handleCardKeydown($event, card)"
      >
        <!-- 悬浮提示的触发区域之前只包住数值这一小行，'top' 方位气泡按数值顶部定位、
             只留 8px 间距上浮——但数值行离上面的图标+标签行本身只有 4px 的 gap，完全不够
             气泡容身，于是气泡直接盖住了标签文字（如"累计流量"四个字被压在气泡下面）。
             现在把 DataTooltip 的触发范围扩大到整个卡片内容（标签+数值+副信息），
             这样气泡就固定悬浮在"整块卡片"的正上方，而不是卡在卡片内部两行之间；
             同时给 CardX 内容容器加 group-hover:overflow-visible，允许气泡在悬停时
             探出卡片边界，悬浮在卡片上方的空白处，不再截断也不再压字。 -->
        <DataTooltip
          as="div"
          placement="top"
          :content="card.tooltip"
          class="relative flex h-full min-w-0 flex-col gap-1"
          content-class="whitespace-pre px-2 py-1 left-0 -translate-x-0 leading-normal"
        >
          <div class="flex items-center gap-1.5">
            <Icon
              :icon="card.icon" :width="14" :height="14"
              class="shrink-0 text-muted-foreground/60"
            />
            <span class="text-xs font-medium tracking-wider text-muted-foreground truncate">{{ card.label }}</span>
          </div>
          <Transition v-bind="metricSwitchTransitionProps">
            <div
              :key="`${card.key}-${summaryTransitionKey}`"
              class="mt-1 flex items-baseline gap-1 min-w-0"
              :style="getMetricSwitchStyle(index)"
            >
              <!-- `sm:text-md` 不是 Tailwind 的合法工具类（应为 text-base），之前一直静默失效——
                   数字字号从手机端的 11px 一路卡到 md 断点才跳到 24px，中间整个 sm~md 区间
                   （640~768px，横屏手机/小平板正好落在这段）字号完全没有变化。
                   另外 11px 对手机上"当前节点在线数/流量"这类首屏关键数字来说也偏小，
                   这里把基准提到 text-base（16px），并补上 sm:text-lg 让断点之间也有过渡。 -->
              <span class="text-base sm:text-lg md:text-2xl font-mono font-bold leading-none tracking-tight truncate">
                {{ card.value }}
              </span>
              <span v-if="card.unit" :class="unitClass">
                {{ card.unit }}
              </span>
            </div>
          </Transition>
          <div v-if="overviewAuxLines[card.key]" class="mt-auto text-[11px] text-muted-foreground">
            {{ overviewAuxLines[card.key] }}
          </div>
          <div v-if="sparkHistoryFor(card.key).length > 1" class="mt-auto h-9 w-full text-muted-foreground" aria-hidden="true">
            <svg viewBox="0 0 100 24" preserveAspectRatio="none" class="h-full w-full">
              <defs>
                <linearGradient :id="`inkSparkGrad-${card.key}`" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="currentColor" stop-opacity="0.08" />
                  <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
                </linearGradient>
              </defs>
              <polygon :points="sparkArea(sparkHistoryFor(card.key))" :fill="`url(#inkSparkGrad-${card.key})`" />
              <polyline :points="sparkPoints(sparkHistoryFor(card.key))" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7" />
            </svg>
          </div>
        </DataTooltip>
      </CardX>
    </div>
  </div>

  <FinanceDetailsDialog
    v-if="financeDetailsOpen"
    v-model:open="financeDetailsOpen"
    :nodes="summaryNodes"
    :rates="exchangeRates"
    :source="exchangeRateSource"
    :rates-updated-at="exchangeRateUpdatedAt"
    :currency="financeCurrency"
    :exclude-free="excludeFreeNodes"
    :now="currentTime"
    @update:currency="updateFinanceCurrency"
    @update:exclude-free="updateExcludeFreeNodes"
    @update:rate="updateExchangeRate"
    @reset-rates="resetExchangeRates"
  />
</template>

<style scoped>
.metric-switch-enter-active,
.metric-switch-leave-active {
  transition:
    opacity 160ms ease,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 180ms ease;
}

.metric-switch-enter-active {
  transition-delay: var(--metric-switch-delay, 0ms);
}

.metric-switch-enter-from {
  opacity: 0;
  transform: translateY(6px);
  filter: blur(3px);
}

.metric-switch-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  filter: blur(2px);
}

@media (prefers-reduced-motion: reduce) {
  .metric-switch-enter-active,
  .metric-switch-leave-active {
    transition: none;
    transition-delay: 0ms;
  }

  .metric-switch-enter-from,
  .metric-switch-leave-to {
    opacity: 1;
    transform: none;
    filter: none;
  }
}
</style>
