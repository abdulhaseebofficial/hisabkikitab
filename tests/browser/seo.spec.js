const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { frontendURL } = require('../../scripts/frontend-config');

/**
 * The origin the app will actually print in its canonical tags.
 *
 * `VITE_SITE_URL` is baked into the bundle at build time from apps/web/.env, so
 * reading only `process.env` here compares the served page against whatever the
 * shell happened to export - which is how this suite came to expect
 * `http://localhost:5173/` from a dev server that had the production origin
 * compiled in. Resolve it the way vite.config.js does instead: an explicit
 * environment variable wins, then `.env.local`, then `.env`.
 */
const envOrigin = () => {
  if (process.env.VITE_SITE_URL) return process.env.VITE_SITE_URL;
  for (const name of ['.env.local', '.env']) {
    const file = path.resolve(__dirname, '../../apps/web', name);
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, 'utf8').match(/^\s*VITE_SITE_URL\s*=\s*(.*)$/m);
    const value = match && match[1].trim().replace(/^["']|["']$/g, '');
    if (value) return value;
  }
  return frontendURL;
};

const origin = (() => {
  const raw = envOrigin();
  if (!raw) return frontendURL;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname === 'hisabkikitab.com') parsed.hostname = 'www.hisabkikitab.com';
    return parsed.origin;
  } catch {
    return raw;
  }
})();
const publicUrl = (route) => new URL(route === '/' ? '/' : `${route}/`, origin).href;

test.beforeEach(async ({ page }) => {
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    if (new URL(route.request().url()).pathname === '/api/auth/config') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { google: { enabled: false }, passwordReset: { enabled: false } } }) });
    }
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}' });
  });
});

test('query parameters keep the preferred public canonical', async ({ page, baseURL }) => {
  for (const path of ['/', '/learn', '/learn/budgeting/how-to-create-a-monthly-budget', '/tools/budget-calculator', '/about']) {
    await page.goto(`${path}?utm_source=seo-test`);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', publicUrl(path));
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', publicUrl(path));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
  }
});

test('public metadata is removed on navigation to authentication and private routes', async ({ page, baseURL }) => {
  await page.goto('/learn/budgeting/how-to-create-a-monthly-budget');
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await page.goto('/login');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property^="og:"]')).toHaveCount(0);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\/$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test('unknown Learn and calculator pages are noindex without invented canonicals', async ({ page }) => {
  for (const path of ['/learn/saving/absent-guide', '/tools/absent-tool', '/not-a-public-page']) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
});

test('representative public pages expose generated SEO data and working links', async ({ page, baseURL }) => {
  const errors = [];
  const failedResponses = [];
  const failedRequests = [];
  const authRequests = [];
  const fontResponses = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()} at ${message.location().url}`); });
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/auth/')) authRequests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  page.on('requestfailed', (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    if (new URL(response.url()).pathname.endsWith('.woff2')) fontResponses.push(response.url());
  });
  const cases = [
    ['/', ['WebPage', 'WebSite', 'Organization']],
    ['/learn/budgeting', ['WebPage', 'BreadcrumbList']],
    ['/tools/budget-calculator', ['WebPage', 'WebApplication', 'BreadcrumbList']],
    ['/learn/budgeting/how-to-create-a-monthly-budget', ['WebPage', 'Article', 'BreadcrumbList']],
    ['/about', ['WebPage', 'BreadcrumbList']],
    ['/privacy', ['WebPage', 'BreadcrumbList']],
  ];
  for (const [path, expectedTypes] of cases) {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.title()).toBeTruthy();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', publicUrl(path));
    const schema = await page.locator('script[type="application/ld+json"]').textContent();
    const types = JSON.parse(schema).map((node) => node['@type']);
    for (const type of expectedTypes) expect(types, `${path}: missing ${type}`).toContain(type);
    await expect(page.locator('nav[aria-label="Product and site information"] a[href="/learn/"]')).toHaveCount(1);
  }
  const rejectAnalytics = page.getByRole('button', { name: 'Reject analytics' });
  if (await rejectAnalytics.isVisible()) await rejectAnalytics.click();
  await page.getByRole('link', { name: 'Guides', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/learn\/$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/learn/`);
  const configResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/config');
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /Welcome back|Khush aamdeed/ })).toBeVisible();
  expect((await configResponse).status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  expect(authRequests.every((request) => request === 'GET /api/auth/config')).toBe(true);
  expect(fontResponses.length).toBeGreaterThan(0);
  expect(fontResponses.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(failedResponses).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(errors).toEqual([]);
});
