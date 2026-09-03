import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
/**
 * 生成图标子集数据（构建期脚本，不参与运行时打包）
 *
 * 背景：`<Icon icon="tabler:xxx" />`（@iconify/vue）默认策略是「未注册集合时，
 * 每个图标各自向 https://api.iconify.design 发一次网络请求」。这套主题面向的是
 * 中国大陆用户（lang="zh-CN"，默认时区 Asia/Shanghai），该域名在国内访问不稳定，
 * 首次渲染时容易出现图标空白/延迟弹出的闪烁；而完整图标集合（@iconify/json 里单个
 * 集合的 JSON 往往 1MB+）又不适合直接打进生产 bundle。
 *
 * 折中方案：本仓库用到的图标是完全静态、可枚举的（无运行时拼接的图标名），所以在
 * 构建期从 @iconify/json（devDependency，不进生产 bundle）里只挑出真正用到的图标，
 * 生成一份体积极小（几十 KB 量级）的子集文件，运行时用 addCollection 注册进
 * @iconify/vue 的本地缓存 —— 消灭这批图标的运行时第三方请求，子集内容随源码扫描
 * 自动更新，不会因为漏改脚本而与实际用量脱节。
 *
 * 用法：
 *   bun run icons:generate
 * 新增/删除图标引用后重新运行一次，将改动后的 src/assets/icons/subset.generated.ts
 * 一并提交。
 */
import { getIconData } from '@iconify/utils'
import fg from 'fast-glob'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const srcDir = path.join(rootDir, 'src')
const outputFile = path.join(srcDir, 'assets/icons/subset.generated.ts')

/** 项目里实际用过的图标集合前缀；遇到清单外的新前缀会直接报错提醒补充，而不是静默漏收录 */
const KNOWN_PREFIXES = ['tabler', 'lucide', 'icon-park-outline', 'carbon'] as const

/** 匹配形如 'tabler:xxx' / "lucide:xxx" 的字符串字面量（模板 icon="..." 属性也会命中） */
const ICON_LITERAL_RE = /['"](tabler|lucide|icon-park-outline|carbon|mdi|ph|solar):([a-zA-Z0-9-]+)['"]/g

async function main() {
  const files = await fg(['**/*.vue', '**/*.ts'], { cwd: srcDir, absolute: true })

  const usedByPrefix = new Map<string, Set<string>>()
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    for (const match of content.matchAll(ICON_LITERAL_RE)) {
      const [, prefix, name] = match
      if (!KNOWN_PREFIXES.includes(prefix as typeof KNOWN_PREFIXES[number])) {
        throw new Error(
          `[generate-icon-subset] 发现未知图标集合前缀 "${prefix}"（图标 "${prefix}:${name}"，来自 ${path.relative(rootDir, file)}）。\n`
          + `请确认是否为拼写错误；如确实需要引入新的图标集合，将其加入脚本里的 KNOWN_PREFIXES 后重新运行本脚本。`,
        )
      }
      if (!usedByPrefix.has(prefix))
        usedByPrefix.set(prefix, new Set())
      usedByPrefix.get(prefix)!.add(name)
    }
  }

  interface IconifyJsonSet {
    prefix: string
    width?: number
    height?: number
    icons: Record<string, { body: string, width?: number, height?: number, hFlip?: boolean, vFlip?: boolean, rotate?: number }>
  }

  const collections: IconifyJsonSet[] = []
  let totalIcons = 0

  for (const [prefix, names] of usedByPrefix) {
    const sourcePath = path.join(rootDir, 'node_modules/@iconify/json/json', `${prefix}.json`)
    const iconSet = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

    const icons: IconifyJsonSet['icons'] = {}
    for (const name of [...names].sort()) {
      const data = getIconData(iconSet, name)
      if (!data) {
        // 本地 @iconify/json 快照没有这个图标（比如引用了比当前锁定版本更新才收录的图标名）。
        // 不中断构建：跳过它，@iconify/vue 会按默认策略回退到运行时 CDN 请求，
        // 行为与「完全不做子集预注册」时一致，只是少了这一个图标的离线加速。
        console.warn(`[generate-icon-subset] 警告：在 @iconify/json 的 "${prefix}" 集合里找不到图标 "${prefix}:${name}"，已跳过（该图标仍会走运行时 CDN 加载，请检查图标名是否写错或版本过旧）。`)
        continue
      }
      icons[name] = data
    }

    collections.push({
      prefix,
      width: iconSet.width,
      height: iconSet.height,
      icons,
    })
    totalIcons += names.size
  }

  collections.sort((a, b) => a.prefix.localeCompare(b.prefix))

  const header = `// 本文件由 \`bun run icons:generate\`（scripts/generate-icon-subset.ts）自动生成，请勿手动编辑。\n`
    + `// 新增/删除图标引用后重新运行该脚本并提交本文件。\n`
    + `import type { IconifyJSON } from '@iconify/vue'\n\n`
    + `export const iconCollections: IconifyJSON[] = `

  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, `${header}${JSON.stringify(collections, null, 2)}\n`)

  const sizeKb = (fs.statSync(outputFile).size / 1024).toFixed(1)
  console.log(`[generate-icon-subset] 已生成 ${totalIcons} 个图标 / ${collections.length} 个集合 -> ${path.relative(rootDir, outputFile)}（${sizeKb} KB）`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
