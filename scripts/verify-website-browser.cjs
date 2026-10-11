const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const { JSDOM } = require('jsdom');
let activeBrowser;

async function main() {
  const browser = await chromium.launch({ headless: true });
  activeBrowser = browser;
  const measurements = process.env.SKIP_PERFORMANCE === 'true' ? JSON.parse(fs.readFileSync('test-results/local-performance.json')) : [];
  for (let run = 1; process.env.SKIP_PERFORMANCE !== 'true' && run <= 3; run++) {
    for (const [version, port] of [['before', 4180], ['after', 4181]]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.bringToFront();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.setBlockedURLs', { urls: ['*googletagmanager.com*', '*google-analytics.com*', '*accounts.google.com*'] });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.addInitScript(() => {
        window.__perf = { lcp: 0, cls: 0 };
        new PerformanceObserver(list => { for (const e of list.getEntries()) { window.__perf.lcp = e.startTime; window.__perf.lcpElement = e.element?.tagName; } }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
      await page.locator('h1').first().waitFor({ state: 'visible' });
      const heroReady = await page.evaluate(() => performance.now());
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/benchmark-${version}-${run}.png` });
      await page.waitForTimeout(100);
      measurements.push({ version, run, heroReady, ...await page.evaluate(() => ({ ...window.__perf, ttfb: performance.getEntriesByType('navigation')[0].responseStart, load: performance.getEntriesByType('navigation')[0].loadEventEnd, bytes: performance.getEntriesByType('resource').reduce((sum, entry) => sum + entry.transferSize, 0), overflow: document.documentElement.scrollWidth > innerWidth })) });
      assert.ok(measurements.at(-1).lcp > 0, 'Missing LCP sample');
      await context.close();
    }
  }
  fs.writeFileSync('test-results/local-performance.json', JSON.stringify(measurements, null, 2));
  const smoke = [];
  const sitemap = fs.readFileSync('apps/web/dist/sitemap.xml', 'utf8');
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const canonical = match[1], path = new URL(canonical).pathname;
    const preferred = await fetch(`http://127.0.0.1:4181${path}`);
    assert.equal(preferred.status, 200, path);
    const html = new JSDOM(await preferred.text()).window.document;
    assert.equal(html.querySelector('link[rel=canonical]').href, canonical);
    if (path !== '/') {
      const redirect = await fetch(`http://127.0.0.1:4181${path.slice(0, -1)}?page=2&test=a%20b`, { redirect: 'manual' });
      assert.equal(redirect.status, 301);
      assert.equal(redirect.headers.get('location'), `${path}?page=2&test=a%20b`);
    }
    smoke.push(path);
  }
  const contexts = [];
  const homeResponse = await fetch('http://127.0.0.1:4181/');
  assert.equal(homeResponse.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  const homeHtml = new JSDOM(await homeResponse.text()).window.document;
  const entryResponse = await fetch(`http://127.0.0.1:4181${homeHtml.querySelector('script[type=module]').getAttribute('src')}`);
  assert.equal(entryResponse.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/googletagmanager|google-analytics/.test(request.url())) requests.push(request.url().split('?')[0]); });
    // Serve the local build at its canonical origin to test production gating.
    // Mock Google transport so QA cannot add events to the real GA property.
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'hisabkikitab.com') {
        const response = await fetch(`http://127.0.0.1:4181${url.pathname}${url.search}`, { redirect: 'manual' });
        const headers = Object.fromEntries(response.headers.entries());
        delete headers['content-encoding']; delete headers['content-length'];
        await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
      } else if (url.hostname === 'www.googletagmanager.com') await route.fulfill({ contentType: 'text/javascript', body: 'window.__gaStubLoaded = true;' });
      else await route.abort();
    });
    await page.goto('https://hisabkikitab.com/', { waitUntil: 'networkidle' });
    assert.equal(requests.length, 0, 'GA must not load before consent');
    await page.getByRole('button', { name: 'Reject analytics', exact: true }).click();
    assert.equal(requests.length, 0, 'Reject must not load GA');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('button', { name: 'Accept analytics', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Privacy choices', exact: true }).click();
    await page.getByRole('button', { name: 'Accept analytics', exact: true }).click();
    await page.waitForFunction(() => window.__gaStubLoaded);
    await page.waitForTimeout(50);
    for (const [path, heading] of [['/learn/', 'Learn to Save, Earn & Manage Money Better'], ['/tools/', 'Financial Calculators'], ['/about/', 'About Hisab Ki Kitab']]) {
      await page.evaluate(path => { history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      await page.waitForTimeout(100);
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), `https://hisabkikitab.com${path}`);
    }
    const views = await page.evaluate(() => window.dataLayer.filter(call => call[0] === 'event' && call[1] === 'page_view').map(call => call[2]));
    assert.deepEqual(views.map(view => view.page_path), ['/', '/learn/', '/tools/', '/about/']);
    assert.ok(views[1].page_title.includes('Learn'), JSON.stringify(views));
    assert.ok(views[2].page_title.includes('Tools'), JSON.stringify(views));
    await page.getByRole('button', { name: 'Privacy choices', exact: true }).click();
    await page.getByRole('button', { name: 'Reject analytics', exact: true }).click();
    const count = await page.evaluate(() => window.dataLayer.filter(call => call[0] === 'event').length);
    await page.evaluate(() => { history.pushState({}, '', '/learn/'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await page.getByRole('searchbox', { name: 'Search guides' }).fill('no-matching-guide-12345');
    await page.getByText('No guides match your search.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByRole('searchbox', { name: 'Search guides' }).fill('emergency');
    assert.equal(await page.getByText('1 guide found', { exact: true }).count(), 1);
    await page.getByRole('link', { name: /Read Article:.*emergency/i }).click();
    await page.locator('#sources').waitFor();
    assert.equal(await page.evaluate(() => window.dataLayer.filter(call => call[0] === 'event').length), count, 'Withdrawal must stop events');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button', { name: 'Open navigation' }).getAttribute('aria-expanded'), 'false');
    }
    await page.screenshot({ path: `test-results/verified-article-${width}.png`, fullPage: true });
    await page.goto('https://hisabkikitab.com/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: `test-results/verified-home-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    contexts.push({ width, errors, appPageviews: views, consent: 'initial deny, reject persist, accept, withdraw verified; transport mocked' });
    await context.close();
  }
  await browser.close();
  const summary = { conditions: 'Local gzip static builds, fresh Chromium contexts, browser cache disabled, 390x844, 4x CPU slowdown, unthrottled loopback network, external traffic blocked; 3 alternating runs per build. Chrome network shaping was ineffective on this loopback environment and is excluded. Not field performance or Lighthouse.', measurements, publicRoutes: smoke.length, contexts };
  fs.writeFileSync('test-results/browser-verification.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(async error => { console.error(error.stack); await activeBrowser?.close(); process.exitCode = 1; });
