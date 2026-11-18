import { expect, test } from '@playwright/test'

// Chrome's built-in test camera stands in for a real one. Launch flags apply to a whole file.
test.use({ permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })

test('shows the live camera, then offers the form when the photo checker cannot load', async ({ page }) => {
  // The model download fails after a moment, so the live view can be checked first.
  await page.route('https://huggingface.co/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    await route.abort()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Report an issue' }).click()
  await page.getByRole('button', { name: 'Scan with camera' }).click()
  const scan = page.getByRole('dialog', { name: 'Scan the issue' })
  // The test camera can take several seconds to start while other tests share the machine.
  await expect.poll(() => scan.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0)
  await expect(scan.getByRole('button', { name: 'Take the photo now' })).toBeEnabled()

  const failed = page.getByRole('dialog', { name: "Couldn't check the photo" })
  await expect(failed).toBeVisible({ timeout: 15_000 })
  await failed.getByRole('button', { name: 'Fill in the form' }).click()
  await expect(page.getByRole('dialog', { name: 'What did you notice?' })).toBeVisible()
})
