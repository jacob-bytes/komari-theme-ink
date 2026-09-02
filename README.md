<div align="center">

# ink

**Komari Monitor 主题 · 深蓝灵动 · 极简克制**

一个为 [Komari Monitor](https://github.com/elevenhq/komari-monitor) 打造的现代化监控主题：**slate 中性基调 + 深蓝点睛 + 非纯黑暗色**，以 shadcn/ui 设计语言重构的高密度运维仪表盘。

[![Release](https://img.shields.io/github/v/release/jacob-bytes/komari-theme-ink?style=flat-square)](https://github.com/jacob-bytes/komari-theme-ink/releases)
[![License](https://img.shields.io/github/license/jacob-bytes/komari-theme-ink?style=flat-square)](LICENSE)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Bun](https://img.shields.io/badge/Bun-1.x-f9f1e7?style=flat-square&logo=bun&logoColor=black)](https://bun.sh)

</div>

---

## ✨ 特性

- **深蓝灵动（非纯黑）暗色模式** —— `oklch(0.14 0.022 265)` 蓝紫底 / 亮色 `#f8fafc` slate 冷灰，双模式完整适配
- **3 语义色收敛** —— 蓝（primary：图表/选中/hover）· 绿（success：在线状态/健康）· 红（danger：仅异常/丢包），无紫橙青绿噪音
- **精密仪表盘视觉** —— 全站等宽数字（`font-mono tabular-nums`）+ 极细网格 + 1.5px 蓝色折线
- **状态色相四级体系** —— 延迟/丢包柱状图：健康绿 → 蓝 → 琥珀 → 红（真实色相区分，正常节点清晰有意图）；数值文字与柱状图联动
- **信息层级克制** —— 总览卡固高无抖动、辅助信息行、筛选栏仅展示异常统计；详情页设备信息/动态数据分层（去冗余单层呈现）
- **响应式** —— 移动端单列/2 列 + 移动端节点列表（离线状态/资源指标），触控 ≥44px
- **无障碍** —— 键盘焦点环、状态色 + 形状双重表达、色觉友好模式保留全彩

> **注意**：ink 是 **Komari 主题包**（zip 导入产物），不是独立 Web 应用——**Vercel 等平台的线上部署不适用**；发布与分发以 **GitHub Releases 的 `ink-build-*.zip`** 为准。

## 🚀 快速开始

### 方式一：直接使用

1. 从 [Releases](https://github.com/jacob-bytes/komari-theme-ink/releases) 下载 `ink-build-*.zip`
2. Komari 后台 → 主题 → **导入主题**
3. 切换主题为 **ink**，即可享受深蓝仪表盘

### 方式二：本地构建

```bash
bun install
bun run build        # 产出 dist/ + ink-build-<sha>.zip
bun run dev          # 本地开发预览
```

## 🗓️ 版本脉络

| 版本   | 里程碑                                                       |
| ------ | ------------------------------------------------------------ |
| v0.1.x | 从 blueprint 业务层起步：zinc 基调 → 蓝系收敛                |
| v0.2.x | 深蓝灵动体系（oklch token）+ 筛选减法 + 状态色相 + CPU 修复  |
| v0.3.x | 蓝/白主题深化（全站选中态/健康态统一蓝）                     |
| v0.4.x | 交互式地球（NodeGlobePanel/D3）+ 详情页结构优化 + 移动端列表 |
| v0.5.x | 详情页去冗余单层呈现 + 图形语义强化                          |
| v0.6.x | 移除交互式地球（性能/维护成本收敛）+ 卡片网格虚拟滚动 + 配置项梳理 |

## 🖼️ 预览

![ink preview](docs/preview.png)

## 🧱 技术栈

| 层   | 技术                                                         |
| ---- | ------------------------------------------------------------ |
| 框架 | Vue 3.5 + Vite 7                                             |
| 样式 | Tailwind CSS v4 + CSS Variables（oklch token）               |
| 组件 | reka-ui / shadcn 风格组件（Card/Button/Tabs/Badge/Tooltip…） |
| 图表 | vue-echarts（ECharts 6，按需树摇）                           |
| 状态 | Pinia                                                        |
| 语言 | TypeScript                                                   |
| 构建 | Bun                                                          |

## 🏗️ 架构

```text
Component → Composable → Service → RequestManager / CacheService → API / RPC
```

- **业务层**：复用 [komari-theme-blueprint](https://github.com/jacob-bytes/komari-theme-blueprint) 的成熟数据/服务栈（stores、auth、history、provider 等）
- **UI 层**：ink 独立重构（深蓝仪表盘设计语言）
- **契约**：`komari-theme.json`（版本唯一来源）+ `docs/preview.png` + `dist/` 打包

## 🎨 设计 Token（3 语义色）

| Token       | 值                     | 用途                                       |
| ----------- | ---------------------- | ------------------------------------------ |
| `--primary` | `oklch(0.55 0.16 258)` | 图表主线 / 选中态 / hover 边框 / sparkline |
| `--success` | `oklch(0.62 0.13 154)` | **仅**在线/正常状态点                      |
| `--danger`  | `oklch(0.58 0.18 25)`  | **仅**异常 / 丢包 / 85%+ 负载              |
| `--warning` | `oklch(0.72 0.14 70)`  | 60-85% 负载 / 延迟中间档                   |

> 中性色（background/card/border/muted）为灰阶层，不参与语义。

## ⚙️ 后台配置（46 项）

主题设置 / 数据刷新 / 告警 / 价格展示 / 快捷控制与阈值 / 详情卡片 / 图表模板 / 背景——全部经 `komari-theme.json` 注册，可在 Komari 后台自定义。

## 📚 致谢

- 设计语言灵感：[shadcn/ui](https://github.com/shadcn-ui/ui)（样式致敬，非代码搬运）
- 上游数据与场景：[Komari Monitor](https://github.com/elevenhq/komari-monitor)
- 业务层基础：[komari-theme-blueprint](https://github.com/jacob-bytes/komari-theme-blueprint)

## 📄 许可

MIT —— 详见 [LICENSE](LICENSE)。欢迎 Star / Issue / PR 共建。

---

<div align="center">
<p><b>ink</b> — 深蓝灵动 · 克制高级 · 精密仪表盘</p>
</div>
