<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const hasCustomBackground = computed(() => appStore.backgroundEnabled && Boolean(appStore.currentBackgroundUrl))
</script>

<template>
  <div
    class="loading-cover inset-0 fixed z-20 overflow-x-hidden"
    :class="hasCustomBackground ? 'loading-cover--custom-background' : ''"
  >
    <!-- 骨架屏：模拟页面结构（顶栏 / 概览区 / 节点卡网格），取代全屏灰色阻塞 -->
    <div class="max-w-[1280px] mx-auto px-4 pt-4 flex flex-col gap-4">
      <div class="skeleton h-10 rounded-md" />
      <div class="skeleton h-8 rounded-md w-2/3 max-sm:w-full" />

      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div v-for="i in 6" :key="`ov-${i}`" class="skeleton h-16 md:h-20 rounded-md" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div v-for="i in 4" :key="`card-${i}`" class="skeleton h-56 md:h-64 rounded-md" />
      </div>

      <div class="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
        <span
          class="inline-block animate-spin rounded-full border-2 size-4"
          style="border-color: color-mix(in srgb, currentColor 18%, transparent); border-top-color: currentColor;"
        />
        加载中…
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 渐变加载层：保留极淡底灰以区分状态，但不再整屏不透明遮盖布局 */
.loading-cover {
  background: color-mix(in srgb, var(--background) 42%, transparent);
}

:root:not(.dark):not(.legacy-webkit) .loading-cover {
  background: color-mix(in srgb, var(--background) 42%, transparent);
}

.loading-cover--custom-background {
  background: rgb(15 23 42 / 0.08);
}

:root:not(.dark) .loading-cover--custom-background {
  background: rgb(15 23 42 / 0.1);
}

.skeleton {
  background: linear-gradient(90deg, var(--secondary) 25%, var(--muted) 37%, var(--secondary) 63%);
  background-size: 400% 100%;
  animation: skeleton-loading 1.4s ease infinite;
}

@keyframes skeleton-loading {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
</style>
