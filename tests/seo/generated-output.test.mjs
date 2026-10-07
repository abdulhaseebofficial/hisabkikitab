import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { publicPaths, sitemapPaths } from '../../apps/web/dist-ssr/prerender.js';

const origin = 'https://hisabkikitab.com';
const dist = resolve('apps/web/dist');
const pageFile = (path) => resolve(dist, path === '/' ? 'index.html' : `${path.slice(1)}/index.html`);
const html = async (path) => new JSDOM(await readFile(pageFile(path), 'utf8')).window.document;
const text = async (name) => readFile(resolve(dist, name), 'utf8');
const getMeta = (doc, key, attribute = 'name') => doc.querySelector(`meta[${attribute}="${key}"]`)?.content;

test('sitemap is valid XML with unique canonical HTTPS public URLs only', async () => {
  const xml = new JSDOM(await text('sitemap.xml'), { contentType: 'text/xml' }).window.document;
  assert.equal(xml.querySelector('parsererror'), null);
  assert.equal(xml.documentElement.localName, 'urlset');
  assert.equal(xml.documentElement.namespaceURI, 'http://www.sitemaps.org/schemas/sitemap/0.9');
  const urls = [...xml.getElementsByTagName('loc')].map((node) => node.textContent);
  assert.equal(urls.length, sitemapPaths.length);
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(new Set(urls), new Set(sitemapPaths.map((path) => new URL(path, origin).href)));
  assert.ok(urls.every((url) => url.startsWith(`${origin}/`) && !new URL(url).search));
  assert.equal(xml.getElementsByTagName('lastmod').length, 0);
  assert.ok(!urls.some((url) => /\/(login|register|forgot-password|reset-password|dashboard|expenses|income|goals|debts|budget|advisor|reports|settings|onboarding|api)(\/|$)/.test(new URL(url).pathname)));
});

test('every indexable page has one H1 and unique complete metadata', async () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const path of sitemapPaths) {
    const doc = await html(path);
    const canonical = new URL(path, origin).href;
    assert.equal(doc.querySelectorAll('title').length, 1, path);
    assert.equal(doc.querySelectorAll('meta[name="description"]').length, 1, path);
    assert.equal(doc.querySelectorAll('link[rel="canonical"]').length, 1, path);
    assert.equal(doc.querySelectorAll('h1').length, 1, path);
    assert.equal(getMeta(doc, 'robots'), 'index,follow', path);
    assert.equal(doc.querySelector('link[rel="canonical"]').href, canonical, path);
    assert.equal(getMeta(doc, 'og:title', 'property'), doc.title, path);
    assert.equal(getMeta(doc, 'og:description', 'property'), getMeta(doc, 'description'), path);
    assert.equal(getMeta(doc, 'og:url', 'property'), canonical, path);
    assert.ok(['website', 'article'].includes(getMeta(doc, 'og:type', 'property')), path);
    assert.equal(getMeta(doc, 'twitter:card'), 'summary', path);
    assert.equal(getMeta(doc, 'twitter:title'), doc.title, path);
    assert.equal(getMeta(doc, 'twitter:description'), getMeta(doc, 'description'), path);
    assert.ok(doc.body.textContent.trim().length > 300, path);
    assert.ok(doc.querySelector('main'), path);
    assert.ok(doc.querySelector('nav[aria-label="Product and site information"]'), path);
    assert.ok(!titles.has(doc.title), `duplicate title: ${doc.title}`);
    assert.ok(!descriptions.has(getMeta(doc, 'description')), `duplicate description: ${path}`);
    titles.add(doc.title);
    descriptions.add(getMeta(doc, 'description'));
  }
  assert.equal(titles.size, sitemapPaths.length);
  assert.equal(descriptions.size, sitemapPaths.length);
});

test('page-specific JSON-LD is valid and matches visible pages', async () => {
  for (const path of sitemapPaths) {
    const doc = await html(path);
    const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
    assert.equal(scripts.length, 1, path);
    const schema = JSON.parse(scripts[0].textContent);
    const types = schema.map((node) => node['@type']);
    assert.ok(types.includes('WebPage'), path);
    assert.equal(types.includes('WebSite'), path === '/', path);
    assert.equal(types.includes('Article'), /^\/learn\/[^/]+\/[^/]+$/.test(path), path);
    assert.equal(types.includes('WebApplication'), /^\/tools\/[^/]+$/.test(path), path);
    assert.equal(types.includes('FAQPage'), !!doc.querySelector('#faqs'), path);
    for (const node of schema) {
      if (node.url) assert.equal(node.url, new URL(path, origin).href, path);
      if (node['@type'] === 'Article') {
        assert.equal(node.headline, doc.querySelector('h1').textContent, path);
        assert.ok(doc.querySelector(`time[datetime="${node.datePublished}"]`), path);
      }
    }
  }
});

test('thin empty categories are prerendered noindex and absent from sitemap', async () => {
  for (const path of ['/learn/earning', '/learn/small-business']) {
    assert.ok(publicPaths.includes(path));
    assert.ok(!sitemapPaths.includes(path));
    const doc = await html(path);
    assert.equal(getMeta(doc, 'robots'), 'noindex,follow');
    assert.equal(doc.querySelectorAll('h1').length, 1);
  }
});

test('robots points to the sitemap and restricts private/API crawling', async () => {
  const robots = await text('robots.txt');
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/);
  assert.match(robots, new RegExp(`Sitemap: ${origin}/sitemap\\.xml`));
  for (const path of ['/api/', '/dashboard', '/expenses', '/income', '/goals', '/debts', '/budget', '/advisor', '/reports', '/settings', '/onboarding', '/reset-password/']) {
    assert.ok(robots.includes(`Disallow: ${path}\n`), path);
  }
  assert.ok(!robots.includes('Disallow: /learn'));
  assert.ok(!robots.includes('Disallow: /tools'));
});

test('private SPA shell and static 404 do not carry public canonicals or data', async () => {
  const app = new JSDOM(await text('app.html')).window.document;
  assert.equal(getMeta(app, 'robots'), 'noindex,follow');
  assert.equal(app.querySelector('link[rel="canonical"]'), null);
  assert.equal(app.querySelector('script[type="application/ld+json"]'), null);
  assert.equal(app.querySelector('#root').textContent, '');
  const missing = new JSDOM(await text('404.html')).window.document;
  assert.equal(getMeta(missing, 'robots'), 'noindex,follow');
  assert.equal(missing.querySelectorAll('h1').length, 1);
  assert.equal(missing.querySelector('link[rel="canonical"]'), null);
  for (const path of ['/', '/learn', '/tools']) assert.ok(missing.querySelector(`a[href="${path}"]`));
});

test('hosting config routes known app paths without a catch-all 200 rewrite', async () => {
  const config = JSON.parse(await readFile(resolve('vercel.json'), 'utf8'));
  assert.equal(config.trailingSlash, false);
  const rewrites = config.services.frontend.rewrites;
  assert.ok(rewrites.some((rule) => rule.source === '/reset-password/:token' && rule.destination === '/app.html'));
  assert.ok(rewrites.some((rule) => rule.source.includes('dashboard') && rule.destination === '/app.html'));
  assert.ok(!rewrites.some((rule) => rule.source === '/(.*)' && rule.destination === '/app.html'));
  assert.ok(config.rewrites.some((rule) => rule.source === '/api(/.*)?' && rule.destination.service === 'backend'));
});

test('articles and calculators link to related public content without account data', async () => {
  for (const path of sitemapPaths.filter((route) => /^\/learn\/[^/]+\/[^/]+$/.test(route))) {
    const doc = await html(path);
    assert.ok([...doc.querySelectorAll('a[href]')].some((link) => link.getAttribute('href').startsWith('/tools/')), path);
  }
  for (const path of sitemapPaths.filter((route) => /^\/tools\/[^/]+$/.test(route))) {
    const doc = await html(path);
    assert.ok([...doc.querySelectorAll('a[href]')].some((link) => link.getAttribute('href').startsWith('/learn/')), path);
    assert.ok(doc.body.textContent.includes('How this estimate works'), path);
  }
});
