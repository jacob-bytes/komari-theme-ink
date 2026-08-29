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

const toneClass = computed(() => ({
  rose: 'text-muted-foreground',
  amber: 'text-muted-foreground',
  emerald: 'text-muted-foreground',
  cyan: 'text-muted-foreground',
  sky: 'text-muted-foreground',
  violet: 'text-muted-foreground',
  orange: 'text-muted-foreground',
  slate: 'text-muted-foreground',
})[props.tone])
</script>

<template>
  <div class="flex min-w-0 items-center justify-between gap-3">
    <div class="flex min-w-0 items-center gap-2.5">
      <div class="flex size-8 shrink-0 items-center justify-center rounded-md ring-0" :class="toneClass">
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
