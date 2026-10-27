const { test, expect } = require('@playwright/test');

const user = (isDemo = false) => ({
  _id: isDemo ? 'demo-user' : 'theme-user',
  name: isDemo ? 'Demo User' : 'Theme Tester',
  email: isDemo ? 'demo@example.test' : 'theme@example.test',
  monthlyIncome: 75000,
  currency: 'PKR',
  university: '',
  hostelName: '',
  financeMode: 'student',
  language: 'en',
  onboardingCompleted: true,
  hasPassword: true,
  isDemo,
  theme: 'purple',
});

const envelope = (data) => ({ success: true, data });
const fulfillJson = (route, data) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(data),
});

test('authenticated light/dark switching is immediate, browser-persistent and accessible', async ({ page }) => {
  let profileWrites = 0;
  await page.addInitScript(() => { if (!localStorage.getItem('hkk-theme')) localStorage.setItem('hkk-theme', 'light'); });
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return fulfillJson(route, envelope({ user: user() }));
    if (path === '/api/profile/categories') return fulfillJson(route, envelope({ defaults: [], custom: [], all: [] }));
    if (path === '/api/notifications') return fulfillJson(route, envelope({ items: [] }));
    if (path === '/api/profile' && route.request().method() === 'PUT') profileWrites += 1;
    return fulfillJson(route, envelope({}));
  });

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(8, 27, 75)');
  expect(await page.evaluate(() => ({
    primary: getComputedStyle(document.documentElement).getPropertyValue('--brand-600').trim(),
    stored: localStorage.getItem('hkk-theme'),
    overflow: document.documentElement.scrollWidth > innerWidth,
  }))).toEqual({ primary: '20 104 255', stored: 'dark', overflow: false });
  expect(profileWrites).toBe(0);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).transitionDuration))).toBeLessThanOrEqual(0.00001);
});

test('guest preference restores across landing, login and signup pages', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('hkk-theme')) localStorage.setItem('hkk-theme', 'light'); });
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => route.fulfill({
    status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}',
  }));

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('hkk-theme'))).toBe('dark');

  for (const path of ['/login', '/register']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('cached dark theme is present while profile restore is pending', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hkk-theme', 'dark'));
  const pendingProfile = new Promise(() => {});
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') { await pendingProfile; return undefined; }
    if (path === '/api/notifications') return fulfillJson(route, envelope({ items: [] }));
    return fulfillJson(route, envelope({}));
  });

  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-600').trim())).toBe('20 104 255');
});

test('first visit follows the operating system before app hydration', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => route.fulfill({
    status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}',
  }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('blocked local storage does not crash first paint or public auth UI', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value: () => { throw new DOMException('Storage blocked', 'SecurityError'); },
      });
    }
  });
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => route.fulfill({
    status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}',
  }));

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('read-only demo theme preference remains local-only', async ({ page }) => {
  let profileWrites = 0;
  await page.addInitScript(() => { if (!localStorage.getItem('hkk-theme')) localStorage.setItem('hkk-theme', 'light'); });
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return fulfillJson(route, envelope({ user: user(true) }));
    if (path === '/api/profile/categories') return fulfillJson(route, envelope({ defaults: [], custom: [], all: [] }));
    if (path === '/api/notifications') return fulfillJson(route, envelope({ items: [] }));
    if (path === '/api/profile' && route.request().method() === 'PUT') profileWrites += 1;
    return fulfillJson(route, envelope({}));
  });

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('hkk-theme'))).toBe('dark');
  expect(profileWrites).toBe(0);
});
