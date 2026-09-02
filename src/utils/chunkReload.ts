/**
 * 处理"动态 import 的 chunk 加载失败"场景。
 *
 * 典型触发条件：站点刚发布新版本后，浏览器里还开着旧版本的标签页——
 * 旧版本引用的旧 chunk 文件名（如 NodeComparePanel-xxxx.js）已经被新构建
 * 产物替换/删除，用户点击某个仍停留在内存里的旧版本工具入口时，
 * 触发一次指向已不存在文件的 `import()`，Vite 会派发全局
 * `vite:preloadError` 事件（无论调用方是否自行 catch 了这次失败）。
 *
 * 处理策略：监听该事件，整页刷新一次以拿到最新的 index.html 和 chunk
 * 清单；用 sessionStorage 做冷却时间兜底，避免"刷新后仍然失败"时
 * 陷入刷新死循环（例如部署本身存在问题、而不是简单的旧 tab 缓存）。
 */

const RELOAD_TIMESTAMP_KEY = 'ink-chunk-reload-at'
/** 冷却时间内不重复刷新，避免死循环 */
const RELOAD_COOLDOWN_MS = 10_000

let listenerAttached = false

function handlePreloadError(event: Event): void {
  console.warn('[chunkReload] 检测到动态 chunk 加载失败，可能是站点已更新，尝试刷新页面获取最新版本。', event)

  let lastReloadAt = 0
  try {
    lastReloadAt = Number(sessionStorage.getItem(RELOAD_TIMESTAMP_KEY) || 0)
  }
  catch {
    // 隐私模式等场景下 sessionStorage 可能不可用，跳过冷却检查直接刷新一次
  }

  const now = Date.now()
  if (now - lastReloadAt < RELOAD_COOLDOWN_MS) {
    console.error('[chunkReload] 刚刚已经刷新过一次仍然失败，为避免死循环不再自动刷新。请检查网络或稍后手动刷新。')
    return
  }

  try {
    sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, String(now))
  }
  catch {
    // 忽略写入失败
  }

  window.location.reload()
}

/**
 * 注册全局 chunk 加载失败监听，应在应用挂载前调用一次。
 */
export function setupChunkReload(): void {
  if (listenerAttached) {
    return
  }
  listenerAttached = true
  window.addEventListener('vite:preloadError', handlePreloadError)
}
