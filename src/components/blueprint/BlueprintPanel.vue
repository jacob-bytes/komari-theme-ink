<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { computed } from 'vue'
import BlueprintSheet from './BlueprintSheet.vue'
import { mapNodes } from './mapper'

const props = defineProps<{ nodes: NodeData[] }>()

const data = computed(() => mapNodes(props.nodes))
</script>

<template>
  <BlueprintSheet :data="data" />
</template>
