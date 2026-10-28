import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import zipfile from 'node:zlib';
import { templatePaths, sitemapPaths } from '../../apps/web/dist-ssr/prerender.js';

const origin = 'https://www.hisabkikitab.com';
const dist = resolve('apps/web/dist');
const pageFile = (path) => resolve(dist, path === '/' ? 'index.html' : `${path.slice(1)}/index.html`);
const html = async (path) => new JSDOM(await readFile(pageFile(path), 'utf8')).window.document;
const getMeta = (doc, key, attribute = 'name') => doc.querySelector(`meta[${attribute}="${key}"]`)?.content;

test('Phase 7: Templates Hub route is registered, prerendered, and included in sitemap', async () => {
  assert.equal(templatePaths.length, 1, 'Must have 1 templates hub route');
  assert.ok(sitemapPaths.includes('/templates'), '/templates must be in sitemapPaths');

  const doc = await html('/templates');
  const canonical = `${origin}/templates/`;

  assert.equal(doc.querySelectorAll('h1').length, 1, '/templates must have exactly one H1');
  assert.equal(doc.querySelectorAll('title').length, 1, '/templates must have exactly one title');
  assert.equal(doc.querySelectorAll('meta[name="description"]').length, 1, '/templates must have exactly one description');
  assert.equal(doc.querySelector('link[rel="canonical"]')?.href, canonical, '/templates canonical mismatch');
  assert.equal(getMeta(doc, 'robots'), 'index,follow', '/templates must be indexed');
  assert.equal(getMeta(doc, 'og:url', 'property'), canonical, '/templates og:url mismatch');
});

test('Phase 7: Templates Hub contains download CTAs and downloadable .xlsx assets exist', async () => {
  const doc = await html('/templates');
  const text = doc.body.textContent;

  assert.ok(text.includes('Monthly Household Budget Planner'), 'Must list Monthly Household Budget Planner');
  assert.ok(text.includes('Roommate & Hostel Expense Splitter'), 'Must list Roommate & Hostel Expense Splitter');
  assert.ok(text.includes('PKR'), 'Must include PKR currency indicators');

  // Verify download links in DOM
  const budgetDownloadLink = doc.querySelector('a[href="/downloads/hisabkikitab-monthly-household-budget.xlsx"]');
  assert.ok(budgetDownloadLink, 'Must contain download link for monthly budget template');
  assert.equal(budgetDownloadLink.getAttribute('download'), 'hisabkikitab-monthly-household-budget.xlsx');

  const roommateDownloadLink = doc.querySelector('a[href="/downloads/hisabkikitab-roommate-hostel-expense-splitter.xlsx"]');
  assert.ok(roommateDownloadLink, 'Must contain download link for roommate splitter template');
  assert.equal(roommateDownloadLink.getAttribute('download'), 'hisabkikitab-roommate-hostel-expense-splitter.xlsx');

  // Verify physical files on disk in dist/downloads and public/downloads
  const files = [
    'hisabkikitab-monthly-household-budget.xlsx',
    'hisabkikitab-roommate-hostel-expense-splitter.xlsx'
  ];

  for (const filename of files) {
    const pubPath = resolve('apps/web/public/downloads', filename);
    const pubStat = await stat(pubPath);
    assert.ok(pubStat.size > 5000, `Public file ${filename} must be > 5 KB (got ${pubStat.size})`);

    const distPath = resolve('apps/web/dist/downloads', filename);
    const distStat = await stat(distPath);
    assert.ok(distStat.size > 5000, `Dist file ${filename} must be > 5 KB (got ${distStat.size})`);
  }
});

test('Phase 7: Templates Hub has valid JSON-LD schema (WebPage, BreadcrumbList, CollectionPage)', async () => {
  const doc = await html('/templates');
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  assert.ok(scripts.length > 0, 'Must contain structured data');

  let foundBreadcrumb = false;
  let foundCollection = false;
  let foundWebPage = false;

  for (const s of scripts) {
    const data = JSON.parse(s.textContent);
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (item['@type'] === 'BreadcrumbList') foundBreadcrumb = true;
      if (item['@type'] === 'CollectionPage') foundCollection = true;
      if (item['@type'] === 'WebPage') foundWebPage = true;
    }
  }

  assert.ok(foundBreadcrumb, 'Must have BreadcrumbList schema');
  assert.ok(foundCollection, 'Must have CollectionPage schema');
  assert.ok(foundWebPage, 'Must have WebPage schema');
});

test('Phase 7: Vercel routing rules support Templates Hub rewrite and trailing slash redirect', async () => {
  const vercel = JSON.parse(await readFile(resolve('vercel.json'), 'utf8'));

  const rewrite = vercel.services.frontend.rewrites.find((r) => r.source === '/templates/');
  assert.ok(rewrite, 'Must have rewrite for /templates/');
  assert.equal(rewrite.destination, '/templates/index.html');

  const redirect = vercel.redirects.find((r) => r.source === '/templates');
  assert.ok(redirect, 'Must have 301 redirect for /templates');
  assert.equal(redirect.destination, '/templates/');
  assert.equal(redirect.statusCode, 301);
});
