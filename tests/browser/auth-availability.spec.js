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
  await expect(page.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/contact');
  await expect(page.getByRole('button', { name: 'Send reset link' })).toHaveCount(0);
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Hisabki Kitab' })).toBeVisible();
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
