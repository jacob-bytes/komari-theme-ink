<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed, ref } from 'vue'
import { cn } from '@/lib/utils'

type DataTooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

interface Props {
  /** 提示文本，留空且无 #content 插槽时不渲染气泡 */
  content?: string
  /** 气泡相对触发元素的方位 */
  placement?: DataTooltipPlacement
  /** 气泡宽度，number 视为 px；默认由内容撑起 */
  width?: number | string
  /** 气泡高度，number 视为 px；默认由内容撑起 */
  height?: number | string
  /** 包裹元素标签，默认 div */
  as?: string
  /** 包裹元素的附加类 */
  class?: HTMLAttributes['class']
  /** 气泡的附加类 */
  contentClass?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  placement: 'top',
  as: 'div',
})

// 只保留基础方位偏移（贴边 + 间距），水平/垂直居中改由下方 --dt-shift-x / --dt-shift-y
// 叠加到 transform 上实现，这样默认居中效果不变，只在越界时才产生纠偏。
const placementClass: Record<DataTooltipPlacement, string> = {
  top: 'bottom-full left-1/2 mb-2',
  bottom: 'top-full left-1/2 mt-2',
  left: 'top-1/2 right-full mr-2',
  right: 'top-1/2 left-full ml-2',
}

// top/bottom 默认水平居中于触发元素，越界时沿 X 轴纠偏；left/right 默认垂直居中，越界时沿 Y 轴纠偏。
const transform = computed(() => {
  if (props.placement === 'top' || props.placement === 'bottom')
    return 'translateX(calc(-50% + var(--dt-shift-x, 0px)))'
  return 'translateY(calc(-50% + var(--dt-shift-y, 0px)))'
})

const sizeStyle = computed(() => {
  const style: Record<string, string> = { transform: transform.value }
  if (props.width != null)
    style.width = typeof props.width === 'number' ? `${props.width}px` : props.width
  if (props.height != null)
    style.height = typeof props.height === 'number' ? `${props.height}px` : props.height
  return style
})

const rootRef = ref<HTMLElement | null>(null)
const bubbleRef = ref<HTMLElement | null>(null)

// 视口边缘防裁切：气泡默认以居中方式渲染在触发元素旁，靠近视口边缘时会整块超出可视区域被裁掉。
// 气泡本身用 visibility（而不是 display:none）隐藏，所以任何时候都能拿到真实尺寸；
// 每次即将显示（hover/focus 进入）时重新测量一次，把超出视口的部分通过 CSS 变量纠偏拉回来。
function updatePosition() {
  const trigger = rootRef.value
  const bubble = bubbleRef.value
  if (!trigger || !bubble)
    return

  const margin = 8
  const triggerRect = trigger.getBoundingClientRect()
  const bubbleRect = bubble.getBoundingClientRect()

  if (props.placement === 'top' || props.placement === 'bottom') {
    const desiredLeft = triggerRect.left + triggerRect.width / 2 - bubbleRect.width / 2
    const minLeft = margin
    const maxLeft = Math.max(minLeft, window.innerWidth - margin - bubbleRect.width)
    const clampedLeft = Math.min(Math.max(desiredLeft, minLeft), maxLeft)
    bubble.style.setProperty('--dt-shift-x', `${clampedLeft - desiredLeft}px`)
  }
  else {
    const desiredTop = triggerRect.top + triggerRect.height / 2 - bubbleRect.height / 2
    const minTop = margin
    const maxTop = Math.max(minTop, window.innerHeight - margin - bubbleRect.height)
    const clampedTop = Math.min(Math.max(desiredTop, minTop), maxTop)
    bubble.style.setProperty('--dt-shift-y', `${clampedTop - desiredTop}px`)
  }
}
</script>

<template>
  <component
    :is="as"
    ref="rootRef"
    data-slot="data-tooltip"
    :class="cn('group/data-tooltip relative inline-block', props.class)"
    @mouseenter="updatePosition"
    @focusin="updatePosition"
  >
    <slot />
    <span
      v-if="content || $slots.content"
      ref="bubbleRef"
      role="tooltip"
      :class="cn(
        'pointer-events-none absolute z-20 invisible opacity-0 transition-opacity duration-100 rounded bg-foreground/80 p-1 text-[10px] leading-none text-background shadow-lg group-hover/data-tooltip:visible group-hover/data-tooltip:opacity-100 group-focus-within/data-tooltip:visible group-focus-within/data-tooltip:opacity-100 whitespace-normal break-words',
        placementClass[placement],
        props.contentClass,
      )"
      :style="sizeStyle"
    >
      <slot name="content">{{ content }}</slot>
    </span>
  </component>
</template>
