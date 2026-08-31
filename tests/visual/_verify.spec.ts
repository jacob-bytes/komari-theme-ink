import { expect, test } from '@playwright/test'
import { installKomariFixture } from './fixtures/komari'

const GPU_NODE_UUID = '00000000-0000-4000-8000-000000000004'

test('verify: instance detail top spacing + truncated field tooltip', async ({ page }) => {
  await installKomariFixture(page, { generalCardKeys: ['onlineNodes', 'avgCpu', 'netSpeed', 'totalTraffic'] })
  await page.goto(`/instance/${GPU_NODE_UUID}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  await page.screenshot({ path: 'test-results/verify-detail-top.png', clip: { x: 0, y: 0, width: 1000, height: 220 } })

  // 悬停 CPU 字段值，验证 tooltip 弹出完整信息
  const cpuValue = page.locator('.detail-summary-field', { hasText: 'CPU' }).locator('[data-slot="data-tooltip"]')
  await cpuValue.hover()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/verify-cpu-tooltip-v2.png' })

  await expect(page.locator('[role="tooltip"]', { hasText: 'GPU' })).toBeVisible()
})
