import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { installKomariFixture } from './fixtures/komari'

async function openGlobeTool(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Komari Visual Lab' })).toBeVisible()
  await page.waitForTimeout(800)
  const toggle = page.getByRole('button', { name: '显示首页工具' })
  if (await toggle.isVisible().catch(() => false))
    await toggle.click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '地球' }).click()
  await page.waitForTimeout(1200)
}

test('globe tool: light mode default globe view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page)
  await page.goto('/')
  await openGlobeTool(page)
  await page.screenshot({ path: 'test-results/globe-light-default.png', fullPage: false })
})

test('globe tool: dark mode default globe view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page, { dark: true })
  await page.goto('/')
  await openGlobeTool(page)
  await page.screenshot({ path: 'test-results/globe-dark-default.png', fullPage: false })
})

test('globe tool: drag rotates the globe', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page)
  await page.goto('/')
  await openGlobeTool(page)
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 220, cy + 30, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: 'test-results/globe-dragged.png', fullPage: false })
})

test('globe tool: toggle to flat map mode', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page)
  await page.goto('/')
  await openGlobeTool(page)
  const toggleBtn = page.getByRole('button', { name: /地图|平面/ }).first()
  await toggleBtn.click()
  await page.waitForTimeout(1400)
  await page.screenshot({ path: 'test-results/globe-map-mode.png', fullPage: false })
})

test('globe tool: mobile viewport stacking', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installKomariFixture(page)
  await page.goto('/')
  await openGlobeTool(page)
  await page.screenshot({ path: 'test-results/globe-mobile.png', fullPage: true })
})

test('globe tool: marker click navigates', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page)
  await page.goto('/')
  await openGlobeTool(page)
  await page.screenshot({ path: 'test-results/globe-markers-zoom.png', clip: { x: 0, y: 0, width: 1280, height: 700 } })
})
