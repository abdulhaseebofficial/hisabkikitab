import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { publicPaths, toolPaths, trustPaths, sitemapPaths } from '../../apps/web/dist-ssr/prerender.js';
import { scanGeneratedLinks } from './link-graph.mjs';

const origin = 'https://hisabkikitab.com';
const dist = resolve('apps/web/dist');
const generated = [...publicPaths, ...toolPaths, ...trustPaths];
const documentFor = async (path) => new JSDOM(await readFile(resolve(dist, path === '/' ? 'index.html' : `${path.slice(1)}/index.html`), 'utf8')).window.document;
const meta = (doc, name, property = 'name') => doc.querySelector(`meta[${property}="${name}"]`)?.content;
const schemaFor = (doc) => [...doc.querySelectorAll('script[type="application/ld+json"]')].flatMap((script) => {
  const parsed = JSON.parse(script.textContent);
  return Array.isArray(parsed) ? parsed : [parsed];
});

test('generated route inventory and sitemap exactly match index directives', async () => {
  const xml = new JSDOM(await readFile(resolve(dist, 'sitemap.xml'), 'utf8'), { contentType: 'text/xml' }).window.document;
  const listed = [...xml.getElementsByTagName('loc')].map((node) => node.textContent);
  assert.equal(new Set(generated).size, generated.length, 'duplicate generated route');
  assert.deepEqual(new Set(listed), new Set(sitemapPaths.map((path) => new URL(path, origin).href)));
  for (const path of generated) {
    const doc = await documentFor(path);
    const indexable = meta(doc, 'robots') === 'index,follow';
    assert.equal(indexable, sitemapPaths.includes(path), `${path}: index directive and sitemap differ`);
    assert.equal(doc.querySelectorAll('link[rel="canonical"]').length, 1, `${path}: expected one canonical`);
    assert.equal(doc.querySelector('link[rel="canonical"]').href, new URL(path, origin).href, `${path}: non-production or alternate canonical`);
    assert.equal(doc.querySelectorAll('meta[name="robots"]').length, 1, `${path}: duplicate robots tag`);
    assert.equal(doc.querySelectorAll('meta[name="description"]').length, 1, `${path}: duplicate description`);
    assert.equal(meta(doc, 'og:url', 'property'), new URL(path, origin).href, `${path}: og:url mismatch`);
    for (const node of doc.querySelectorAll('link[rel="canonical"], meta[property="og:url"]')) {
      assert.ok(!/localhost|127\.0\.0\.1|\.vercel\.app/i.test(node.outerHTML), `${path}: development URL leakage`);
    }
  }
});

test('server-rendered JSON-LD has supported types and matching route URLs', async () => {
  for (const path of generated) {
    const doc = await documentFor(path);
    const schema = schemaFor(doc);
    assert.equal(doc.querySelectorAll('script[type="application/ld+json"]').length, 1, `${path}: expected one JSON-LD script`);
    const types = schema.map((node) => node['@type']);
    assert.ok(types.includes('WebPage'), path);
    assert.equal(types.includes('Organization'), path === '/', path);
    assert.equal(types.includes('WebSite'), path === '/', path);
    assert.equal(types.includes('Article'), /^\/learn\/[^/]+\/[^/]+$/.test(path), path);
    assert.equal(types.includes('BreadcrumbList'), path !== '/', path);
    for (const node of schema) {
      assert.equal(node['@context'], 'https://schema.org', `${path}: invalid context`);
      if (node.url) assert.equal(node.url, new URL(path, origin).href, `${path}: schema URL mismatch`);
      if (node['@type'] === 'Article') {
        assert.equal(node.mainEntityOfPage, new URL(path, origin).href, path);
        assert.equal(node.headline, doc.querySelector('h1')?.textContent, path);
      }
      if (node['@type'] === 'BreadcrumbList') {
        const items = node.itemListElement;
        assert.equal(items[0].item, `${origin}/`, path);
        assert.equal(items.at(-1).item, new URL(path, origin).href, path);
        assert.deepEqual(items.map((item) => item.position), items.map((_, index) => index + 1), path);
      }
    }
  }
});

test('internal links resolve and every indexable page has an inbound link', async () => {
  const { graph, orphans, broken } = await scanGeneratedLinks();
  assert.equal(graph.length, generated.length);
  assert.deepEqual(orphans, [], `orphan pages: ${orphans.join(', ')}`);
  assert.deepEqual(broken, [], `broken links: ${JSON.stringify(broken)}`);
  for (const page of graph.filter((item) => item.indexable)) {
    assert.ok(page.outbound.length > 0, `${page.path}: no outbound public links`);
  }
});

test('robots allows public content and assets while private shell stays noindex', async () => {
  const robots = await readFile(resolve(dist, 'robots.txt'), 'utf8');
  for (const path of ['/', '/learn', '/tools', '/about', '/assets/']) {
    assert.ok(!robots.includes(`Disallow: ${path}\n`), `${path}: public content or asset blocked`);
  }
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
  const app = new JSDOM(await readFile(resolve(dist, 'app.html'), 'utf8')).window.document;
  assert.equal(meta(app, 'robots'), 'noindex,follow');
  assert.equal(app.title, 'Hisab Ki Kitab');
  assert.equal(meta(app, 'description'), undefined);
  assert.equal(app.querySelector('link[rel="canonical"]'), null);
  assert.equal(app.querySelector('script[type="application/ld+json"]'), null);
});
