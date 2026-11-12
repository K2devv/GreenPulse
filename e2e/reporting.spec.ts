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
    // The street's name mentions another barangay; the barangay must come from where the point lies.
    await page.route('https://photon.komoot.io/api/?**', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ features: [{ geometry: { coordinates: [121.0611, 14.7109] }, properties: { name: 'Gulod Street', city: 'Quezon City' } }] }),
    }))
    await page.goto('/')
    await page.getByRole('button', { name: 'Report an issue' }).click()
    const dialog = page.getByRole('dialog', { name: 'What did you notice?' })
    const title = 'Playwright demo report'
    await dialog.locator('input[name="title"]').fill(title)
    await dialog.locator('input[name="issue_type"]').fill('Blocked drainage')
    await dialog.locator('textarea[name="description"]').fill('Water is collecting beside the road after rain.')
    await dialog.locator('textarea[name="additional_info"]').fill('The blockage has returned twice this week.')
    await dialog.locator('input[name="location"]').fill('Gulod Street')
    const suggestion = dialog.getByRole('option', { name: /Gulod Street, Quezon City/ })
    await expect(suggestion).toContainText('Brgy. North Fairview')
    await suggestion.click()
    await expect(dialog.locator('input[name="location"]')).toHaveValue('Gulod Street, Quezon City')
    await expect(dialog.locator('select[name="barangay"]')).toHaveValue('North Fairview')
    await expect(dialog.getByText('Filled in from the pinned location.', { exact: false })).toBeVisible()
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

test.describe('incident map', () => {
  test('shows District 5 with report pins that open a preview', async ({ page }) => {
    await page.goto('/')
    const hasWebGL2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')))
    test.skip(!hasWebGL2, 'The map needs WebGL2, which this browser does not provide.')

    const map = page.getByRole('region', { name: 'Incident map of District 5' })
    await expect(map).toHaveClass(/is-ready/, { timeout: 20_000 })
    await expect(map.locator('canvas')).toBeVisible()

    // Demo reports are drawn as pins; choosing one selects it and opens its preview.
    const firstPin = map.getByRole('button', { name: /^Demo: .+ report, / }).first()
    await expect(firstPin).toBeVisible()
    const label = await firstPin.getAttribute('aria-label')
    const pin = map.getByRole('button', { name: label ?? '', exact: true })
    await pin.click()
    await expect(pin).toHaveAttribute('aria-pressed', 'true')
    const preview = map.locator('.map-popup-card')
    await expect(preview.getByRole('button', { name: 'Comments and discussion' })).toBeVisible()

    // The preview closes on its own button, and the map can return to the whole district.
    await preview.getByRole('button', { name: 'Close report preview' }).click()
    await expect(preview).toHaveCount(0)
    await map.getByRole('button', { name: 'Show all of District 5' }).click()
    await expect(map.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
  })
})

// Saturnina Road is in the 6th District: inside the padded map bounds, outside every District 5 barangay.
const outsideDistrict5 = { latitude: 14.696, longitude: 121.052 }

test.describe('District 5 limit', () => {
  const fillReport = async (dialog: import('@playwright/test').Locator, title: string) => {
    await dialog.locator('input[name="title"]').fill(title)
    await dialog.locator('input[name="issue_type"]').fill('Blocked drainage')
    await dialog.locator('textarea[name="description"]').fill('Water is collecting beside the road after rain.')
    await dialog.locator('input[name="public_display_consent"]').check()
  }
  const savedReport = (page: import('@playwright/test').Page, title: string) => page.evaluate((reportTitle) => {
    const saved = JSON.parse(localStorage.getItem('greenpulse-reports') ?? '[]') as Array<{ title: string }>
    return saved.some((report) => report.title === reportTitle)
  }, title)

  test('pins the middle of a barangay picked by hand and fills in its address', async ({ page }) => {
    await page.route('https://photon.komoot.io/reverse?**', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ features: [{ properties: { name: 'Gulod Covered Court', street: 'Quirino Highway', district: 'Gulod', city: 'Quezon City' } }] }),
    }))
    await page.goto('/')
    await page.getByRole('button', { name: 'Report an issue' }).click()
    const dialog = page.getByRole('dialog', { name: 'What did you notice?' })
    await dialog.locator('select[name="barangay"]').selectOption('Gulod')
    await expect(dialog.getByText('Pin moved to the middle of Barangay Gulod', { exact: false })).toBeVisible()
    await expect(dialog.locator('input[name="location"]')).toHaveValue('Gulod Covered Court, Quirino Highway, Barangay Gulod, Quezon City')
    await expect(dialog.locator('select[name="barangay"]')).toHaveValue('Gulod')
  })

  test('lists a place outside District 5 but does not let it be chosen or submitted', async ({ page }) => {
    await page.route('https://photon.komoot.io/api/?**', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ features: [{ geometry: { coordinates: [outsideDistrict5.longitude, outsideDistrict5.latitude] }, properties: { name: 'Saturnina Road', city: 'Quezon City' } }] }),
    }))
    await page.goto('/')
    await page.getByRole('button', { name: 'Report an issue' }).click()
    const dialog = page.getByRole('dialog', { name: 'What did you notice?' })
    const title = 'Outside district search report'
    await fillReport(dialog, title)
    await dialog.locator('input[name="location"]').fill('Saturnina Road')
    const suggestion = dialog.getByRole('option', { name: /Saturnina Road, Quezon City/ })
    await expect(suggestion).toContainText('Outside District 5')
    await expect(suggestion).toBeDisabled()

    // With no location chosen, the form stops at its required fields and nothing is saved.
    await dialog.getByRole('button', { name: 'Submit report' }).click()
    await expect(dialog).toBeVisible()
    expect(await savedReport(page, title)).toBe(false)
  })

  test('flags a restored draft whose pin is outside District 5 and moves the pin into a barangay picked by hand', async ({ page }) => {
    // A draft is the one way a confirmed location can reach the form without passing the
    // search, GPS, or map checks, so it exercises the check made at submission.
    const title = 'Outside district draft report'
    await page.goto('/')
    await page.evaluate(({ coordinates, reportTitle }) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('greenpulse-report-drafts', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('drafts')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const transaction = request.result.transaction('drafts', 'readwrite')
        transaction.objectStore('drafts').put({
          submissionId: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
          queued: false,
          formValues: { title: reportTitle, issue_type: 'Blocked drainage', description: 'Water is collecting beside the road after rain.', category: 'Drainage', urgency: 'Medium', location: 'Saturnina Road, Quezon City', barangay: 'Fairview' },
          coordinates,
          locationConfirmed: true,
          photos: [],
        }, 'active')
        transaction.oncomplete = () => { request.result.close(); resolve() }
        transaction.onerror = () => reject(transaction.error)
      }
    }), { coordinates: [outsideDistrict5.latitude, outsideDistrict5.longitude], reportTitle: title })
    await page.reload()
    await page.getByRole('button', { name: 'Resume draft' }).click()
    const dialog = page.getByRole('dialog', { name: 'What did you notice?' })
    await expect(dialog.locator('input[name="title"]')).toHaveValue(title)
    await expect(dialog.getByText('This spot is outside District 5', { exact: false })).toBeVisible()

    // An empty barangay keeps the report from being submitted while the pin is outside.
    await expect(dialog.locator('select[name="barangay"]')).toHaveValue('')

    // Picking a barangay by hand moves the pin to the middle of that barangay, inside the district.
    await dialog.locator('select[name="barangay"]').selectOption('Fairview')
    await expect(dialog.getByText('Pin moved to the middle of Barangay Fairview', { exact: false })).toBeVisible()
    await expect(dialog.getByText('This spot is outside District 5', { exact: false })).toHaveCount(0)
    await expect(dialog.locator('select[name="barangay"]')).toHaveValue('Fairview')
    expect(await savedReport(page, title)).toBe(false)
  })

  test.describe('with a GPS position outside District 5', () => {
    test.use({ geolocation: outsideDistrict5, permissions: ['geolocation'] })

    test('refuses the position and does not submit the report', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Report an issue' }).click()
      const dialog = page.getByRole('dialog', { name: 'What did you notice?' })
      const title = 'Outside district GPS report'
      await fillReport(dialog, title)
      await dialog.getByRole('button', { name: 'Use my location' }).click()
      await expect(dialog.getByRole('alert')).toHaveText('That location is outside District 5, Quezon City.')
      await expect(dialog.getByText('Choose a map location')).toBeVisible()

      await dialog.getByRole('button', { name: 'Submit report' }).click()
      await expect(dialog).toBeVisible()
      expect(await savedReport(page, title)).toBe(false)
    })
  })
})
