const { test, expect } = require('@playwright/test');

test('password reset gives an honest unavailable state when mail is not configured', async ({ page }) => {
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/auth/config')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { google: { enabled: false }, passwordReset: { enabled: false } } }) });
    }
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/forgot-password');
  await expect(page.getByText('Password reset is unavailable')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/contact/');
  await expect(page.getByRole('button', { name: 'Send reset link' })).toHaveCount(0);
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'HisabKi Kitab' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
});

test('a configured Google sign-in renders the provider button', async ({ page }) => {
  await page.addInitScript(() => {
    window.google = { accounts: { id: {
      initialize: () => {},
      renderButton: (holder) => {
        const button = document.createElement('button');
        button.textContent = 'Continue with Google';
        holder.appendChild(button);
      },
    } } };
  });
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/auth/config')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { google: { enabled: true, clientId: 'test-only-client-id' }, passwordReset: { enabled: true } } }) });
    }
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('login and signup branding text meets AA contrast in both themes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-en', 'The branding panel is hidden on mobile');
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { google: { enabled: false } } }),
  }));
  await page.goto('/login/');

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('hkk-theme', value), theme);
    for (const route of ['/login/', '/register/']) {
      await page.goto(route);
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
      const contrast = await page.locator('aside').evaluate((panel) => {
        const channel = (value) => {
          const normalized = value / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        };
        const luminance = (color) => {
          const [red, green, blue] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel);
          return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        };
        const backgroundColor = getComputedStyle(panel).backgroundColor;
        const background = luminance(backgroundColor);
        const paragraphs = [...panel.querySelectorAll('p')].map((paragraph) => {
          const foregroundColor = getComputedStyle(paragraph).color;
          const foreground = luminance(foregroundColor);
          return { foregroundColor, ratio: (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05) };
        });
        return { backgroundColor, paragraphs };
      });
      const minimum = Math.min(...contrast.paragraphs.map(({ ratio }) => ratio));
      expect(contrast.paragraphs.length).toBeGreaterThanOrEqual(5);
      expect(minimum, `${route} ${theme} contrast`).toBeGreaterThanOrEqual(4.5);
      console.log(`[auth-panel-contrast] ${route} ${theme}: ${contrast.paragraphs[0].foregroundColor} on ${contrast.backgroundColor}, minimum ${minimum.toFixed(2)}:1`);
    }
  }
});
