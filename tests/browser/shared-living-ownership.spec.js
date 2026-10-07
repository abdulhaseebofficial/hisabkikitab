const { test, expect } = require('@playwright/test');
require('../../scripts/require-test-database');
const crypto = require('node:crypto');
const en = require('../../apps/web/src/shared/i18n/locales/en.json');
const ur = require('../../apps/web/src/shared/i18n/locales/roman-ur.json');

const apiBase = () => `${process.env.BROWSER_API_URL || 'http://localhost:5000'}/api`;
const api = async (method, path, body, token) => {
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(method === 'POST' && path === '/profile/onboarding' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};

test('owner can transfer, leave and retry account deletion on desktop and mobile', async ({ page }, info) => {
  const language = info.project.name.includes('roman') ? 'roman_ur' : 'en';
  const words = language === 'en' ? en : ur;
  const password = 'BrowserTest123!';
  const account = async (name) => {
    const email = `owner-exit-${crypto.randomUUID()}@example.test`;
    const registered = await api('POST', '/auth/register', {
      name, email, password, confirmPassword: password, acceptTerms: true,
    });
    expect(registered.status).toBe(201);
    const token = registered.body.data.accessToken;
    const onboarded = await api('POST', '/profile/onboarding', {
      financeMode: 'shared_living', language, currency: 'PKR', monthlyIncome: 0,
    }, token);
    expect(onboarded.status).toBe(200);
    return { name, email, token };
  };

  const owner = await account('Exit Flow Owner');
  const successor = await account('Exit Flow Successor');
  const month = new Date().toISOString().slice(0, 7);
  const created = await api('POST', '/shared-living/spaces', {
    name: 'Owner Exit Flow', currency: 'PKR', month, residents: 1, members: ['Resident'],
  }, owner.token);
  expect(created.status).toBe(200);
  const space = created.body.data;
  expect((await api('POST', '/shared-living/join', { code: space.invite.code }, successor.token)).status).toBe(200);

  await page.goto('/login');
  await page.locator('input[name="email"]').fill(owner.email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: en.auth.login, exact: true }).click();
  await page.waitForURL('**/dashboard');

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const deletion = page.getByRole('dialog');
  await deletion.getByLabel(words.settings.typePasswordToConfirm, { exact: true }).fill(password);
  await deletion.getByRole('button', { name: 'Delete forever', exact: true }).click();
  await expect(deletion.getByRole('alert')).toContainText(words.shared.ownerTransferBeforeDelete);
  await deletion.getByRole('button', { name: words.settings.manageSharedSpaces, exact: true }).click();

  const manage = page.getByRole('region', { name: words.shared.manage });
  await expect(manage).toBeVisible();
  await expect(page.getByText(`${words.shared.currentOwner}: ${owner.name}`)).toBeVisible();
  await expect(page.getByText(words.shared.transferBeforeLeave)).toBeVisible();
  await expect(page.getByRole('button', { name: words.shared.leaveSpace, exact: true })).toBeDisabled();
  const successorSelect = page.getByLabel(words.shared.newOwner, { exact: true });
  await successorSelect.selectOption({ label: successor.name });
  await expect(successorSelect).not.toHaveValue('');
  const transfer = page.getByRole('button', { name: words.shared.transferOwnership, exact: true });
  await expect(transfer).toBeEnabled();
  await transfer.click();
  let confirmation = page.getByRole('dialog').last();
  await expect(confirmation).toContainText(successor.name);
  expect((await api('DELETE', `/shared-living/spaces/${space.id}/membership`, undefined, successor.token)).status).toBe(200);
  await confirmation.getByRole('button', { name: words.shared.confirmTransfer, exact: true }).click();
  await expect(manage.getByRole('alert')).toContainText(words.shared.successorUnavailable);
  await expect(page.getByText(words.shared.noEligibleSuccessor)).toBeVisible();
  expect((await api('POST', '/shared-living/join', { code: space.invite.code }, successor.token)).status).toBe(200);
  await page.reload();
  await expect(manage).toBeVisible();
  await page.getByLabel(words.shared.newOwner, { exact: true }).selectOption({ label: successor.name });
  await transfer.click();
  confirmation = page.getByRole('dialog').last();
  await expect(confirmation).toContainText(successor.name);
  await confirmation.getByRole('button', { name: words.shared.confirmTransfer, exact: true }).click();
  await expect(page.getByText(`${words.shared.currentOwner}: ${successor.name}`)).toBeVisible();
  await page.getByRole('button', { name: words.shared.leaveSpace, exact: true }).click();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const retry = page.getByRole('dialog');
  await retry.getByLabel(words.settings.typePasswordToConfirm, { exact: true }).fill(password);
  await retry.getByRole('button', { name: 'Delete forever', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:$|\?)/);
});
