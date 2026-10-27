import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { featurePaths, sitemapPaths } from '../../apps/web/dist-ssr/prerender.js';

const origin = 'https://www.hisabkikitab.com';
const dist = resolve('apps/web/dist');
const pageFile = (path) => resolve(dist, path === '/' ? 'index.html' : `${path.slice(1)}/index.html`);
const html = async (path) => new JSDOM(await readFile(pageFile(path), 'utf8')).window.document;
const getMeta = (doc, key, attribute = 'name') => doc.querySelector(`meta[${attribute}="${key}"]`)?.content;

test('Phase 3: 5 feature routes are registered, prerendered and included in sitemap', async () => {
  assert.equal(featurePaths.length, 5, 'Must have 1 hub + 4 feature pages');
  for (const path of featurePaths) {
    assert.ok(sitemapPaths.includes(path), `${path} must be included in sitemapPaths`);
    const doc = await html(path);
    const canonical = new URL(`${path}/`, origin).href;
    assert.equal(doc.querySelectorAll('h1').length, 1, `${path} must have exactly one H1`);
    assert.equal(doc.querySelectorAll('title').length, 1, `${path} must have exactly one title`);
    assert.equal(doc.querySelectorAll('meta[name="description"]').length, 1, `${path} must have exactly one description`);
    assert.equal(doc.querySelector('link[rel="canonical"]')?.href, canonical, `${path} canonical mismatch`);
    assert.equal(getMeta(doc, 'robots'), 'index,follow', `${path} must be indexed`);
    assert.equal(getMeta(doc, 'og:url', 'property'), canonical, `${path} og:url mismatch`);
  }
});

test('Phase 3: Feature pages contain Pakistani financial context, worked PKR examples, and cross-links', async () => {
  const detailRoutes = featurePaths.filter((path) => path !== '/features');
  assert.equal(detailRoutes.length, 4);

  for (const path of detailRoutes) {
    const doc = await html(path);
    const text = doc.body.textContent;

    // Verify Pakistan and PKR context
    assert.ok(text.includes('Pakistan'), `${path} must mention Pakistan`);
    assert.ok(text.includes('PKR'), `${path} must include PKR currency`);

    // Verify worked example
    assert.ok(doc.querySelector('table'), `${path} must contain a structured worked example table`);

    // Verify registration CTA
    const registerLinks = [...doc.querySelectorAll('a[href="/register/"]')];
    assert.ok(registerLinks.length >= 2, `${path} must offer registration CTAs`);

    // Verify cross-links to calculator and guide
    const links = [...doc.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    assert.ok(links.some((l) => l.startsWith('/tools/')), `${path} must cross-link to a calculator`);
    assert.ok(links.some((l) => l.startsWith('/learn/')), `${path} must cross-link to a guide`);

    // Verify breadcrumbs
    assert.ok(doc.querySelector('nav[aria-label="Breadcrumbs"]'), `${path} must render accessible breadcrumbs`);
  }
});

test('Phase 3: Features Hub links to all 4 features and is linked from public navigation', async () => {
  const hubDoc = await html('/features');
  const hubLinks = [...hubDoc.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
  for (const path of featurePaths.filter((p) => p !== '/features')) {
    assert.ok(hubLinks.some((l) => l.startsWith(path)), `Hub must link to ${path}`);
  }

  // Home page navigation links to features hub
  const homeDoc = await html('/');
  const homeLinks = [...homeDoc.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
  assert.ok(homeLinks.some((l) => l === '/features' || l === '/features/'), 'Home page must link to Features');
});

test('Phase 3: Vercel routing rules support Features Hub and individual feature URLs', async () => {
  const config = JSON.parse(await readFile(resolve('vercel.json'), 'utf8'));
  const rewrites = config.services.frontend.rewrites;
  assert.ok(rewrites.some((r) => r.source === '/features/' && r.destination === '/features/index.html'));
  assert.ok(rewrites.some((r) => r.source === '/features/:feature/' && r.destination === '/features/:feature/index.html'));

  const redirects = config.redirects;
  assert.ok(redirects.some((r) => r.source === '/features' && r.destination === '/features/' && r.statusCode === 301));
  assert.ok(redirects.some((r) => r.source.includes('features/:feature') && r.destination === '/features/:feature/' && r.statusCode === 301));
});
