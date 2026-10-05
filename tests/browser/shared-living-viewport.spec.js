const { test, expect } = require('@playwright/test');

const month = new Date().toISOString().slice(0, 7);
const date = `${month}-03`;
const space = { id: 'space', name: 'My Flat', currency: 'PKR', residents: 2, role: 'admin',
  organization_type: 'hostel', organization_name: 'North Wing' };
const members = ['Ali', 'Ahmed'].map((name, index) => ({
  id: String(index + 1), name, active: true, archived: false, joined_on: `${month}-01`,
  left_on: null, assigned: '1500.00', contributed: '1000.00', paidDirect: '0.00', due: '500.00',
}));
const data = {
  space, period: { closed: false }, periods: [],
  categories: [
    { id: 'food', kind: 'food', name: 'Groceries', stable_key: 'groceries', archived: false },
    { id: 'bill', kind: 'bill', name: 'Electricity', stable_key: 'electricity', archived: false },
  ],
  expenses: [{ id: 'expense', category_id: 'food', date, amount_minor: 300000, note: 'Weekly shop', method: 'equal' }],
  bills: [{ id: 'bill-row', category_id: 'bill', name: 'Electricity', date, due_date: date,
    amount_minor: 0, recurring: true, paid: false, note: '', method: 'equal' }],
  payments: [], shares: [], activity: [],
  summary: { activeMembers: 2, spent: '3000.00', collected: '2000.00', totalPaid: '2000.00',
    settlementOutstanding: '1000.00', unallocated: '0.00', categories: [
      { category_id: 'food', amount: '3000.00' },
    ], members },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hw-theme', 'dark'));
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const path = new URL(route.request().url()).pathname;
    let payload = {};
    if (path === '/api/auth/me') payload = { user: { _id: 'owner', name: 'Test Owner',
      email: 'test@example.test', financeMode: 'shared_living', onboardingCompleted: true,
      currency: 'PKR', language: 'en' } };
    else if (path === '/api/shared-living/spaces') payload = [space];
    else if (path.includes('/api/shared-living/spaces/space/months/')) payload = data;
    else if (path === '/api/notifications') payload = { items: [] };
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: payload }) });
  });
});

test('shared dashboard and internal pages fit mobile, tablet and desktop widths', async ({ page }) => {
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'My Flat' })).toBeVisible();
    await expect(page.getByLabel('Shared space')).toBeVisible();
    for (const route of ['/dashboard', '/dashboard?section=bills', '/dashboard?section=daily',
      '/dashboard?section=members', '/dashboard?section=payments']) {
      await page.goto(route);
      await expect(page.locator('#main-content')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (route !== '/dashboard') await expect(page.getByLabel('Shared space')).toHaveCount(0);
      await expect(page.locator('header.sticky')).toHaveCSS('position', 'sticky');
    }
  }
});

test('zero recurring bill remains editable with no receipt upload', async ({ page }) => {
  await page.goto('/dashboard?section=bills');
  await expect(page.getByText('Electricity').first()).toBeVisible();
  await expect(page.getByText(/Rs\. 0\.00/).first()).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Amount')).toHaveValue('0.00');
});
