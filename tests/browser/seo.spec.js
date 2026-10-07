const { test, expect } = require('@playwright/test');
const { frontendURL } = require('../../scripts/frontend-config');
const origin = process.env.VITE_SITE_URL || frontendURL;

test.beforeEach(async ({ page }) => {
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    if (new URL(route.request().url()).pathname === '/api/auth/config') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { google: { enabled: false }, passwordReset: { enabled: false } } }) });
    }
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}' });
  });
});

test('query parameters keep the preferred public canonical', async ({ page }) => {
  for (const path of ['/', '/learn', '/learn/budgeting/how-to-create-a-monthly-budget', '/tools/budget-calculator', '/about']) {
    await page.goto(`${path}?utm_source=seo-test`);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new URL(path, origin).href);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', new URL(path, origin).href);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
  }
});

test('public metadata is removed on navigation to authentication and private routes', async ({ page }) => {
  await page.goto('/learn/budgeting/how-to-create-a-monthly-budget');
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await page.goto('/login');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property^="og:"]')).toHaveCount(0);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test('unknown Learn and calculator pages are noindex without invented canonicals', async ({ page }) => {
  for (const path of ['/learn/saving/absent-guide', '/tools/absent-tool', '/not-a-public-page']) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
});

test('representative public pages expose generated SEO data and working links', async ({ page }) => {
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
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new URL(path, origin).href);
    const schema = await page.locator('script[type="application/ld+json"]').textContent();
    const types = JSON.parse(schema).map((node) => node['@type']);
    for (const type of expectedTypes) expect(types, `${path}: missing ${type}`).toContain(type);
    await expect(page.locator('nav[aria-label="Product and site information"] a[href="/learn"]')).toHaveCount(1);
  }
  await page.getByRole('link', { name: 'Guides', exact: true }).first().click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/learn`);
  await page.goto('/login');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  expect(authRequests.length).toBeGreaterThan(0);
  expect(new Set(authRequests)).toEqual(new Set(['GET /api/auth/config']));
  expect(fontResponses.length).toBeGreaterThan(0);
  expect(fontResponses.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(failedResponses).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(errors).toEqual([]);
});
