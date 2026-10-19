// Read-only production diagnostics. Never reads or emits credential values.
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const dotenv = require('dotenv');

async function main() {
  const env = {};
  for (const path of ['.env.local', '.env.production.local', 'apps/web/.env', 'apps/api/.env']) {
    if (!fs.existsSync(path)) continue;
    env[path] = Object.entries(dotenv.parse(fs.readFileSync(path))).map(([key, value]) => ({ key, configured: Boolean(value), ...(key === 'VITE_GA_MEASUREMENT_ID' ? { validFormat: /^G-[A-Z0-9]{10}$/i.test(value) } : {}) }));
  }
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const failures = [], errors = [], analytics = [], responses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failures.push({ url: request.url().split('?')[0], error: request.failure()?.errorText }));
    page.on('response', response => {
      if (/google-analytics\.com\/.*collect/.test(response.url())) analytics.push({ status: response.status(), event: new URL(response.url()).searchParams.get('en') });
      if (response.status() >= 400) responses.push({ status: response.status(), url: response.url().split('?')[0] });
    });
    await page.addInitScript(() => {
      window.__audit = { lcp: 0, cls: 0 };
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.__audit.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__audit.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(process.env.AUDIT_URL || 'https://www.hisabkikitab.com/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: `test-results/audit-${viewport.width}.png`, fullPage: true });
    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return { ...window.__audit, ttfb: nav.responseStart - nav.startTime, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, title: document.title, canonical: document.querySelector('link[rel=canonical]')?.href, gaScriptPresent: Boolean(document.querySelector('script[src*="googletagmanager.com/gtag"]')), overflow: document.documentElement.scrollWidth > innerWidth, resources: performance.getEntriesByType('resource').map(r => ({ url: r.name.split('?')[0], transfer: r.transferSize, duration: r.duration })) };
    });
    const link = page.getByRole('link', { name: 'Learn', exact: true }).first();
    if (await link.isVisible()) { await link.click(); await page.waitForLoadState('networkidle'); }
    results.push({ viewport, metrics, failures, errors, responses, analytics });
    await context.close();
  }
  await browser.close();
  const report = { date: new Date().toISOString(), conditions: 'Fresh Chromium contexts, unthrottled network/CPU, local Windows host. Lab observations, not field percentiles or Lighthouse.', env, results };
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(process.env.AUDIT_OUTPUT || 'test-results/production-baseline.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
fs.mkdirSync('test-results', { recursive: true });
main().catch(error => { console.error(error.message); process.exitCode = 1; });
