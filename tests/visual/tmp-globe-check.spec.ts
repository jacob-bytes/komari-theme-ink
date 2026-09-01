import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { installKomariFixture } from './fixtures/komari'

const STABLE_STYLE = `
  *, *::before, *::after {
    animation: none !important;
    caret-color: transparent !important;
    transition: none !important;
  }
  html { scroll-behavior: auto !important; }
`

async function openStablePage(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Komari Visual Lab' })).toBeVisible()
  await page.addStyleTag({ content: STABLE_STYLE })
  await page.waitForTimeout(700)
}

test('tmp: node card flattened ping bars', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page)
  await openStablePage(page)
  await page.screenshot({ path: 'test-results/tmp-node-card-v2.png', fullPage: false })
})

test('tmp: globe panel soft frame + depth on light site theme', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page)
  await openStablePage(page)
  await page.getByRole('button', { name: '显示首页工具' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /地球/, exact: false }).first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'test-results/tmp-globe-v2-light.png', fullPage: false })
  const globeBox = await page.locator('canvas').boundingBox()
  if (globeBox)
    await page.screenshot({ path: 'test-results/tmp-globe-v2-light-zoom.png', clip: globeBox })

  // hover chip button to verify glass hover state
  await page.getByRole('button', { name: '地图' }).hover()
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'test-results/tmp-globe-v2-chip-hover.png', fullPage: false })
})

test('tmp: globe panel soft frame on dark site theme', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page, { dark: true })
  await openStablePage(page)
  await page.getByRole('button', { name: '显示首页工具' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /地球/, exact: false }).first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'test-results/tmp-globe-v2-dark.png', fullPage: false })
})
