import type { MaybeRefOrGetter } from 'vue'
import { useVirtualList } from '@vueuse/core'
import { computed, toValue } from 'vue'

export interface UseVirtualCardGridOptions<T> {
  /** 待渲染的完整节点列表（未分行） */
  items: MaybeRefOrGetter<T[]>
  /** 当前每行可容纳的卡片数量，由调用方根据容器宽度/卡片最小宽度计算得出 */
  columnCount: MaybeRefOrGetter<number>
  /** 每个虚拟行的高度（卡片高度 + 行间距），需与实际渲染高度保持一致，否则会出现滚动跳动 */
  rowHeight: MaybeRefOrGetter<number>
  /** 视口外额外渲染的行数缓冲 */
  overscan?: number
}

export interface VirtualCardRow<T> { data: T[], index: number }

/**
 * 将响应式多列卡片网格（CSS grid auto-fill）接入 @vueuse/core 的 useVirtualList。
 *
 * useVirtualList 本身只支持单列（每项固定高度）的虚拟滚动，卡片网格是响应式多列布局，
 * 所以这里先把扁平的节点列表按 columnCount 切成“虚拟行”（每行若干张卡片），再把
 * “行”交给 useVirtualList 做窗口化——滚动时只有可见的若干行会真正挂载 DOM/图表实例。
 */
export function useVirtualCardGrid<T>(options: UseVirtualCardGridOptions<T>) {
  const rows = computed<T[][]>(() => {
    const items = toValue(options.items)
    const columnCount = Math.max(1, Math.floor(toValue(options.columnCount)))
    if (items.length === 0)
      return []

    const result: T[][] = []
    for (let i = 0; i < items.length; i += columnCount)
      result.push(items.slice(i, i + columnCount))
    return result
  })

  const {
    list: virtualRows,
    containerProps,
    wrapperProps,
  } = useVirtualList(rows, {
    itemHeight: () => Math.max(1, toValue(options.rowHeight)),
    overscan: options.overscan ?? 4,
  })

  return {
    virtualRows,
    containerProps,
    wrapperProps,
  }
}
