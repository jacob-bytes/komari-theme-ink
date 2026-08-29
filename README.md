# ink

**ink** 是为 [Komari Monitor](https://github.com/elevenhq/komari-monitor) 打造的第二套主题：**极简、克制、深蓝黑**（深墨色而非纯黑），设计语言受 [shadcn/ui](https://github.com/shadcn-ui/ui) 启发（非代码搬运，样式灵感已在致谢中明示）。

## 快速开始

- 上传 `ink-build-*.zip` 到 Komari 后台 → 主题管理 → 导入主题
- 或 clone 后 `bun install && bun run build` 本地构建 zip

## 技术栈

Vue 3 + Vite + Tailwind CSS v4 + reka-ui + Pinia + vue-echarts，`bun` 构建。

## 架构

本主题基于 [komari-theme-blueprint](https://github.com/jacob-bytes/komari-theme-blueprint) 的成熟业务层（stores/composables/services/utils）构建，UI 层为 **ink** 独立重制（深蓝黑 minimal 风格）。

## 许可

MIT License。设计灵感致谢 [shadcn/ui](https://github.com/shadcn-ui/ui) 与上游生态。

---
