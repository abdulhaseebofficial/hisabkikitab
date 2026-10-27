const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('hkk-theme')) localStorage.setItem('hkk-theme', 'light'); });
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    if (new URL(route.request().url()).pathname === '/api/auth/config') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"data":{"google":{"enabled":false}}}' });
    }
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}' });
  });
});

test('desktop branding stays fixed while signup scrolls; login entrances settle in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/register');
  const brand = page.locator('.hkk-auth-brand');
  const formPanel = page.locator('.hkk-auth-form-panel');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  const rejectAnalytics = page.getByRole('button', { name: 'Reject analytics' });
  if (await rejectAnalytics.isVisible()) await rejectAnalytics.click();
  expect(await formPanel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const brandTop = await brand.evaluate((el) => el.getBoundingClientRect().top);
  await formPanel.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  expect(await formPanel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await brand.evaluate((el) => el.getBoundingClientRect().top)).toBe(brandTop);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await formPanel.evaluate((el) => { el.scrollTop = 0; });
  await page.screenshot({ path: 'release-artifacts/auth-signup-desktop-light.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.screenshot({ path: 'release-artifacts/auth-signup-desktop-dark.png', fullPage: true, animations: 'disabled' });

  await page.goto('/login');
  await expect(page.locator('.hkk-auth-ambient span')).toHaveCount(4);
  await expect(page.locator('.hkk-auth-highlight')).toHaveCount(3);
  expect(await page.locator('.hkk-auth-headline').evaluate((el) => getComputedStyle(el).animationIterationCount)).toBe('1');
  const delays = await page.locator('.hkk-auth-highlight').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).animationDelay)));
  expect(delays[1] - delays[0]).toBeCloseTo(.15, 2);
  expect(delays[2] - delays[1]).toBeCloseTo(.15, 2);
  await page.waitForTimeout(800);
  const headlineTop = await page.locator('.hkk-auth-headline').evaluate((el) => el.getBoundingClientRect().top);
  await page.waitForTimeout(300);
  expect(await page.locator('.hkk-auth-headline').evaluate((el) => el.getBoundingClientRect().top)).toBeCloseTo(headlineTop, 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'release-artifacts/auth-login-desktop-dark.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.screenshot({ path: 'release-artifacts/auth-login-desktop-light.png', fullPage: true, animations: 'disabled' });
});

test('mobile auth uses page scrolling and reduced motion leaves text stable', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  const rejectAnalytics = page.getByRole('button', { name: 'Reject analytics' });
  if (await rejectAnalytics.isVisible()) await rejectAnalytics.click();
  await expect(page.locator('.hkk-auth-brand')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'release-artifacts/auth-login-mobile-light.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.screenshot({ path: 'release-artifacts/auth-login-mobile-dark.png', fullPage: true, animations: 'disabled' });

  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'release-artifacts/auth-signup-mobile-dark.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.screenshot({ path: 'release-artifacts/auth-signup-mobile-light.png', fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 375, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  expect(await page.locator('.hkk-auth-headline').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});
