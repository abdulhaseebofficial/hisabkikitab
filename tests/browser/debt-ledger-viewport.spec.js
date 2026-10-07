const { test, expect } = require('@playwright/test');

const people = { items: [{ key: '00000000-0000-4000-8000-000000000099', contactId: '00000000-0000-4000-8000-000000000099', name: 'Ali', recordCount: 3,
  netBalance: -2500, latestDate: '2026-09-16' }],
  pagination: { page: 1, total: 1, pages: 1, hasPrev: false, hasNext: false } };
const records = { items: [
  { _id: '00000000-0000-4000-8000-000000000001', personName: 'Ali', kind: 'BORROWED',
    originalAmount: 2000, remainingAmount: 2000, transactionDate: '2026-09-03' },
  { _id: '00000000-0000-4000-8000-000000000002', personName: 'Ali', kind: 'LENT',
    originalAmount: 500, remainingAmount: 500, transactionDate: '2026-09-07' },
  { _id: '00000000-0000-4000-8000-000000000003', personName: 'Ali', kind: 'BORROWED',
    originalAmount: 1000, remainingAmount: 1000, transactionDate: '2026-09-16' },
], pagination: { page: 1, total: 3, pages: 1, hasPrev: false, hasNext: false } };

test.beforeEach(async ({ page }) => {
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path === '/api/auth/me') data = { user: { _id: 'owner', name: 'Test Owner',
      email: 'test@example.test', financeMode: 'student', onboardingCompleted: true,
      currency: 'PKR', language: 'en' } };
    else if (path === '/api/debts/people') data = people;
    else if (path === '/api/debts/people/records') data = records;
    else if (path === '/api/debts/contacts') data = { items: [
      { id: '00000000-0000-4000-8000-000000000099', displayName: 'Ali', contactInfo: 'Block C' },
      { id: '00000000-0000-4000-8000-000000000088', displayName: 'Ali', contactInfo: 'Block D' },
    ] };
    else if (path === '/api/debts/summary') data = { payable: 3000, receivable: 500 };
    else if (path === '/api/profile/categories') data = { all: [], custom: [] };
    else if (/^\/api\/debts\/[0-9a-f-]{36}$/.test(path) && route.request().method() === 'GET')
      data = { debt: { ...records.items[0], contactId: people.items[0].contactId,
        paidAmount: 0, status: 'PENDING' }, payments: [] };
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data }) });
  });
});

test('editing a linked record submits a contact rename without changing its ID', async ({ page }) => {
  await page.goto('/debts');
  await page.getByRole('button', { name: /Ali.*3 transactions/ }).click();
  await page.getByRole('button', { name: /Borrowed from/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Who do you need to pay?').fill('Ali Updated');
  const request = page.waitForRequest((req) => req.url().endsWith('/api/debts/00000000-0000-4000-8000-000000000001') && req.method() === 'PUT');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  const payload = (await request).postDataJSON();
  expect(payload.personName).toBe('Ali Updated');
  expect(payload.contactId).toBeUndefined();
});

test('new debt selects a stable contact ID among duplicate names on mobile and desktop', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/debts');
    await page.getByRole('button', { name: 'Add record' }).click();
    const choice = page.getByLabel('Contact for this record');
    await expect(choice.locator('option')).toHaveCount(3);
    await expect(choice.locator('option').nth(1)).toContainText('Block C');
    await expect(choice.locator('option').nth(2)).toContainText('Block D');
    await choice.selectOption('00000000-0000-4000-8000-000000000088');
    await page.getByLabel('Amount').fill('12');
    const request = page.waitForRequest((req) => req.url().endsWith('/api/debts') && req.method() === 'POST');
    await page.getByRole('dialog').getByRole('button', { name: 'Add record' }).click();
    const payload = (await request).postDataJSON();
    expect(payload.contactId).toBe('00000000-0000-4000-8000-000000000088');
    expect(payload.personName).toBeUndefined();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('both lending directions appear under one person on mobile and desktop', async ({ page }) => {
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/debts');
    const ali = page.getByRole('button', { name: /Ali.*3 transactions/ });
    await expect(ali).toBeVisible();
    await ali.click();
    await expect(page.getByText('Borrowed from')).toHaveCount(2);
    await expect(page.getByText('Lent to')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
