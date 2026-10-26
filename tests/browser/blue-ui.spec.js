const { test, expect } = require('@playwright/test');

const apiEnvelope = (data) => ({ success: true, data });
const testUser = {
  _id: 'local-ui-test-user',
  name: 'Test User',
  email: 'user@example.test',
  monthlyIncome: 100000,
  currency: 'PKR',
  university: '',
  hostelName: '',
  financeMode: 'student',
  language: 'en',
  onboardingCompleted: true,
  hasPassword: true,
  isDemo: false,
};

const dashboard = {
  monthLabel: 'October 2026',
  totals: { income: 100000, plannedIncome: 100000, incomeLogged: 100000, spent: 40000, remaining: 60000, spentPercent: 40, dailyAverage: 1300, safeDailySpend: 2000, daysLeftInMonth: 12, expenseCount: 18 },
  categoryBreakdown: [], trend: [], comparison: { previousMonthSpent: 30000, changePercent: 33 },
  budgets: [], goals: [], recentExpenses: [],
  debts: { payable: 0, receivable: 0, netBalance: 0, overdue: 0, dueSoon: [] },
  upcomingBills: [],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hkk-theme', 'light'));
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    if (new URL(route.request().url()).pathname === '/api/auth/config') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiEnvelope({ google: { enabled: false } })) });
    }
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}' });
  });
});

test('homepage controls update the illustrative phone and respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Make sense of your money/ })).toBeVisible();
  await expect(page.locator('.hkk-phone')).toHaveAttribute('aria-label', 'Individual sample finance preview');
  await expect(page.locator('.hkk-preview-control')).toHaveCount(0);
  await page.waitForTimeout(2700);
  await expect(page.locator('.hkk-phone')).toHaveAttribute('aria-label', 'Individual sample finance preview');

  for (const [index, mode] of ['Individual', 'Household', 'Shared Living'].entries()) {
    await page.locator('.hkk-mode-card').nth(index).click();
    await expect(page.locator('.hkk-phone')).toHaveAttribute('aria-label', `${mode} sample finance preview`);
    await expect(page.locator('.hkk-mode-card').nth(index)).toHaveAttribute('aria-pressed', 'true');
  }

  const stopped = await page.locator('.hkk-phone').getAttribute('aria-label');
  await page.waitForTimeout(2700);
  await expect(page.locator('.hkk-phone')).toHaveAttribute('aria-label', stopped);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await page.locator('.hkk-phone').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.hkk-phone').getAttribute('aria-label'), { timeout: 4500 }).not.toBe('Individual sample finance preview');
  await page.locator('.hkk-mode-card').first().click();
  await page.waitForTimeout(2700);
  await expect(page.locator('.hkk-phone')).toHaveAttribute('aria-label', 'Individual sample finance preview');
});

test('phone hardware and finance cards animate once without blocking reduced motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-en', 'Hover motion is verified in the desktop browser project');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.hkk-mode-list')).toHaveClass(/is-entered/);
  const entrance = await page.locator('.hkk-mode-card').evaluateAll((cards) => cards.map((card) => ({
    name: getComputedStyle(card).animationName,
    delay: getComputedStyle(card).animationDelay,
  })));
  // One card per finance mode, each entering once, staggered by 0.14s. Derived
  // from the rendered count so adding a mode does not look like a motion bug,
  // while every name and delay is still asserted exactly.
  expect(entrance.length).toBe(4);
  expect(entrance).toEqual(entrance.map((_, index) => ({
    name: 'hkk-card-enter',
    delay: index === 0 ? '0s' : `${(index * 0.14).toFixed(2)}s`,
  })));
  await page.waitForTimeout(1000);

  const card = page.locator('.hkk-mode-card').nth(1);
  const before = await card.boundingBox();
  const iconBefore = await card.locator('.hkk-mode-icon').boundingBox();
  await card.hover();
  await page.waitForTimeout(300);
  const after = await card.boundingBox();
  const iconAfter = await card.locator('.hkk-mode-icon').boundingBox();
  expect(before.y - after.y).toBeGreaterThan(3.5);
  expect(before.y - after.y).toBeLessThan(4.5);
  expect(iconBefore.y - iconAfter.y).toBeGreaterThan(5.5);
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.hkk-phone')).toHaveAttribute('aria-label', 'Household sample finance preview');
  const selected = await page.evaluate(() => ({
    notch: getComputedStyle(document.querySelector('.hkk-phone-notch')).backgroundColor,
    screen: getComputedStyle(document.querySelector('.hkk-phone-screen')).animationName,
    chart: getComputedStyle(document.querySelector('.hkk-phone-chart span')).animationName,
    savings: getComputedStyle(document.querySelector('.hkk-phone-panel .bg-brand-600')).animationName,
  }));
  expect(selected).toEqual({ notch: 'rgb(5, 6, 9)', screen: 'hkk-preview-swap', chart: 'hkk-chart-grow', savings: 'hkk-progress-grow' });

  await page.evaluate(() => {
    window.cardEntranceRestarts = 0;
    document.querySelectorAll('.hkk-mode-card').forEach((item) => item.addEventListener('animationstart', (event) => {
      if (event.animationName === 'hkk-card-enter') window.cardEntranceRestarts += 1;
    }));
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect(page.locator('.hkk-hero-visual')).toHaveClass(/is-offscreen/);
  expect(await page.locator('.hkk-visual-glow').evaluate((glow) => getComputedStyle(glow).animationPlayState)).toBe('paused');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.hkk-hero-visual')).not.toHaveClass(/is-offscreen/);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.cardEntranceRestarts)).toBe(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const reducedCard = page.locator('.hkk-mode-card').nth(1);
  await expect(reducedCard).toBeVisible();
  const reducedBefore = await reducedCard.boundingBox();
  await reducedCard.hover();
  const reducedAfter = await reducedCard.boundingBox();
  await reducedCard.focus();
  const reduced = await page.evaluate(() => ({
    card: getComputedStyle(document.querySelectorAll('.hkk-mode-card')[1]).animationName,
    screen: getComputedStyle(document.querySelector('.hkk-phone-screen')).animationName,
    chart: getComputedStyle(document.querySelector('.hkk-phone-chart span')).animationName,
    outline: getComputedStyle(document.querySelectorAll('.hkk-mode-card')[1]).outlineStyle,
  }));
  expect(reducedBefore.y - reducedAfter.y).toBe(0);
  expect(reduced).toEqual({ card: 'none', screen: 'none', chart: 'none', outline: 'solid' });
});

test('homepage fits desktop, tablet, Android and iPhone widths and links to real routes', async ({ page }) => {
  for (const width of [1440, 820, 393, 375]) {
    await page.setViewportSize({ width, height: width < 500 ? 812 : 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Make sense of your money/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.hkk-hero').evaluate((el) => {
      const box = el.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth + 1;
    })).toBe(true);
    await expect(page.locator('.hkk-mode-card')).toHaveCount(4);
    expect(await page.locator('.hkk-phone-screen').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    const reject = page.getByRole('button', { name: 'Reject analytics' });
    if (await reject.isVisible()) await reject.click();
    await page.screenshot({ path: `release-artifacts/blue-ui-${width}.png`, fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: `release-artifacts/blue-ui-${width}-dark.png`, fullPage: true, animations: 'disabled' });
  }

  await expect(page.getByRole('link', { name: 'Start Managing Your Money' })).toHaveAttribute('href', '/register/');
  await expect(page.getByRole('link', { name: 'Sign In', exact: true })).toHaveAttribute('href', '/login/');
  await expect(page.getByRole('link', { name: 'Browse all guides' })).toHaveAttribute('href', '/learn/');
  await expect(page.getByRole('link', { name: 'Explore financial tools' })).toHaveAttribute('href', '/tools/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile public navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'Get started' }).last().click();
  await expect(page).toHaveURL(/\/register\/?$/);
  await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible();
});

test('homepage finance cards render left of the phone on desktop and below it on mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 820, 393, 375]) {
    await page.setViewportSize({ width, height: width < 500 ? 812 : 1000 });
    await page.goto('/');
    await expect(page.locator('.hkk-mode-card')).toHaveCount(4);

    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
      const layout = await page.evaluate(() => {
        const bounds = (element) => {
          const { left, right, top, bottom } = element.getBoundingClientRect();
          return { left, right, top, bottom };
        };
        return {
          copy: bounds(document.querySelector('.hkk-hero-copy')),
          cards: [...document.querySelectorAll('.hkk-mode-card')].map(bounds),
          phone: bounds(document.querySelector('.hkk-phone')),
          hero: bounds(document.querySelector('.hkk-hero')),
          documentWidth: document.documentElement.scrollWidth,
        };
      });
      const cardLeft = Math.min(...layout.cards.map((card) => card.left));
      const cardRight = Math.max(...layout.cards.map((card) => card.right));
      const cardTop = Math.min(...layout.cards.map((card) => card.top));
      expect(layout.documentWidth).toBeLessThanOrEqual(width);
      expect(layout.phone.left).toBeGreaterThanOrEqual(layout.hero.left);
      expect(layout.phone.right).toBeLessThanOrEqual(layout.hero.right);
      if (width === 1440) {
        expect(layout.copy.right).toBeLessThan(cardLeft);
        expect(cardRight).toBeLessThan(layout.phone.left);
      } else if (width === 820) {
        expect(layout.copy.bottom).toBeLessThan(layout.phone.top);
        expect(cardRight).toBeLessThan(layout.phone.left);
      } else {
        expect(layout.copy.bottom).toBeLessThan(layout.phone.top);
        expect(layout.phone.bottom).toBeLessThan(cardTop);
      }
    }
  }
});

test('iPhone 12 preview keeps its proportions and the complete dashboard visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height, phoneWidth] of [[1440, 900, 250], [1280, 720, 250], [820, 1180, 240], [390, 844, 250], [375, 667, 250]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
      for (let mode = 0; mode < 3; mode += 1) {
        await page.locator('.hkk-mode-card').nth(mode).click();
        const layout = await page.evaluate(() => {
          const bounds = (selector) => document.querySelector(selector).getBoundingClientRect();
          const phone = document.querySelector('.hkk-phone');
          const screen = document.querySelector('.hkk-phone-screen');
          return {
            phone: bounds('.hkk-phone'), notch: bounds('.hkk-phone-notch'),
            screen: bounds('.hkk-phone-screen'),
            activity: bounds('.hkk-phone-activity'), navigation: bounds('.hkk-phone-nav'),
            frameBorder: getComputedStyle(phone).borderLeftWidth,
            screenBorder: getComputedStyle(screen).borderLeftWidth,
            screenOverflowX: screen.scrollWidth - screen.clientWidth,
            screenOverflowY: screen.scrollHeight - screen.clientHeight,
            documentWidth: document.documentElement.scrollWidth,
          };
        });
        expect(layout.phone.width).toBeCloseTo(phoneWidth, 0);
        expect(layout.phone.height / layout.phone.width).toBeCloseTo(146.7 / 71.5, 2);
        expect(layout.frameBorder).toBe('3px');
        expect(layout.screenBorder).toBe('0px');
        expect(layout.notch.width).toBeGreaterThanOrEqual(100);
        expect(layout.notch.width).toBeLessThanOrEqual(120);
        expect(layout.screenOverflowX).toBeLessThanOrEqual(1);
        expect(layout.screenOverflowY).toBeLessThanOrEqual(1);
        expect(layout.navigation.top).toBeGreaterThanOrEqual(layout.activity.bottom);
        expect(layout.navigation.bottom).toBeLessThanOrEqual(layout.screen.bottom);
        expect(layout.documentWidth).toBeLessThanOrEqual(width);
      }
    }
  }
});

test('demo preview stays public, fictional and isolated from finance APIs', async ({ page }) => {
  const apiRequests = [];
  await page.unrouteAll();
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    apiRequests.push(new URL(route.request().url()).pathname);
    if (new URL(route.request().url()).pathname === '/api/auth/config') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiEnvelope({ google: { enabled: false } })) });
    }
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}' });
  });

  await page.goto('/login');
  await page.getByRole('link', { name: 'Explore Demo Preview' }).click();
  await expect(page).toHaveURL(/\?demo=preview#finance-preview$/);
  await expect(page.getByText('Demo Preview Mode')).toBeVisible();
  await expect(page.getByText(/No account or session is created/)).toBeVisible();
  await expect(page.locator('.hkk-phone')).toContainText('Illustrative PKR figures');
  await expect(page.locator('.hkk-phone-actions button')).toHaveCount(2);
  await expect(page.locator('.hkk-phone-actions button').first()).toBeDisabled();
  await expect(page.locator('.hkk-phone-actions button').last()).toBeDisabled();
  await expect(page.locator('.hkk-phone-nav a')).toHaveCount(0);
  for (const mode of ['Individual', 'Household', 'Shared Living']) {
    await page.locator('.hkk-mode-card').filter({ hasText: mode }).click();
    await expect(page.locator('.hkk-phone')).toHaveAttribute('aria-label', `${mode} sample finance preview`);
  }
  expect(apiRequests.every((path) => path === '/api/auth/config')).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /token|demo/i.test(key)))).toEqual([]);
  const rejectAnalytics = page.getByRole('button', { name: 'Reject analytics' });
  if (await rejectAnalytics.isVisible()) await rejectAnalytics.click();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `release-artifacts/demo-preview-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await page.screenshot({ path: `release-artifacts/demo-preview-${width}-dark.png`, fullPage: true });
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
  }
  await page.getByRole('link', { name: 'Exit preview and sign in' }).click();
  await expect(page).toHaveURL(/\/login\/?$/);
  expect(apiRequests.every((path) => path === '/api/auth/config')).toBe(true);
});

test('normal login renders dashboard, restores session and logs out with existing API contract', async ({ page }) => {
  let signedIn = false;
  let loginPosts = 0;
  let logoutPosts = 0;
  await page.unrouteAll();
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let data = {};
    if (path === '/api/auth/config') data = { google: { enabled: false } };
    else if (path === '/api/auth/login' && req.method() === 'POST') {
      signedIn = true; loginPosts += 1; data = { user: testUser, accessToken: 'local-test-token' };
    } else if (path === '/api/auth/me') {
      if (!signedIn) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}' });
      data = { user: testUser };
    } else if (path === '/api/auth/logout' && req.method() === 'POST') {
      signedIn = false; logoutPosts += 1;
    } else if (path === '/api/dashboard/summary') data = dashboard;
    else if (path === '/api/profile/categories') data = { defaults: [], custom: [], all: [] };
    else if (path === '/api/notifications') data = { items: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiEnvelope(data)) });
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill('user@example.test');
  await page.locator('input[name="password"]').fill('local-test-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await expect(page.getByText('Income minus spending')).toBeVisible();
  expect(loginPosts).toBe(1);
  expect(await page.evaluate(() => document.body.innerText.includes('Rs 60,000'))).toBe(true);

  await page.reload();
  await expect(page.getByText('Income minus spending')).toBeVisible();
  await page.getByRole('button', { name: /^TU(?: Test)?$/ }).click({ timeout: 5000 });
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login\/?$/);
  expect(logoutPosts).toBe(1);
});

test('normal login reports rejected credentials and network failure without creating a session', async ({ page }) => {
  let networkFailure = false;
  let financeRequests = 0;
  await page.unrouteAll();
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/config') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiEnvelope({ google: { enabled: false } })) });
    }
    if (path === '/api/auth/login' && networkFailure) return route.abort('failed');
    if (path === '/api/auth/login') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Invalid email or password"}' });
    }
    financeRequests += 1;
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}' });
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill('user@example.test');
  await page.locator('input[name="password"]').fill('incorrect-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await expect(page).toHaveURL(/\/login\/?$/);

  networkFailure = true;
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Cannot reach the server. Is the backend running?')).toBeVisible();
  await expect(page).toHaveURL(/\/login\/?$/);
  expect(financeRequests).toBe(0);
});

test('expired session is rejected and redirects a protected route to login', async ({ page }) => {
  const requests = [];
  await page.unrouteAll();
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Session expired"}' });
  });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\/?$/);
  expect(requests).toContain('/api/auth/me');
  expect(requests).toContain('/api/auth/refresh');
  expect(requests.every((path) => path.startsWith('/api/auth/'))).toBe(true);
});
