import type { Component } from 'vue'
import { Icon } from '@iconify/vue'
import { defineAsyncComponent, defineComponent, h } from 'vue'

interface LazyPanelOptions {
  /** 加载失败时的提示文案，默认"面板加载失败，可能是站点刚更新" */
  errorText?: string
}

/** 网络抖动等偶发原因导致的失败，允许自动重试的次数 */
const MAX_AUTO_RETRY = 1

/**
 * 包装 `defineAsyncComponent`，为"动态 import 的 chunk 加载失败"场景提供
 * 兜底 UI，避免页面直接留白。
 *
 * 该失败最常见于站点发布新版本后，浏览器里仍打开着旧版本页面——此时
 * `src/utils/chunkReload.ts` 里注册的全局监听通常会先整页刷新一次去
 * 拿到最新 chunk，用户大多感知不到这里的错误态；这里的兜底只在刷新
 * 冷却期内仍失败、或失败原因与"旧版本 chunk 404"无关时才会展示。
 */
export function createLazyPanel(
  loader: () => Promise<{ default: Component }>,
  options: LazyPanelOptions = {},
) {
  const errorText = options.errorText ?? '面板加载失败，可能是站点刚更新'

  const errorComponent = defineComponent({
    name: 'LazyPanelError',
    setup() {
      return () => h(
        'div',
        { class: 'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center' },
        [
          h(Icon, { icon: 'tabler:alert-triangle', width: 22, height: 22, class: 'text-muted-foreground' }),
          h('p', { class: 'text-sm text-muted-foreground' }, errorText),
          h(
            'button',
            {
              type: 'button',
              class: 'inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted',
              onClick: () => window.location.reload(),
            },
            [h(Icon, { icon: 'tabler:refresh', width: 14, height: 14 }), '刷新页面'],
          ),
        ],
      )
    },
  })

  const loadingComponent = defineComponent({
    name: 'LazyPanelLoading',
    setup() {
      return () => h(
        'div',
        { class: 'flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground' },
        [h(Icon, { icon: 'tabler:loader-2', width: 16, height: 16, class: 'animate-spin' }), '加载中...'],
      )
    },
  })

  return defineAsyncComponent({
    loader,
    loadingComponent,
    errorComponent,
    delay: 150,
    timeout: 15_000,
    onError(error, retry, fail, attempts) {
      console.warn('[lazyPanel] chunk 加载失败，第', attempts, '次尝试', error)
      if (attempts <= MAX_AUTO_RETRY) {
        retry()
      }
      else {
        fail()
      }
    },
  })
}
