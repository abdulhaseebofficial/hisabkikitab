const { test, expect } = require('@playwright/test');
const crypto = require('crypto');
const en = require('../../apps/web/src/shared/i18n/locales/en.json');
const ur = require('../../apps/web/src/shared/i18n/locales/roman-ur.json');

const apiBase = () => `${process.env.BROWSER_API_URL || 'http://localhost:5000'}/api`;
const registerAccount = async (account) => {
  const result = await fetch(`${apiBase()}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(account),
  });
  return { status: result.status, body: await result.text() };
};

test('create, manage, contribute, split, join read-only and restore the group', async ({ page, browser }, info) => {
  const language = info.project.name.includes('roman') ? 'roman_ur' : 'en';
  const words = language === 'en' ? en : ur;
  const s = words.shared;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const password = 'BrowserTest123!';
  const email = `browser-${crypto.randomUUID()}@example.test`;
  let response = await registerAccount({ name: 'Browser Owner', email, password, confirmPassword: password, acceptTerms: true });
  expect(response.status).toBe(201);
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: en.auth.login, exact: true }).click();
  // Follow the app's authenticated redirect. Navigating manually here races
  // the login response and can send the request through a stale auth context.
  await page.waitForURL('**/onboarding', { timeout: 20000 });
  await expect(page.getByRole('button', { name: /Shared Living/ })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /Shared Living/ }).click();
  if (language === 'roman_ur') {
    await page.getByRole('button', { name: /Roman Urdu/ }).click();
    await expect(page.getByRole('button', { name: s.finishSetup })).toBeVisible();
  }
  await page.getByRole('button', { name: s.finishSetup }).click();
  await expect(page.getByText(s.emptySpaces)).toBeVisible();
  await page.getByRole('button', { name: s.createSpace, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(s.name, { exact: true }).fill('Browser Flat');
  await dialog.getByLabel(s.budget, { exact: true }).fill('1000');
  await dialog.getByLabel(s.food_budget, { exact: true }).fill('500');
  await dialog.getByLabel(s.month, { exact: true }).fill('2024-02');
  await dialog.getByLabel(s.residents, { exact: true }).fill('2');
  await dialog.getByRole('button', { name: s.save, exact: true }).click();
  await expect(page.getByText(s.admin, { exact: true })).toBeVisible();
  const code = await page.getByLabel(s.code, { exact: true }).inputValue();
  expect(code).toMatch(/^[\w-]{43}$/);
  await page.getByRole('button', { name: s.dismiss, exact: true }).click();
  const tab = async (name) => { await page.getByRole('tab', { name, exact: true }).click(); };
  await tab(s.members);
  for (const name of ['Ali', 'Bilal']) {
    await page.getByRole('button', { name: s.addMember, exact: true }).click();
    await dialog.getByLabel(s.name, { exact: true }).fill(name);
    await dialog.getByRole('button', { name: s.save, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('heading', { name: new RegExp(name) })).toBeVisible();
  }
  await tab(s.payments);
  for (const [name, amount] of [['Ali', '50'], ['Bilal', '25']]) {
    await page.getByRole('button', { name: s.add_payments, exact: true }).click();
    await dialog.getByLabel(s.member_id, { exact: true }).selectOption({ label: name });
    await dialog.getByLabel(s.amount, { exact: true }).fill(amount);
    await dialog.getByRole('button', { name: s.save, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await tab(s.daily);
  await page.getByRole('button', { name: s.add_expenses, exact: true }).click();
  await dialog.getByLabel(s.amount, { exact: true }).fill('10.01');
  await dialog.getByRole('button', { name: s.preview, exact: true }).click();
  await expect(dialog.getByText(/Ali.*PKR/)).toBeVisible();
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
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rent', exact: true })).toBeVisible();
  await tab(s.overview);
  await expect(page.getByText('PKR 969.99', { exact: true })).toBeVisible();
  await expect(page.getByText('PKR 64.99', { exact: true })).toBeVisible();
  // Keyboard navigation and a correctly labelled active panel.
  await page.getByRole('tab', { name: s.overview, exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tabpanel', { name: s.daily })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(s.month, { exact: true })).toHaveValue('2024-02');
  await expect(page.getByText(s.admin, { exact: true })).toBeVisible();
  await expect(page.getByText('PKR 969.99', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('shared-living.png'), fullPage: true });

  const viewer = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport });
  const reader = await viewer.newPage();
  try {
    const viewerEmail = `viewer-${crypto.randomUUID()}@example.test`;
    response = await registerAccount({ name: 'Browser Viewer', email: viewerEmail, password, confirmPassword: password, acceptTerms: true });
    expect(response.status).toBe(201);
    await reader.goto('/login');
    await reader.locator('input[name="email"]').fill(viewerEmail);
    await reader.locator('input[name="password"]').fill(password);
    await reader.getByRole('button', { name: en.auth.login, exact: true }).click();
    await reader.waitForURL('**/onboarding', { timeout: 20000 });
    response = await reader.request.post('/api/profile/onboarding', { data: { financeMode: 'shared_living', language, currency: 'PKR', monthlyIncome: 0 } });
    expect(response.status()).toBe(200);
    await reader.goto('/dashboard');
    await reader.getByRole('button', { name: s.join, exact: true }).click();
    await reader.getByRole('dialog').getByLabel(s.code, { exact: true }).fill('invalid');
    await reader.getByRole('dialog').getByRole('button', { name: s.save, exact: true }).click();
    await expect(reader.getByRole('dialog').getByRole('alert')).toHaveText(s.invalidCode);
    await reader.getByRole('dialog').getByLabel(s.code, { exact: true }).fill(code);
    await reader.getByRole('dialog').getByRole('button', { name: s.save, exact: true }).click();
    await expect(reader.getByRole('dialog')).not.toBeVisible();
    await reader.getByLabel(s.month, { exact: true }).fill('2024-02');
    await expect(reader.getByText(s.viewOnly, { exact: true })).toBeVisible();
    for (const name of [s.daily, s.bills, s.members, s.payments, s.manage]) {
      await reader.getByRole('tab', { name, exact: true }).click();
      for (const forbidden of [s.add_expenses, s.add_bills, s.addMember, s.add_payments, s.edit, s.remove, s.preview, s.regenerate, s.disableCode, s.closeMonth, s.editBudget]) {
        await expect(reader.getByRole('button', { name: forbidden, exact: true })).toHaveCount(0);
      }
    }
    await reader.reload();
    await expect(reader.getByText(s.viewOnly, { exact: true })).toBeVisible();
    await expect(reader.getByText('PKR 969.99', { exact: true })).toBeVisible();
    const snapshot = await reader.request.get('/api/shared-living/spaces');
    const group = (await snapshot.json()).data[0];
    response = await reader.request.post(`/api/shared-living/spaces/${group.id}/months/2024-02/payments`, { data: { amount: '1' } });
    expect(response.status()).toBe(403);
  } finally { await viewer.close(); }
  expect(errors).toEqual([]);
});
