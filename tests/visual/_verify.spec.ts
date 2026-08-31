import { test } from '@playwright/test'
import { installKomariFixture } from './fixtures/komari'

test('overview sparkline + provider table + loss gradient', async ({ page }) => {
  await installKomariFixture(page, { generalCardKeys: ['onlineNodes', 'avgCpu', 'netSpeed', 'totalTraffic'] })
  await page.goto('/')
  await page.waitForSelector('text=在线节点')
  // 等待迷你趋势采样至少产生 2 个点(每 2s 采一次)
  await page.waitForTimeout(4500)
  await page.screenshot({ path: 'test-results/verify-overview-sparklines.png' })

  // 展开首页工具栏,再打开性价比工具,验证排序表头图标与首列吸附
  await page.getByRole('button', { name: '显示首页工具' }).click()
  await page.getByRole('button', { name: /性价比/ }).click()
  await page.waitForSelector('text=单机性价比排行')
  await page.screenshot({ path: 'test-results/verify-provider-value.png' })

  // 悬浮到排序表头验证 hover 效果
  await page.getByRole('button', { name: /每核月成本/ }).hover()
  await page.screenshot({ path: 'test-results/verify-sort-hover.png' })

  // 卡片视图丢包渐变配色(多节点丢包率不同)
  await page.getByText('节点', { exact: true }).first().click().catch(() => {})
  await page.screenshot({ path: 'test-results/verify-cards.png', fullPage: true })
})
