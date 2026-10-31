import { expect, test } from '@playwright/test'

const onePixelJpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IT//2Q==', 'base64')

test.describe('report intake', () => {
  test('saves a local draft and restores its form values', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Report an issue' }).click()
    const dialog = page.getByRole('dialog', { name: 'What did you notice?' })
    await dialog.locator('input[name="title"]').fill('Saved capstone field draft')
    await dialog.locator('input[name="issue_type"]').fill('Blocked culvert')
    await dialog.locator('textarea[name="description"]').fill('Water backed up near the covered drain.')
    await dialog.locator('textarea[name="additional_info"]').fill('Please inspect after the next rainfall.')
    await dialog.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Draft saved on this device' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Resume draft' }).click()
    const resumed = page.getByRole('dialog', { name: 'What did you notice?' })
    await expect(resumed.locator('input[name="title"]')).toHaveValue('Saved capstone field draft')
    await expect(resumed.locator('input[name="issue_type"]')).toHaveValue('Blocked culvert')
    await expect(resumed.locator('textarea[name="description"]')).toHaveValue('Water backed up near the covered drain.')
    await expect(resumed.locator('textarea[name="additional_info"]')).toHaveValue('Please inspect after the next rainfall.')
  })

  test('provides a keyboard skip link to the main report workspace', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#home')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  })

  test('keeps the reporting form usable at a small phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Report an issue' }).click()
    const dialog = page.getByRole('dialog', { name: 'What did you notice?' })
    const box = await dialog.boundingBox()
    expect(box?.width).toBeLessThanOrEqual(390)
    await dialog.locator('input[name="title"]').scrollIntoViewIfNeeded()
    await expect(dialog.locator('input[name="title"]')).toBeVisible()
    await dialog.getByRole('button', { name: 'Submit report' }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('button', { name: 'Submit report' })).toBeVisible()
  })

  test('offers observation time, extra context, visibility consent, and up to five photos', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Report an issue' }).click()
    const dialog = page.getByRole('dialog', { name: 'What did you notice?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('input[name="observed_at"]')).toHaveAttribute('type', 'datetime-local')
    await expect(dialog.locator('textarea[name="additional_info"]')).toBeVisible()
    await expect(dialog.locator('input[name="public_display_consent"]')).toHaveAttribute('required', '')
    await expect(dialog.getByText(/issue type, urgency, description, observation time/i)).toBeVisible()
    await expect(dialog.getByText(/display name may also appear/i)).toBeVisible()

    const photos = dialog.locator('input[type="file"][multiple]')
    await expect(photos).toHaveCount(1)
    await photos.setInputFiles(Array.from({ length: 5 }, (_, index) => ({
      name: `report-${index + 1}.jpg`,
      mimeType: 'image/jpeg',
      buffer: onePixelJpeg,
    })))
    await expect(dialog.locator('.report-photo-preview')).toHaveCount(5)
    await expect(dialog.getByRole('button', { name: 'Remove report photo 5' })).toBeVisible()
  })

  test('keeps the application in English without a language toggle', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('.language-toggle')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Report an issue' })).toBeVisible()
  })

  test('submits a guest demo report after confirming its location and public visibility', async ({ page }) => {
    await page.route('https://photon.komoot.io/reverse?**', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ features: [{ properties: { name: 'North Fairview', city: 'Quezon City' } }] }),
    }))
    await page.goto('/')
    await page.getByRole('button', { name: 'Report an issue' }).click()
    const dialog = page.getByRole('dialog', { name: 'What did you notice?' })
    const title = 'Playwright demo report'
    await dialog.locator('input[name="title"]').fill(title)
    await dialog.locator('input[name="issue_type"]').fill('Blocked drainage')
    await dialog.locator('textarea[name="description"]').fill('Water is collecting beside the road after rain.')
    await dialog.locator('textarea[name="additional_info"]').fill('The blockage has returned twice this week.')
    await dialog.locator('.report-location-map .leaflet-container').click({ position: { x: 180, y: 120 } })
    await expect(dialog.locator('input[name="location"]')).toHaveValue('North Fairview, Quezon City')
    await expect(dialog.locator('select[name="barangay"]')).toHaveValue('North Fairview')
    await dialog.locator('input[name="public_display_consent"]').check()
    await dialog.getByRole('button', { name: 'Submit report' }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => page.evaluate((reportTitle) => {
      const saved = JSON.parse(localStorage.getItem('greenpulse-reports') ?? '[]') as Array<{ title: string; observedAt?: string; additionalInfo?: string; barangay?: string }>
      return saved.find((report) => report.title === reportTitle)
    }, title)).toMatchObject({
      title,
      additionalInfo: 'The blockage has returned twice this week.',
      barangay: 'North Fairview',
    })
  })
})
