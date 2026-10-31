import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click()
  await expect(page.getByRole('button', { name: /Open profile settings/ })).toBeVisible()
}

test('resident account does not receive staff-desk access', async ({ page }) => {
  const email = process.env.E2E_RESIDENT_EMAIL
  const password = process.env.E2E_RESIDENT_PASSWORD
  test.skip(!process.env.E2E_BASE_URL || !email || !password, 'Configure a non-production E2E_BASE_URL and resident test account to run role checks.')
  await signIn(page, email!, password!)
  await expect(page.getByRole('button', { name: 'Open staff desk' })).toHaveCount(0)
})

test('responder account receives the assigned-work desk without admin team controls', async ({ page }) => {
  const email = process.env.E2E_RESPONDER_EMAIL
  const password = process.env.E2E_RESPONDER_PASSWORD
  test.skip(!process.env.E2E_BASE_URL || !email || !password, 'Configure a non-production E2E_BASE_URL and responder test account to run role checks.')
  await signIn(page, email!, password!)
  await page.getByRole('button', { name: 'Open staff desk' }).click()
  await expect(page.getByRole('heading', { name: 'Response queue' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Manage teams' })).toHaveCount(0)
})

test('admin can open response tools and the resolution review action', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL
  const password = process.env.E2E_ADMIN_PASSWORD
  const reportTitle = process.env.E2E_RESOLUTION_REPORT_TITLE
  test.skip(!process.env.E2E_BASE_URL || !email || !password || !reportTitle, 'Configure a non-production E2E_BASE_URL, admin account, and seeded Awaiting verification report.')
  await signIn(page, email!, password!)
  await page.getByRole('button', { name: 'Open staff desk' }).click()
  await page.getByRole('button', { name: 'Response desk' }).click()
  await page.getByPlaceholder(/Search by ID, title/).fill(reportTitle!)
  await page.getByRole('button', { name: new RegExp(reportTitle!, 'i') }).click()
  await expect(page.getByRole('button', { name: 'Approve resolution' })).toBeVisible()
})
