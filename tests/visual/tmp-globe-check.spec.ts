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
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page)
  await openStablePage(page)
  await page.getByRole('button', { name: /地球/, exact: false }).first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/tmp-globe-default.png', fullPage: false })

  // toggle flylines on
  await page.getByTitle('枢纽放射飞线（装饰效果，无真实链路数据）').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/tmp-globe-flylines.png', fullPage: false })

  // click a region in the side list to trigger focus rotation
  const regionButtons = page.locator('button:has-text("个节点")')
  await page.waitForTimeout(200)

  await page.screenshot({ path: 'test-results/tmp-globe-side-list.png', fullPage: false })
})

test('tmp: globe panel dark site theme stays fixed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page, { dark: true })
  await openStablePage(page)
  await page.getByRole('button', { name: /地球/, exact: false }).first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/tmp-globe-site-dark.png', fullPage: false })
})
