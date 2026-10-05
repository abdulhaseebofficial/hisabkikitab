const { test, expect } = require('@playwright/test');
require('../../scripts/require-test-database');
const crypto = require('crypto');
const en = require('../../apps/web/src/shared/i18n/locales/en.json');
const ur = require('../../apps/web/src/shared/i18n/locales/roman-ur.json');

const apiBase = () => `${process.env.BROWSER_API_URL || 'http://localhost:5000'}/api`;
const registerAccount = async (account) => {
  const result = await fetch(`${apiBase()}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(account),
  });
  return result.status;
};
const navigateSection = async (page, words, name) => {
  if (page.viewportSize().width < 1024)
    await page.getByRole('button', { name: words.common.openMenu, exact: true }).click();
  const link = page.locator('aside:visible').getByRole('link', { name, exact: true });
  await link.focus();
  await link.press('Enter');
};

test('create a space, record shared costs, start a new month and join read-only', async ({ page, browser }, info) => {
  const language = info.project.name.includes('roman') ? 'roman_ur' : 'en';
  const words = language === 'en' ? en : ur;
  const s = words.shared;
  const password = 'BrowserTest123!';
  const email = `browser-${crypto.randomUUID()}@example.test`;
  expect(await registerAccount({ name: 'Browser Owner', email, password,
    confirmPassword: password, acceptTerms: true })).toBe(201);
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: en.auth.login, exact: true }).click();
  await page.waitForURL('**/onboarding');
  await page.getByRole('button', { name: /Shared Living/ }).click();
  if (language === 'roman_ur') await page.getByRole('button', { name: /Roman Urdu/ }).click();
  await page.getByRole('button', { name: s.finishSetup }).click();
  await expect(page.getByText(s.emptySpaces)).toBeVisible();

  await page.getByRole('button', { name: s.createSpace, exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(s.name, { exact: true }).fill('Browser Flat');
  await dialog.getByLabel(s.members, { exact: true }).fill('Ali, Bilal');
  await expect(dialog.getByLabel(s.budget, { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: s.save, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Browser Flat' })).toBeVisible();
  const code = await page.getByLabel(s.code, { exact: true }).inputValue();
  expect(code).toMatch(/^[A-Z2-9]{7}$/);
  await page.getByRole('button', { name: s.dismiss, exact: true }).click();
  const currentMonth = await page.getByLabel(s.month, { exact: true }).inputValue();
  const tab = (name) => navigateSection(page, words, name);

  await tab(s.members);
  await expect(page.getByRole('heading', { name: /Ali/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Bilal/ })).toBeVisible();
  await expect(page.getByLabel(s.month, { exact: true })).toHaveCount(0);

  await tab(s.payments);
  for (const [name, amount] of [['Ali', '50'], ['Bilal', '25']]) {
    await page.getByRole('button', { name: s.add_payments, exact: true }).click();
    await dialog.getByLabel(s.member_id, { exact: true }).selectOption({ label: name });
    await dialog.getByLabel(s.amount, { exact: true }).fill(amount);
    await dialog.getByRole('button', { name: s.save, exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }

  await tab(s.daily);
  await page.getByRole('button', { name: s.add_expenses, exact: true }).click();
  await dialog.getByLabel(s.amount, { exact: true }).fill('10.01');
  await expect(dialog.getByText(s.splitSimpleHint)).toBeVisible();
  await dialog.getByRole('button', { name: s.save, exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await tab(s.bills);
  await page.getByRole('button', { name: s.add_bills, exact: true }).click();
  await dialog.getByLabel(s.category_id, { exact: true }).selectOption({ label: s.categories.rent });
  await dialog.getByLabel(s.name, { exact: true }).fill('Rent');
  await dialog.getByLabel(s.amount, { exact: true }).fill('20');
  await dialog.getByLabel(s.method, { exact: true }).selectOption('custom');
  await dialog.getByLabel(`Ali · ${s.custom}`, { exact: true }).fill('12');
  await dialog.getByLabel(`Bilal · ${s.custom}`, { exact: true }).fill('8');
  await dialog.getByRole('button', { name: s.save, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rent' })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);

  await tab(words.nav.dashboard);
  await expect(page.getByText('Rs. 30.01').first()).toBeVisible();
  const reportPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: s.downloadReport }).click();
  expect((await reportPromise).suggestedFilename()).toContain(`${currentMonth}.csv`);
  await page.getByRole('button', { name: s.next, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rent' })).toHaveCount(0);
  await tab(s.bills);
  await expect(page.getByRole('heading', { name: 'Rent' })).toBeVisible();
  await expect(page.getByText('Rs. 0.00').first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Rent' })).toBeVisible();
  await tab(words.nav.dashboard);
  await page.getByRole('button', { name: s.previous, exact: true }).click();
  await expect(page.getByText('Rs. 30.01').first()).toBeVisible();
  await tab(s.manageSpace);
  await page.getByRole('button', { name: s.closeMonth, exact: true }).click();
  await expect(page.getByRole('button', { name: s.reopenMonth, exact: true })).toBeVisible();
  await page.getByRole('button', { name: s.reopenMonth, exact: true }).click();
  await tab(s.activity);
  await expect(page.getByRole('region', { name: s.activity })).toBeVisible();

  const viewer = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport });
  const reader = await viewer.newPage();
  try {
    const viewerEmail = `viewer-${crypto.randomUUID()}@example.test`;
    expect(await registerAccount({ name: 'Browser Viewer', email: viewerEmail, password,
      confirmPassword: password, acceptTerms: true })).toBe(201);
    await reader.goto('/login');
    await reader.locator('input[name="email"]').fill(viewerEmail);
    await reader.locator('input[name="password"]').fill(password);
    await reader.getByRole('button', { name: en.auth.login, exact: true }).click();
    await reader.waitForURL('**/onboarding');
    const response = await reader.request.post('/api/profile/onboarding', {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { financeMode: 'shared_living', language, currency: 'PKR', monthlyIncome: 0 },
    });
    expect(response.status()).toBe(200);
    await reader.goto('/dashboard');
    await reader.getByRole('button', { name: s.join, exact: true }).first().click();
    await reader.getByRole('dialog').getByLabel(s.code, { exact: true }).fill(code.toLowerCase());
    await reader.getByRole('dialog').getByRole('button', { name: s.save, exact: true }).click();
    await expect(reader.getByRole('dialog')).not.toBeVisible();
    await navigateSection(reader, words, s.bills);
    await expect(reader.getByRole('button', { name: s.add_bills, exact: true })).toHaveCount(0);
    await expect(reader.getByRole('button', { name: s.edit, exact: true })).toHaveCount(0);
    await reader.reload();
    await expect(reader.getByRole('button', { name: s.add_bills, exact: true })).toHaveCount(0);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    let deleteDialog = page.getByRole('dialog');
    await deleteDialog.getByLabel(words.settings.typePasswordToConfirm, { exact: true }).fill(password);
    await deleteDialog.getByRole('button', { name: 'Delete forever', exact: true }).click();
    await expect(deleteDialog.getByRole('alert')).toContainText(s.ownerTransferBeforeDelete);
    await deleteDialog.getByRole('button', { name: words.settings.manageSharedSpaces, exact: true }).click();
    await expect(page.getByRole('region', { name: s.manage })).toBeVisible();
    await expect(page).toHaveURL(/section=manage/);
    await expect(page.getByText(`${s.currentOwner}: Browser Owner`)).toBeVisible();
    await page.getByLabel(s.newOwner, { exact: true }).selectOption({ label: 'Browser Viewer' });
    await page.getByRole('button', { name: s.transferOwnership, exact: true }).click();
    const confirm = page.getByRole('dialog').last();
    await expect(confirm).toContainText('Browser Viewer');
    await confirm.getByRole('button', { name: s.confirmTransfer, exact: true }).click();
    await expect(page.getByText(`${s.currentOwner}: Browser Viewer`)).toBeVisible();
    await page.getByRole('button', { name: s.leaveSpace, exact: true }).click();
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    deleteDialog = page.getByRole('dialog');
    await deleteDialog.getByLabel(words.settings.typePasswordToConfirm, { exact: true }).fill(password);
    await deleteDialog.getByRole('button', { name: 'Delete forever', exact: true }).click();
    await expect(page).toHaveURL(/\/login(?:$|\?)/);
  } finally {
    await viewer.close();
  }
});
