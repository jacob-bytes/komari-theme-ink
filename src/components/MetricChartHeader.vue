<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'

type MetricChartTone = 'rose' | 'amber' | 'emerald' | 'cyan' | 'sky' | 'violet' | 'orange' | 'slate'

const props = withDefaults(defineProps<{
  title: string
  icon: string
  tone?: MetricChartTone
  subtitle?: string
}>(), {
  tone: 'slate',
  subtitle: '',
})

// 与全局单一品牌色（--primary，OKLCH 色相 258）同一明度/彩度家族的色相偏移，
// 让每张指标卡的图标徽章拥有可辨识的身份色，同时不引入互不相关的第 4/5 种品牌色。
const TONE_HUE: Record<MetricChartTone, number> = {
  rose: 12,
  orange: 45,
  amber: 70,
  emerald: 154,
  cyan: 195,
  sky: 230,
  violet: 300,
  slate: 258,
}

const toneStyle = computed(() => {
  const hue = TONE_HUE[props.tone]
  return {
    color: `oklch(0.52 0.15 ${hue})`,
    backgroundColor: `oklch(0.52 0.15 ${hue} / 0.12)`,
  }
})
</script>

<template>
  <div class="flex min-w-0 items-center justify-between gap-3">
    <div class="flex min-w-0 items-center gap-2.5">
      <div class="flex size-8 shrink-0 items-center justify-center rounded-md" :style="toneStyle">
        <Icon :icon="icon" :width="17" :height="17" />
      </div>
      <div class="min-w-0">
        <div class="truncate text-sm font-semibold sm:text-base">
          {{ title }}
        </div>
        <div v-if="subtitle" class="truncate text-[10px] leading-4 text-muted-foreground" :title="subtitle">
          {{ subtitle }}
        </div>
      </div>
    </div>
    <div class="min-w-0 shrink-0 text-right text-xs text-muted-foreground">
      <slot />
    </div>
  </div>
</template>
