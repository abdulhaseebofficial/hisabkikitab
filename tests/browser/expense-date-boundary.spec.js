const { test, expect } = require('@playwright/test');
require('../../scripts/require-test-database');
const en = require('../../apps/web/src/shared/i18n/locales/en.json');

for (const { timezoneId, instant, localDay } of [
  { timezoneId: 'Asia/Karachi', instant: '2026-10-04T20:30:00.000Z', localDay: '2026-10-05' },
  { timezoneId: 'America/Los_Angeles', instant: '2026-10-05T06:30:00.000Z', localDay: '2026-10-04' },
]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });

    test('a saved local-calendar expense is returned by the API and included by This month', async ({ page }, testInfo) => {
      await page.clock.setFixedTime(new Date(instant));
      await page.goto('/login');
      await page.locator('input[name="email"]').fill('demo@hisabkikitab.app');
      await page.locator('input[name="password"]').fill('demo1234');
      await page.getByRole('button', { name: en.auth.login, exact: true }).click();
      await page.waitForURL('**/dashboard');
      await page.goto('/expenses');

      const description = `Local date ${timezoneId} ${testInfo.project.name}`;
      try {
        if (page.viewportSize().width < 640) {
          await page.getByRole('button', { name: en.nav.addAnExpense }).click();
        } else {
          await page.getByRole('button', { name: /^Add expense/ }).click();
        }
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue(localDay);
        await dialog.getByLabel('Amount', { exact: true }).fill('0.10');
        await dialog.getByLabel(en.expenses.whatFor, { exact: true }).fill(description);
        const created = page.waitForResponse((response) =>
          new URL(response.url()).pathname === '/api/expenses' && response.request().method() === 'POST');
        await dialog.getByRole('button', { name: en.expenses.add, exact: true }).click();
        const response = await created;
        expect(response.status()).toBe(201);
        const body = await response.json();
        expect(body.data.expense.date.slice(0, 10)).toBe(localDay);
        expect(body.data.expense.amountMinor).toBe('10');

        const listResponse = page.waitForResponse((result) => {
          const url = new URL(result.url());
          return url.pathname === '/api/expenses' && url.searchParams.get('search') === description;
        });
        await page.getByLabel(en.expenses.searchLabel, { exact: true }).fill(description);
        const listed = await (await listResponse).json();
        expect(listed.data.items.some((row) => row._id === body.data.expense._id)).toBe(true);
        expect(listed.data.filteredTotal).toBe(0.1);
        await expect(page.locator('li').filter({ hasText: description })).toBeVisible();
      } finally {
        const row = page.locator('li').filter({ hasText: description });
        if (!page.isClosed() && await row.count()) {
          await row.getByRole('button', { name: `Delete ${description}` }).click();
          await page.getByRole('button', { name: en.common.delete, exact: true }).click();
          await expect(row).toHaveCount(0);
        }
      }
    });
  });
}
