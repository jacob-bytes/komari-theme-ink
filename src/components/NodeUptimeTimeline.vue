<script setup lang="ts">
import type { StatusRecord } from '@/utils/rpc'
import type { UptimeDayBucket } from '@/utils/uptimeHistory'
import { Icon } from '@iconify/vue'
import dayjs from 'dayjs'
import { computed, ref, shallowRef, watch } from 'vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { LOAD_RECORD_MAX_COUNT } from '@/constants/load'
import { loadNodeLoadRecords } from '@/services/history.service'
import { useAppStore } from '@/stores/app'
import { buildUptimeDayBuckets, estimateCoverableDays, UPTIME_STATUS_LABEL } from '@/utils/uptimeHistory'

const props = defineProps<{
  uuid: string
  online?: boolean
}>()

const appStore = useAppStore()

// 时间轴请求覆盖天数（上限）：不超过后台配置的记录保留时长（record_preserve_time，单位小时），
// 且保守封顶 14 天。注意这只是「向后端请求的窗口」，实际渲染多少天由下方 effectiveDays
// 按真实上报密度重新估算决定——请求 14 天不代表这 14 天都能拿到足够密集的样本。
const timelineDays = computed(() => {
  const preserveHours = appStore.publicSettings?.record_preserve_time || 720
  return Math.max(1, Math.min(14, Math.floor(preserveHours / 24)))
})
const historyHours = computed(() => timelineDays.value * 24)

// 直接按节点拉取历史记录，而不是复用 LoadChart/useNodeLoadStats 那套「全站所有节点共享同一份、
// 总量固定上限」的缓存：那套机制是为同时渲染多张卡片的短窗口场景做的优化，同一份 6000 条上限要
// 在全站节点之间分摊，会让每个节点分到的真实样本更少。按节点单独请求（loadNodeLoadRecords）
// 至少能让每个节点拿到自己独立的 6000 条配额，但即便如此，只要节点上报间隔较短（比如 30 秒/条），
// 独立的 6000 条配额依然可能撑不满 7~14 天的请求窗口——这时后端只会返回窗口内最新的一段记录，
// 更早的日期并非节点真的没有历史，而是没有拿到样本。这也是为什么只按节点拆分请求还不够，
// 必须再配合下方 effectiveDays 按真实上报密度收窄实际渲染的天数。
const records = shallowRef<StatusRecord[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const hasData = computed(() => records.value.length > 0)

let fetchSequence = 0

async function fetchUptimeRecords() {
  const sequence = ++fetchSequence
  const requestedUuid = props.uuid
  const requestedHours = historyHours.value
  if (!requestedUuid) {
    records.value = []
    return
  }

  loading.value = true
  error.value = null

  try {
    const result = await loadNodeLoadRecords(requestedUuid, requestedHours, LOAD_RECORD_MAX_COUNT)
    if (sequence !== fetchSequence)
      return
    records.value = result
  }
  catch (err) {
    if (sequence !== fetchSequence)
      return
    error.value = err instanceof Error ? err.message : '获取历史记录失败'
    records.value = []
  }
  finally {
    if (sequence === fetchSequence)
      loading.value = false
  }
}

watch(
  () => [props.uuid, historyHours.value] as const,
  () => {
    void fetchUptimeRecords()
  },
  { immediate: true },
)

// 真实可信天数：按拿到的记录反推的上报间隔，估算 maxRecordCount 这批记录理论上能撑起多少天的
// 密集覆盖。上报越频繁的节点，可信窗口越短，避免把「压根没请求到的早期日期」误判成灰色无数据，
// 这也是不同节点时间轴外观应当出现差异的关键——不再被统一截断成同一种形状。
const effectiveDays = computed(() => estimateCoverableDays(records.value, LOAD_RECORD_MAX_COUNT, timelineDays.value))
const isCoverageTruncated = computed(() => hasData.value && effectiveDays.value < timelineDays.value)

const buckets = computed<UptimeDayBucket[]>(() => buildUptimeDayBuckets(records.value, effectiveDays.value))

const STATUS_DOT_CLASS: Record<UptimeDayBucket['status'], string> = {
  'ok': 'bg-[var(--status-ok)]',
  'degraded': 'bg-[var(--status-warn)]',
  'down': 'bg-[var(--status-alert)]',
  'no-data': 'bg-muted-foreground/15',
}

function bucketTooltip(bucket: UptimeDayBucket): string {
  const dateLabel = dayjs(bucket.date).format('YYYY年M月D日')
  const statusLabel = UPTIME_STATUS_LABEL[bucket.status]
  if (bucket.status === 'no-data')
    return `${dateLabel}\n${statusLabel}`
  return `${dateLabel}\n${statusLabel} · 上报 ${bucket.sampleCount}/${bucket.expectedCount} 次`
}

// 统计范围内的估算可用率：忽略无数据的天，避免节点刚上线时被拉低
const summaryRatio = computed(() => {
  const relevant = buckets.value.filter(b => b.status !== 'no-data')
  if (!relevant.length)
    return null
  const okCount = relevant.filter(b => b.status === 'ok').length
  return okCount / relevant.length
})
</script>

<template>
  <div class="px-4">
    <div class="rounded-xl border border-border bg-muted/40 p-3.5">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground">
          <Icon icon="tabler:calendar-stats" width="13" height="13" />
          在线状态时间轴
          <DataTooltip
            placement="top"
            content="按每日上报密度估算的近似口径，非精确 SLA 可用率"
            content-class="w-max max-w-64 whitespace-pre-line text-left leading-relaxed"
          >
            <Icon icon="tabler:info-circle" width="12" height="12" class="text-muted-foreground/60" />
          </DataTooltip>
        </div>
        <span v-if="summaryRatio !== null" class="font-mono text-[11px] text-muted-foreground">
          近 {{ effectiveDays }} 天估算正常率 {{ (summaryRatio * 100).toFixed(1) }}%
        </span>
      </div>

      <div v-if="isCoverageTruncated" class="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/70">
        <Icon icon="tabler:alert-triangle" width="11" height="11" class="shrink-0" />
        该节点上报较频繁，受历史记录采样上限限制，仅能可靠展示近 {{ effectiveDays }} 天（早于此的日期未展示，不代表节点异常）
      </div>

      <div v-if="error" class="mt-3 text-xs text-[var(--status-alert)]">
        {{ error }}
      </div>
      <div v-else-if="loading && !hasData" class="mt-3 flex h-8 items-center gap-1.5 text-xs text-muted-foreground">
        <Icon icon="tabler:loader-2" width="14" height="14" class="animate-spin" />
        加载历史记录…
      </div>
      <template v-else>
        <div class="mt-3 flex gap-[3px]">
          <DataTooltip
            v-for="bucket in buckets"
            :key="bucket.date"
            placement="top"
            :content="bucketTooltip(bucket)"
            class="flex-1"
            content-class="w-max max-w-56 whitespace-pre-line text-left leading-relaxed"
          >
            <span
              class="block h-6 min-w-[3px] rounded-[2px] transition-transform hover:scale-y-110"
              :class="[
                STATUS_DOT_CLASS[bucket.status],
                bucket.status === 'no-data' ? 'cursor-help' : 'cursor-pointer',
              ]"
            />
          </DataTooltip>
        </div>
        <div class="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{{ dayjs(buckets[0]?.date).format('M月D日') }}</span>
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1"><span class="size-1.5 rounded-full bg-[var(--status-ok)]" />正常</span>
            <span class="flex items-center gap-1"><span class="size-1.5 rounded-full bg-[var(--status-warn)]" />部分异常</span>
            <span class="flex items-center gap-1"><span class="size-1.5 rounded-full bg-[var(--status-alert)]" />离线</span>
            <span class="flex items-center gap-1"><span class="size-1.5 rounded-full bg-muted-foreground/15" />无数据</span>
          </div>
          <span>今天</span>
        </div>
      </template>
    </div>
  </div>
</template>
