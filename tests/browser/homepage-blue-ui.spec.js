const { test, expect } = require('@playwright/test');

const apiEnvelope = (data) => ({ success: true, data });

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
  expect(entrance).toEqual([
    { name: 'hkk-card-enter', delay: '0s' },
    { name: 'hkk-card-enter', delay: '0.14s' },
    { name: 'hkk-card-enter', delay: '0.28s' },
  ]);
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
    await expect(page.locator('.hkk-mode-card')).toHaveCount(3);
    expect(await page.locator('.hkk-phone-screen').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    const reject = page.getByRole('button', { name: 'Reject analytics' });
    if (await reject.isVisible()) await reject.click();
    await page.screenshot({ path: `release-artifacts/blue-ui-${width}.png`, fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Use dark theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
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
    await expect(page.locator('.hkk-mode-card')).toHaveCount(3);

    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Use dark theme' }).click();
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
        expect(layout.cards[0].right - layout.cards[0].left).toBeCloseTo(196, 0);
      } else if (width === 820) {
        expect(layout.copy.bottom).toBeLessThan(layout.phone.top);
        expect(cardRight).toBeLessThan(layout.phone.left);
        expect(layout.cards[0].right - layout.cards[0].left).toBeCloseTo(196, 0);
      } else {
        expect(layout.copy.bottom).toBeLessThan(layout.phone.top);
        expect(layout.phone.bottom).toBeLessThan(cardTop);
      }
    }
  }
});

test('official logo loads and blue theme follows and persists the visitor preference', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => route.fulfill({
    status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}',
  }));
  await page.goto(baseURL);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('.hkk-phone-top img')).toBeVisible();
  await expect.poll(() => page.locator('.hkk-phone-top img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  const initial = await page.evaluate(() => ({
    background: document.documentElement.style.backgroundColor,
    brand: getComputedStyle(document.documentElement).getPropertyValue('--brand-600').trim(),
    logoLoaded: document.querySelector('.hkk-phone-top img')?.naturalWidth > 0,
  }));
  expect(initial).toEqual({ background: 'rgb(8, 27, 75)', brand: '20 104 255', logoLoaded: true });

  await page.getByRole('button', { name: 'Use light theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('hkk-theme'))).toBe('light');
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-600').trim())).toBe('20 104 255');
  await context.close();
});

test('iPhone 12 preview keeps its proportions and the complete dashboard visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height, phoneWidth] of [[1440, 900, 250], [1280, 720, 250], [820, 1180, 240], [390, 844, 250], [375, 667, 250]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Use dark theme' }).click();
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
