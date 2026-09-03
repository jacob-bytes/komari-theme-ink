import { addCollection } from '@iconify/vue'
import { iconCollections } from '@/assets/icons/subset.generated'

/**
 * Iconify 集合预注册
 *
 * 默认行为：`<Icon icon="icon-park-outline:sun" />` 在未注册集合时
 * 会从 https://api.iconify.design 按需拉取单个图标 SVG（带浏览器缓存）。
 * 这套主题面向中国大陆用户，该域名在国内访问不稳定，首次渲染容易出现
 * 图标空白/延迟弹出的闪烁。
 *
 * 本仓库用到的图标是完全静态、可枚举的集合（无运行时拼接的图标名），
 * 所以改为在构建期从 @iconify/json 里只抽取真正用到的图标（见
 * scripts/generate-icon-subset.ts），生成一份几十 KB 量级的子集文件
 * 随主 bundle 一起下发，运行时直接 addCollection 注册进本地缓存 ——
 * 消灭这批图标的运行时第三方请求，同时避免把整个图标集合（每个 1MB+）
 * 打进 bundle。极少数子集里没收录到的图标（比如引用了比本地快照更新
 * 才收录的图标名）会自动回退到默认的 CDN 加载策略，不影响显示。
 */
export async function setupIconify(): Promise<void> {
  for (const collection of iconCollections)
    addCollection(collection)
}
