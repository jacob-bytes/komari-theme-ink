<script lang="ts">
// 移动端触摸没有 hover/mouseleave 概念，改用「点击展开/再点收起」模式。
// 用模块级变量（跨所有 DataTooltip 实例共享）确保同一时刻最多一个气泡在展开——
// 打开新气泡前先收起上一个仍开着的气泡，避免多个气泡叠加、彼此都消不掉。
</script>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<Props>(), {
  placement: 'top',
  as: 'div',
})

let closeActiveTouchTooltip: (() => void) | null = null

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

const GAP = 8 // 气泡与触发元素之间的间距
const MARGIN = 8 // 气泡与视口边缘之间至少保留的间距

const rootRef = ref<HTMLElement | null>(null)
const bubbleRef = ref<HTMLElement | null>(null)
const visible = ref(false)
const top = ref(-9999)
const left = ref(-9999)
/** 记录最近一次交互的指针类型，用来区分「真实鼠标 hover」和「触摸 tap」，两者走不同的展示/收起逻辑 */
const lastPointerType = ref<string>('mouse')
/** 点击外部时用于关闭气泡的监听器引用，仅在触摸 tap 打开气泡期间存在 */
let outsideCloseHandler: ((event: Event) => void) | null = null

/**
 * 彻底解决 tooltip 被遮罩/跑位的问题：
 *
 * 之前的实现用 `position: absolute` 挂在触发元素自身的包裹层下，靠 CSS transform 做「越界纠偏」。
 * 这带来两个真实问题：
 * 1）只要祖先元素上有 `overflow-hidden`（卡片、进度条容器等到处都有），越界的那部分气泡会被直接切掉——
 *    这正是最初「延迟数值靠边时提示看不全」的根因；
 * 2）纠偏是「从期望居中位置量到视口边缘」的位移，在较窄的卡片网格里这个位移量可能很大，
 *    于是气泡被硬拽到离触发元素很远的地方，反而盖住了别的正文内容（如「三网」气泡盖住了上一行的
 *    「剩余天数/价格」文字）——遮罩问题从「自己被裁」变成了「别人被盖」，本质没解决。
 *
 * 现在改为业界标准的浮层做法：
 * - 用 `<Teleport to="body">` 把气泡挂到 body 下，彻底脱离任何祖先的 overflow/层叠上下文，
 *   不会再被任何卡片、进度条容器裁切；
 * - 用 `position: fixed` + hover/focus 时通过 `getBoundingClientRect()` 实测触发元素和气泡的
 *   真实尺寸，直接计算「贴着触发元素、只留 8px 间距」的精确坐标，而不是「先居中再算跑多远纠偏」，
 *   这样气泡永远紧贴被悬停的数值本身，不会跳到很远的位置；
 * - 若期望方向（如 top）在视口内放不下，自动翻转到对侧（bottom），翻转后再做最终的视口边缘夹紧兜底。
 */
function measureAndPosition() {
  const trigger = rootRef.value
  const bubble = bubbleRef.value
  if (!trigger || !bubble)
    return

  const triggerRect = trigger.getBoundingClientRect()
  const bubbleRect = bubble.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  let placement = props.placement
  if (placement === 'top' && triggerRect.top - bubbleRect.height - GAP < MARGIN)
    placement = 'bottom'
  else if (placement === 'bottom' && triggerRect.bottom + bubbleRect.height + GAP > vh - MARGIN)
    placement = 'top'
  else if (placement === 'left' && triggerRect.left - bubbleRect.width - GAP < MARGIN)
    placement = 'right'
  else if (placement === 'right' && triggerRect.right + bubbleRect.width + GAP > vw - MARGIN)
    placement = 'left'

  let nextTop: number
  let nextLeft: number

  if (placement === 'top' || placement === 'bottom') {
    nextTop = placement === 'top'
      ? triggerRect.top - bubbleRect.height - GAP
      : triggerRect.bottom + GAP
    nextLeft = triggerRect.left + triggerRect.width / 2 - bubbleRect.width / 2
  }
  else {
    nextLeft = placement === 'left'
      ? triggerRect.left - bubbleRect.width - GAP
      : triggerRect.right + GAP
    nextTop = triggerRect.top + triggerRect.height / 2 - bubbleRect.height / 2
  }

  // 兜底夹紧：即便翻转后气泡本身仍可能过大而越界，最后再拉回视口内，避免裁切
  nextLeft = Math.min(Math.max(nextLeft, MARGIN), Math.max(MARGIN, vw - MARGIN - bubbleRect.width))
  nextTop = Math.min(Math.max(nextTop, MARGIN), Math.max(MARGIN, vh - MARGIN - bubbleRect.height))

  left.value = nextLeft
  top.value = nextTop
}

function handleEnter() {
  // 气泡默认 visibility:hidden（保留布局，可测量真实尺寸），先测量再显示，不会有位置跳动的闪烁
  measureAndPosition()
  visible.value = true
  window.addEventListener('scroll', measureAndPosition, true)
  window.addEventListener('resize', measureAndPosition)
}

function handleLeave() {
  visible.value = false
  window.removeEventListener('scroll', measureAndPosition, true)
  window.removeEventListener('resize', measureAndPosition)
}

function handlePointerDown(event: PointerEvent) {
  lastPointerType.value = event.pointerType
}

/**
 * 真实鼠标（含触控笔悬浮）才走 hover 展示；触摸的 pointerenter/leave 直接忽略，
 * 交给下面的 handleClick 走「tap 展开 / 再 tap 收起」的独立逻辑——
 * 触摸设备根本不会有真正的 pointerleave，靠 mouseleave/pointerleave 兜底只会导致气泡永久卡住。
 */
function handlePointerEnter(event: PointerEvent) {
  if (event.pointerType === 'touch')
    return
  handleEnter()
}

function handlePointerLeave(event: PointerEvent) {
  if (event.pointerType === 'touch')
    return
  handleLeave()
}

function detachOutsideClose() {
  if (!outsideCloseHandler)
    return
  document.removeEventListener('touchstart', outsideCloseHandler, true)
  document.removeEventListener('click', outsideCloseHandler, true)
  outsideCloseHandler = null
}

function closeTouchTooltip() {
  handleLeave()
  detachOutsideClose()
  if (closeActiveTouchTooltip === closeTouchTooltip)
    closeActiveTouchTooltip = null
}

function handleTouchTap() {
  // 已经展开：再次点击自己 = 收起
  if (visible.value) {
    closeTouchTooltip()
    return
  }
  // 打开新气泡前，先收起可能还开着的上一个（同一时刻只允许一个气泡展开，避免叠加）
  closeActiveTouchTooltip?.()
  handleEnter()
  closeActiveTouchTooltip = closeTouchTooltip
  outsideCloseHandler = (event: Event) => {
    if (rootRef.value?.contains(event.target as Node))
      return
    closeTouchTooltip()
  }
  // 延后一帧再绑定，避免触发气泡展开的这次点击本身被「点在外部」判定为需要立即关闭
  requestAnimationFrame(() => {
    if (!outsideCloseHandler)
      return
    document.addEventListener('touchstart', outsideCloseHandler, true)
    document.addEventListener('click', outsideCloseHandler, true)
  })
}

function handleClick() {
  if (lastPointerType.value === 'touch')
    handleTouchTap()
}

onBeforeUnmount(() => {
  window.removeEventListener('scroll', measureAndPosition, true)
  window.removeEventListener('resize', measureAndPosition)
  detachOutsideClose()
  if (closeActiveTouchTooltip === closeTouchTooltip)
    closeActiveTouchTooltip = null
})

const sizeStyle = computed(() => {
  const style: Record<string, string> = {
    top: `${top.value}px`,
    left: `${left.value}px`,
  }
  if (props.width != null)
    style.width = typeof props.width === 'number' ? `${props.width}px` : props.width
  if (props.height != null)
    style.height = typeof props.height === 'number' ? `${props.height}px` : props.height
  return style
})
</script>

<template>
  <component
    :is="as"
    ref="rootRef"
    data-slot="data-tooltip"
    :class="cn('relative inline-block', props.class)"
    @pointerdown="handlePointerDown"
    @pointerenter="handlePointerEnter"
    @pointerleave="handlePointerLeave"
    @click="handleClick"
    @focusin="handleEnter"
    @focusout="handleLeave"
  >
    <slot />
    <Teleport v-if="content || $slots.content" to="body">
      <span
        ref="bubbleRef"
        role="tooltip"
        :class="cn(
          'pointer-events-none fixed z-[100] rounded bg-foreground/80 p-1 text-[10px] leading-none text-background shadow-lg transition-opacity duration-100 whitespace-normal break-words',
          visible ? 'visible opacity-100' : 'invisible opacity-0',
          props.contentClass,
        )"
        :style="sizeStyle"
      >
        <slot name="content">{{ content }}</slot>
      </span>
    </Teleport>
  </component>
</template>
