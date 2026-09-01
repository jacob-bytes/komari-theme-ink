import { expect, test } from '@playwright/test'
import { installKomariFixture } from './fixtures/komari'

test('debug globe pixel + styles', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installKomariFixture(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Komari Visual Lab' })).toBeVisible()
  await page.waitForTimeout(800)
  const toggle = page.getByRole('button', { name: '显示首页工具' })
  if (await toggle.isVisible().catch(() => false))
    await toggle.click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '地球' }).click()
  await page.waitForTimeout(1200)

  const info = await page.evaluate(() => {
    return { dpr: window.devicePixelRatio }
  })
  console.log('DPR', JSON.stringify(info))

  // Sample a grid of pixels across the canvas to see the pattern
  const grid = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const rows = []
    for (let y = 0; y < canvas.height; y += Math.floor(canvas.height / 8)) {
      const row = []
      for (let x = 0; x < canvas.width; x += Math.floor(canvas.width / 8)) {
        const d = ctx.getImageData(x, y, 1, 1).data
        row.push(`${d[0]},${d[1]},${d[2]},${d[3]}`)
      }
      rows.push(row.join(' | '))
    }
    return rows
  })
  console.log('GRID\n' + grid.join('\n'))
})
