const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
require('../../scripts/require-test-database');
const en = require('../../apps/web/src/shared/i18n/locales/en.json');
const { createNormalUser, deleteNormalUser, dismissAnalyticsConsent } = require('./normal-user');
test('expense form and filtered total preserve cents', async ({ page }) => {
  const locale = en;
  const account = await createNormalUser(page, 'money-browser');
  await page.goto('/expenses');
  await dismissAnalyticsConsent(page);

  const marker = `F5 exact API check ${randomUUID()}`;
  const descriptions = [`${marker} A`, `${marker} B`];
  try {
    for (const [index, amount] of ['0.10', '0.20'].entries()) {
      if (page.viewportSize().width < 640) {
        await page.getByRole('button', { name: locale.nav.addAnExpense }).click();
      } else {
        await page.getByRole('button', { name: /^Add expense/ }).first().click();
      }
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Amount', { exact: true }).fill(amount);
      await dialog.getByLabel(locale.expenses.whatFor, { exact: true }).fill(descriptions[index]);
      await dialog.getByRole('button', { name: locale.expenses.add, exact: true }).click();
      await expect(dialog).toBeHidden();
    }
    await page.getByLabel(locale.expenses.searchLabel, { exact: true }).fill(marker);
    await expect(page.getByText(/0\.30.*2 transaction/)).toBeVisible();
  } finally {
    for (const description of descriptions) {
      if (page.isClosed()) break;
      const row = page.locator('li').filter({ hasText: description });
      if (await row.count()) {
        await row.getByRole('button', { name: `Delete ${description}` }).click();
        await page.getByRole('button', { name: locale.common.delete, exact: true }).click();
        await expect(row).toHaveCount(0);
      }
    }
    await deleteNormalUser(page, account);
  }
});
