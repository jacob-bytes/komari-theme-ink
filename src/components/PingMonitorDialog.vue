<script setup lang="ts">
import { AppDialog } from '@/components/ui/app-dialog'
import { createLazyPanel } from '@/utils/lazyPanel'

defineProps<{
  open: boolean
  uuid: string
  nodeName: string
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const PingChart = createLazyPanel(() => import('@/components/PingChart.vue'))
</script>

<template>
  <AppDialog
    :open="open"
    :title="`${nodeName} 延迟 / 丢包`"
    description="探测任务延迟、丢包率与波动统计"
    content-class="max-w-6xl"
    @update:open="emit('update:open', $event)"
  >
    <PingChart v-if="open && uuid" :uuid="uuid" />
  </AppDialog>
</template>
