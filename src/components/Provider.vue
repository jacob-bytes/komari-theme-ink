<script setup lang="ts">
import { provide, ref, watch } from 'vue'
import { BackTop } from '@/components/ui/back-top'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const isScrolled = ref(false)
provide('isScrolled', isScrolled)

watch(
  () => appStore.isDark,
  (dark) => {
    const root = document.documentElement
    if (dark)
      root.classList.add('dark')
    else root.classList.remove('dark')
    root.style.colorScheme = dark ? 'dark' : 'light'
  },
  { immediate: true },
)

watch(
  () => appStore.colorVisionFriendly,
  (enabled) => {
    document.documentElement.classList.toggle('color-vision-friendly', enabled)
  },
  { immediate: true },
)
</script>

<template>
  <slot />
  <BackTop :visibility-height="320" @scrolled="isScrolled = $event" />
</template>
