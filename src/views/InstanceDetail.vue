<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { Empty } from '@/components/ui/empty'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNodeProviderMetadata } from '@/composables/useNodeProviderMetadata'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesWithConfig, formatUptimeWithFormat } from '@/utils/helper'
import { getRegionCode } from '@/utils/regionHelper'

import { formatPrice, formatPriceWithCycle, getExpireText, parseTags } from '@/utils/tagHelper'

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

const trafficUsed = computed(() => {
  const node = data.value
  if (!node)
    return 0
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = node
  switch (traffic_limit_type) {
    case 'up': return net_total_up
    case 'down': return net_total_down
    case 'min': return Math.min(net_total_up, net_total_down)
    case 'max': return Math.max(net_total_up, net_total_down)
    case 'sum':
    default: return net_total_up + net_total_down
  }
})

const hasTrafficLimit = computed(() => (data.value?.traffic_limit ?? 0) > 0)

const detailSummaryFields = computed(() => {
  const node = data.value
  if (!node)
    return []

  return [
    {
      label: '系统',
      value: [node.os, node.arch].filter(Boolean).join(' · '),
    },
    {
      label: 'CPU',
      value: `${node.cpu_name} (${node.cpu_cores} vCPU)`,
    },
    {
      label: '内存 / 硬盘',
      value: `${formatBytes(node.ram)} / ${formatBytes(node.mem_total)}`,
      sub: `硬盘 ${formatBytes(node.disk)} / ${formatBytes(node.disk_total)}`,
    },
    {
      label: '流量',
      value: '',
      upValue: formatBytes(node.net_total_up),
      downValue: formatBytes(node.net_total_down),
      sub: hasTrafficLimit.value
        ? `已用 ${formatBytes(trafficUsed.value)} / ${formatBytes(node.traffic_limit)}`
        : '无限流量',
    },
    {
      label: '续费',
      value: showPrice.value ? nodePriceText.value : '***',
      sub: remainingTimeText.value,
    },
  ]
})
</script>

<template>
  <div class="instance-detail space-y-4">
    <div v-if="!data" class="p-4">
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
          <span class="truncate">{{ data.name }}</span>
          <span v-if="hasRegion(data.region)" class="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-mono text-[#6b7280] dark:bg-slate-800/70 dark:text-slate-400">{{ getRegionCode(data.region) }}</span>
          <span class="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
            <span v-if="data.online" class="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)] animate-pulse" />
            {{ data.online ? `在线 ${formatUptime(data.uptime)}` : '离线' }}
          </span>
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
            :title="isFavoriteNode ? '取消收藏' : '收藏节点'"
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

      <!-- 紧凑详情摘要 -->
      <div class="px-4">
        <div
          data-detail-summary
          class="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 md:grid-cols-3 xl:grid-cols-5 dark:border-slate-800/60 dark:bg-slate-900/50"
        >
          <div v-for="field in detailSummaryFields" :key="field.label" class="min-w-0">
            <div class="text-[11px] font-medium tracking-wider text-muted-foreground">
              {{ field.label }}
            </div>
            <div class="mt-1 max-w-full truncate font-mono text-sm font-semibold text-foreground">
              <template v-if="field.upValue">
                <span class="text-indigo-500">↑ {{ field.upValue }}</span>
                <span class="text-muted-foreground"> · </span>
                <span class="text-emerald-500">↓ {{ field.downValue }}</span>
              </template>
              <template v-else>
                {{ field.value }}
              </template>
            </div>
            <div v-if="field.sub" class="mt-0.5 truncate text-xs text-muted-foreground">
              {{ field.sub }}
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
