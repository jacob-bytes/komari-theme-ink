import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { installKomariFixture } from './fixtures/komari'

const STABLE_STYLE = `
  *, *::before, *::after {
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`

async function openStablePage(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Komari Visual Lab' })).toBeVisible()
  await page.addStyleTag({ content: STABLE_STYLE })
  await page.waitForTimeout(700)
}

test('tmp: card ping display shows real history dots', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page)
  await openStablePage(page)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/tmp-node-card.png', fullPage: false })
})

test('tmp: globe panel dark tech theme', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER:', msg.text()))
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page)
  await openStablePage(page)
  await page.getByRole('button', { name: '显示首页工具' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /地球/, exact: false }).first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/tmp-globe-default.png', fullPage: false })

  // toggle flylines on
  await page.getByTitle('枢纽放射飞线（装饰效果，无真实链路数据）').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/tmp-globe-flylines.png', fullPage: false })
  const globeBox = await page.locator('canvas').boundingBox()
  if (globeBox)
    await page.screenshot({ path: 'test-results/tmp-globe-flylines-zoom.png', clip: globeBox })

  // click the hub region in the side list to trigger focus rotation + view flylines radiating from front
  await page.getByText('美国', { exact: true }).click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'test-results/tmp-globe-side-list.png', fullPage: false })
  const globeBox2 = await page.locator('canvas').boundingBox()
  if (globeBox2)
    await page.screenshot({ path: 'test-results/tmp-globe-focus-zoom.png', clip: globeBox2 })
})

test('tmp: globe panel dark site theme stays fixed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page, { dark: true })
  await openStablePage(page)
  await page.getByRole('button', { name: '显示首页工具' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /地球/, exact: false }).first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/tmp-globe-site-dark.png', fullPage: false })
})
