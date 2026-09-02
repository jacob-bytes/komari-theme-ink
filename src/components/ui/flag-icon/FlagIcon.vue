<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { ref, watch } from 'vue'
import { getFlagSrc, getRegionAltText } from '@/utils/regionHelper'

/**
 * 国旗图标：统一封装国旗 <img> 及其加载失败兜底。
 *
 * 地区代码与 public/images/flags/ 下的 svg 资源理论上应该一一对应，但当
 * region 字段是未收录的别名/代码，或图片资源缺失时，直接渲染 <img> 会
 * 展示浏览器默认的裂图图标——这里改为捕获 error 事件后回退到一个通用的
 * 旗帜轮廓图标，保持视觉整洁，不出现破图。
 */
const props = defineProps<{
  /** 地区字段原始值（可能是 emoji、别名或代码） */
  region: string
}>()

const failed = ref(false)

// 切换节点/地区后重置失败状态，避免继续显示上一个地区的失败态
watch(() => props.region, () => {
  failed.value = false
})
</script>

<template>
  <img
    v-if="!failed"
    loading="lazy"
    :src="getFlagSrc(region)"
    :alt="getRegionAltText(region)"
    @error="failed = true"
  >
  <Icon
    v-else
    icon="tabler:flag-off"
    :aria-label="getRegionAltText(region)"
    class="text-muted-foreground/60"
  />
</template>
