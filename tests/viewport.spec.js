import { test, expect } from '@playwright/test'

const widths = [320, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920, 2560]

for (const width of widths) {
  test(`layout remains reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)

    const generateButton = page.getByRole('button', { name: 'Generate from Image' })
    const validateButton = page.getByRole('button', { name: 'Validate & Preview' })

    await expect(generateButton).toBeVisible()
    await expect(validateButton).toBeVisible()

    if (width <= 430) {
      const boxes = await Promise.all([
        generateButton.boundingBox(),
        validateButton.boundingBox(),
      ])

      for (const box of boxes) {
        expect(box).not.toBeNull()
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
  })
}

test('focused file input remains visible in reduced keyboard viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 })
  await page.goto('/')

  const input = page.getByLabel('Choose PNG image')
  await input.focus()
  await expect(input).toBeFocused()

  const box = await input.boundingBox()
  expect(box).not.toBeNull()
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(480)
})

test('primary controls have accessible names', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Generate from Image' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Validate & Preview' })).toBeVisible()
  await expect(page.getByLabel('Choose PNG image')).toBeVisible()
})
