# 详情页改版正式清单

> 目标：将当前 ink 详情页从“多卡片仪表盘”收敛为参考图式的“紧凑信息头 + 极简图表”结构。
> 原则：尽量只改 UI 呈现层，保留现有数据获取、计算、权限、缓存逻辑。

## 当前状态

- 详情页主要文件：
  - `src/views/InstanceDetail.vue`
  - `src/components/LoadChart.vue`
  - `src/components/PingChart.vue`
- 当前问题是：
  - 顶部有多张价格/指标卡
  - 接着是硬件信息、系统信息、存储信息、网络信息多张卡
  - 图表区是大量 CardX 图表卡
  - 图标、色彩、hover、tooltip 较多，视觉不够克制

## 目标结构

```text
顶部轻导航
  - 返回
  - 节点名 / 旗帜
  - 在线状态
  - 收藏
  - 前后节点切换
  - 厂商信息

紧凑信息摘要
  - 系统 / 架构
  - CPU 型号 / 核心
  - 内存 / 硬盘
  - 今日流量 / 累计流量
  - 价格 / 到期
  - 可选：运行时间

图表区
  - 轻量 Tab：资源 / 网络延迟
  - LoadChart：单列分节，弱化卡片容器
  - PingChart：轻量任务列表 + 轻量图表
```

## 改造阶段

### 阶段 A：InstanceDetail 信息头

1. 新增或抽离 `DetailSummary` 展示逻辑，推荐新建组件：
   - `src/components/NodeDetailHeader.vue`
   - 或 `src/components/DetailSummary.vue`
2. 复用现有 computed：
   - `nodePriceText`
   - `monthlyAverageCostText`
   - `remainingTimeText`
   - `remainingValueText`
   - `trafficUsed`
   - `hasPeak`
   - `providerDisplay`
   - `cpuBenchmarkUrl / cpuBenchmarkRating`
   - `formatBytes` / `formatBytesPerSecond`
3. 移除或隐藏当前多卡片区域：
   - 价格指标卡网格
   - 硬件信息卡
   - 系统信息卡
   - 存储信息卡
   - 网络信息卡
4. 保留：
   - `nodeDetailSectionTabsEnabled` 控制是否启用分区 Tab
   - 详情页导航、收藏、节点切换
   - 权限/隐藏价格逻辑

### 阶段 B：LoadChart 极简化

1. 保留全部数据逻辑：
   - 时间范围
   - 自定义范围
   - realtime 刷新
   - metric 历史兼容回退
   - 磁盘预测
   - GPU 多设备
   - Ping metric series
2. 重构模板：
   - 从 `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3` 改为单列分节
   - 每节使用极轻 header，去掉彩色 icon tone
   - 保留必要的 `data-load-chart-card` / `data-latest-cpu` / `data-load-chart-range`
3. 视觉收敛：
   - 去掉大面积 areaStyle / 渐变
   - 图例最小化
   - 线宽统一变细
   - 颜色统一为中性 + 单一强调色
   - 图表容器弱化边框

### 阶段 C：PingChart 极简化

1. 保留：
   - Ping 任务排序
   - 任务选择
   - 平滑峰值
   - Tooltip
   - 自定义时间范围
2. 模板调整：
   - 任务统计卡改为轻量列表 / pill
   - 去掉大卡片 hover 变色
   - 图表去掉外层厚重 CardX
   - 保留 `data-ping-task-id`

### 阶段 D：配套清理

- 精简或删除不再使用的 `MetricChartHeader.vue` / `MetricSeriesChartCard.vue`（视改造结果决定）
- 精简 `InstanceDetail.vue` 中不再渲染的 metric card 相关 computed
- 保持 `appStore.detailMetricCardPreset` 兼容，避免破坏已有后台配置

## 测试与验证

- `bun run type-check`
- `bun run lint`
- `bun run build`
- 视觉回归：
  - `detail-light-desktop`
  - `detail-dark-mobile`
  - `detail short history falls back...`
  - `detail history keeps cumulative traffic...`
  - `detail ping requests stay scoped...`
  - `detail ping tasks follow the backend task order`
- 需要更新的测试选择器：
  - 如果不再显示“硬件信息”，替换为新的摘要标题断言
  - 保留 `data-load-chart-card="cpu"` 或同步更新测试
  - 保留 `data-latest-cpu`
  - 保留 `data-ping-task-id`

## 发布要求

- 完成 UI 改造后 bump `komari-theme.json` 版本
- 重新 `bun run build` 生成 `ink-build-*.zip`
- 更新视觉快照
- 如发布，确认 GitHub Actions / Release artifact

## 暂不处理

- 不删除数据层、服务层、权限逻辑
- 不新增组件库
- 不改变公开路由契约
- 不重新引入地球 / 蓝图
