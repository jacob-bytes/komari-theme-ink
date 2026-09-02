<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Icon } from '@iconify/vue'
import { cn } from '@/lib/utils'

interface Props {
  description?: string
  class?: HTMLAttributes['class']
  /** Tabler 图标名，按场景传入更贴切的图标（如搜索无结果传 tabler:search-off） */
  icon?: string
}

const props = defineProps<Props>()
</script>

<template>
  <div
    :class="cn(
      'empty-state-enter flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground',
      props.class,
    )"
  >
    <span class="empty-state-icon flex items-center justify-center text-muted-foreground/60">
      <slot name="icon">
        <Icon v-if="icon" :icon="icon" width="56" height="56" />
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          width="56"
          height="56"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect width="18" height="14" x="3" y="3" rx="2" />
          <path d="M3 14h18M8 18h.01M12 18h.01M16 18h.01" />
        </svg>
      </slot>
    </span>
    <slot>
      <span class="text-sm">{{ description ?? '暂无数据' }}</span>
    </slot>
    <slot name="extra" />
  </div>
</template>

<style scoped>
.empty-state-enter {
  animation: empty-state-fade-in 0.35s ease-out both;
}

.empty-state-icon {
  animation: empty-state-float 3.2s ease-in-out 0.35s infinite;
}

@keyframes empty-state-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes empty-state-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .empty-state-enter,
  .empty-state-icon {
    animation: none;
  }
}
</style>
