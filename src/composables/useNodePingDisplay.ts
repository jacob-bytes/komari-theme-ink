import type { MaybeRefOrGetter } from 'vue'
import { computed, ref, toValue } from 'vue'
import { useNodePingStats } from '@/composables/useNodePingStats'
import { PING_SUMMARY_MAX_COUNT } from '@/constants/load'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'

export type NodePingMetric = 'latency' | 'loss'

export interface NodePingBar {
  key: string
  className: string
  tooltip: string
}

// 「三网」行：按 ping 任务分项展示延迟（如电信/联通/移动各自独立测速），
// 不做跨任务平均。后台可能只配置了 1 个任务，也可能配置了 2、3 个甚至更多——
// UI 侧固定只取前 N_TASK_LATENCY_ITEMS 项，其余的本阶段不处理。
export interface NodePingTaskLatencyItem {
  key: string
  name: string
  valueText: string
  tooltip: string
  lossText: string
  lossTooltip: string
  historyBars: NodePingBar[]
}

const TASK_LATENCY_DISPLAY_LIMIT = 3

interface UseNodePingDisplayOptions {
  enabled?: MaybeRefOrGetter<boolean>
  loadingDisplayText?: string
  emptyDisplayText?: string
  loadingPanelTooltipText?: Partial<Record<NodePingMetric, string>>
  emptyPanelTooltipText?: Partial<Record<NodePingMetric, string>>
}

const EMPTY_PING_BAR_COUNT = 20

function getLatencyToneClass(latency: number): string {
  if (latency <= 60)
    return 'bg-signal-1'
  if (latency <= 100)
    return 'bg-signal-2'
  if (latency <= 160)
    return 'bg-signal-3 ping-signal-pattern-2'
  if (latency <= 200)
    return 'bg-signal-4 ping-signal-pattern-3'
  return 'bg-signal-5 ping-signal-pattern-4'
}

function getLossToneClass(loss: number): string {
  if (loss <= 1)
    return 'bg-signal-1'
  if (loss <= 3)
    return 'bg-signal-2'
  if (loss <= 6)
    return 'bg-signal-3 ping-signal-pattern-2'
  if (loss <= 9)
    return 'bg-signal-4 ping-signal-pattern-3'
  return 'bg-signal-5 ping-signal-pattern-4'
}

// 迷你条只用实心色阶，不带斜纹：h-1 高度下斜纹就是脏点，与延迟/丢包大块的实心观感对齐。
function getLatencySolidClass(latency: number): string {
  if (latency <= 60)
    return 'bg-signal-1'
  if (latency <= 100)
    return 'bg-signal-2'
  if (latency <= 160)
    return 'bg-signal-3'
  if (latency <= 200)
    return 'bg-signal-4'
  return 'bg-signal-5'
}

export function useNodePingDisplay(
  uuid: MaybeRefOrGetter<string>,
  options: UseNodePingDisplayOptions = {},
) {
  const appStore = useAppStore()

  const pingStatsEnabled = computed(() => {
    if (toValue(options.enabled) === false)
      return false
    if (appStore.publicSettings?.record_enabled === false)
      return false
    return appStore.publicSettings?.ping_record_preserve_time !== 0
  })

  const pingStatsHours = computed(() => {
    const preserveTime = appStore.publicSettings?.ping_record_preserve_time
    if (typeof preserveTime === 'number' && preserveTime > 0)
      return Math.min(preserveTime, 1)
    return 1
  })

  const pingStats = useNodePingStats(uuid, {
    hours: pingStatsHours,
    enabled: pingStatsEnabled,
    maxCount: PING_SUMMARY_MAX_COUNT,
  })

  // 自带的唯一一套延迟色块构造：聚合大块和分任务迷你条都走这里，
  // 不另起一套色阶/tooltip，避免两处展示语义分叉。
  function toLatencyHistoryBar(time: string, latency: number | null, key: string): NodePingBar {
    return {
      key,
      className: latency === null ? 'bg-muted-foreground/15' : getLatencyToneClass(latency),
      tooltip: latency === null
        ? `${formatDateTime(time, 'HH:mm:ss')}\n无采样数据`
        : `${formatDateTime(time, 'HH:mm:ss')}\n${Math.round(latency)} ms`,
    }
  }

  function buildPingBars(metric: NodePingMetric): NodePingBar[] {
    const points = pingStats.history.value
    if (!points.length)
      return []

    return points.map((point, index) => {
      if (metric === 'latency')
        return toLatencyHistoryBar(point.time, point.latency, `${point.time}-${index}`)

      const value = point[metric]
      return {
        key: `${point.time}-${index}`,
        className: value === null ? 'bg-muted-foreground/15' : getLossToneClass(value),
        tooltip: value === null
          ? `${formatDateTime(point.time, 'HH:mm:ss')}\n无采样数据`
          : `${formatDateTime(point.time, 'HH:mm:ss')}\n${value.toFixed(1)}%`,
      }
    })
  }

  function buildEmptyPingBars(metric: NodePingMetric): NodePingBar[] {
    const tooltip = pingStats.loading.value
      ? '加载中'
      : pingStats.error.value
        ? '加载失败'
        : !pingStatsEnabled.value
            ? '未启用记录'
            : metric === 'latency'
              ? '无采样数据'
              : '无采样数据'

    return Array.from({ length: EMPTY_PING_BAR_COUNT }, (_, index) => ({
      key: `${metric}-empty-${index}`,
      className: 'bg-muted-foreground/10',
      tooltip,
    }))
  }

  const latencyBars = computed(() => buildPingBars('latency'))
  const lossBars = computed(() => buildPingBars('loss'))
  // 路由跳转/选中切换瞬间 enabled 变 false，会导致节点卡片 ping 数据被清空闪烁。
  // 记忆最后一次有数据的显示，避免降级为占位符（-）。
  const lastLatencyBars = ref<NodePingBar[]>([])
  const lastLossBars = ref<NodePingBar[]>([])
  const lastLatencyText = ref('')
  const lastLossText = ref('')

  const latencyRenderBars = computed(() => {
    if (latencyBars.value.length) {
      lastLatencyBars.value = latencyBars.value
      return latencyBars.value
    }
    if (lastLatencyBars.value.length)
      return lastLatencyBars.value
    return buildEmptyPingBars('latency')
  })
  const lossRenderBars = computed(() => {
    if (lossBars.value.length) {
      lastLossBars.value = lossBars.value
      return lossBars.value
    }
    if (lastLossBars.value.length)
      return lastLossBars.value
    return buildEmptyPingBars('loss')
  })

  const latencyDisplay = computed(() => {
    if (pingStats.hasData.value) {
      const text = `${Math.round(pingStats.avgLatency.value)} ms`
      lastLatencyText.value = text
      return text
    }
    if (lastLatencyText.value)
      return lastLatencyText.value
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const lossDisplay = computed(() => {
    if (pingStats.hasData.value) {
      const text = `${pingStats.avgLoss.value.toFixed(1)}%`
      lastLossText.value = text
      return text
    }
    if (lastLossText.value)
      return lastLossText.value
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const latencyPanelTooltip = computed(() => {
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.latency ?? ''
      return options.emptyPanelTooltipText?.latency ?? ''
    }
    return `平均延迟 ${Math.round(pingStats.avgLatency.value)} ms`
  })

  const lossPanelTooltip = computed(() => {
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.loss ?? ''
      return options.emptyPanelTooltipText?.loss ?? ''
    }

    const volatility = pingStats.avgVolatility.value > 0
      ? `，平均波动 ${pingStats.avgVolatility.value.toFixed(2)}`
      : ''
    return `平均丢包 ${pingStats.avgLoss.value.toFixed(1)}%${volatility}`
  })

  // 只要该节点配置了 ping 任务（不管 1 个、2 个还是 3 个以上），就取前
  // TASK_LATENCY_DISPLAY_LIMIT 项渲染「三网」行；每项自带该任务自己的延迟历史迷你条
  // 和丢包标量，不做跨任务平均。单任务节点这里就是一行，不做数量上的特殊分支。
  const taskLatencyItemsRaw = computed<NodePingTaskLatencyItem[]>(() => {
    return pingStats.taskLatencies.value
      .slice(0, TASK_LATENCY_DISPLAY_LIMIT)
      .map((task) => {
        const valueText = task.latency === null ? '--' : `${Math.round(task.latency)}ms`
        const label = task.name?.trim() || `任务 ${task.taskId}`
        const lossText = task.loss === null || task.loss === undefined ? '--' : `${task.loss.toFixed(1)}%`
        const historyBars: NodePingBar[] = (task.history ?? []).map((point, index) => ({
          key: `${task.taskId}-${point.time}-${index}`,
          className: point.latency === null ? 'bg-muted-foreground/15' : getLatencySolidClass(point.latency),
          tooltip: point.latency === null
            ? `${formatDateTime(point.time, 'HH:mm:ss')}\n无采样数据`
            : `${formatDateTime(point.time, 'HH:mm:ss')}\n${Math.round(point.latency)} ms`,
        }))
        return {
          key: task.taskId,
          name: label,
          valueText,
          tooltip: `${label} ${valueText} · 丢包 ${lossText}`,
          lossText,
          lossTooltip: `${label} 丢包 ${lossText}`,
          historyBars,
        }
      })
  })
  // 与 lastLatencyBars 同理：enabled 短暂变 false（如路由切换）时不应该让这一行闪烁消失。
  const lastTaskLatencyItems = ref<NodePingTaskLatencyItem[]>([])
  const taskLatencyItems = computed(() => {
    if (taskLatencyItemsRaw.value.length) {
      lastTaskLatencyItems.value = taskLatencyItemsRaw.value
      return taskLatencyItemsRaw.value
    }
    return lastTaskLatencyItems.value
  })
  const hasTaskLatencyItems = computed(() => taskLatencyItems.value.length > 0)

  return {
    pingStats,
    pingStatsEnabled,
    pingStatsHours,
    latencyRenderBars,
    lossRenderBars,
    latencyDisplay,
    lossDisplay,
    latencyPanelTooltip,
    lossPanelTooltip,
    taskLatencyItems,
    hasTaskLatencyItems,
  }
}
