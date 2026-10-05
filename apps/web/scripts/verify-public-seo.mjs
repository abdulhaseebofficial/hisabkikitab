import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const dist = resolve('dist');
const sitemap = await readFile(resolve(dist, 'sitemap.xml'), 'utf8');
const robots = await readFile(resolve(dist, 'robots.txt'), 'utf8');
const appShell = await readFile(resolve(dist, 'app.html'), 'utf8');
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const verificationToken = String(env.VITE_GOOGLE_SITE_VERIFICATION || '').trim();
if (!/<meta name="robots" content="noindex,follow"\s*\/>/.test(appShell)) throw new Error('Private/fallback app shell must be noindex,follow.');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (!urls.length) throw new Error('Sitemap has no URLs.');
const origins = new Set(urls.map((url) => new URL(url).origin));
if (origins.size !== 1) throw new Error('Sitemap contains inconsistent origins.');
const origin = [...origins][0];
if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`)) throw new Error('robots.txt does not point to the matching sitemap.');
if (/\/(dashboard|expenses|income|goals|debts|budget|advisor|reports|settings)(\/|$)/i.test(urls.join('\n'))) throw new Error('A private financial route appears in the sitemap.');

const titles = new Set();
const descriptions = new Set();
const types = new Set();
for (const url of urls) {
  const pathname = new URL(url).pathname;
  const file = resolve(dist, pathname === '/' ? 'index.html' : `${pathname.slice(1)}/index.html`);
  await access(file);
  const html = await readFile(file, 'utf8');
  const verificationTags = [...html.matchAll(/<meta\s+name="google-site-verification"\s+content="([^"]*)"\s*\/>/g)].map((match) => match[1]);
  if (verificationToken ? verificationTags.length !== 1 || verificationTags[0] !== verificationToken : verificationTags.length !== 0) {
    throw new Error(`Search Console verification tag does not match the optional configuration on ${pathname}`);
  }
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta data-learn-seo name="description" content="([^"]+)"\s*\/>/)?.[1];
  const canonical = html.match(/<link data-learn-seo rel="canonical" href="([^"]+)"\s*\/>/)?.[1];
  const ogUrl = html.match(/<meta data-learn-seo property="og:url" content="([^"]+)"\s*\/>/)?.[1];
  if (!title || !description || canonical !== url || ogUrl !== url) throw new Error(`Missing or inconsistent SEO metadata on ${pathname}`);
  if (titles.has(title)) throw new Error(`Duplicate title: ${title}`);
  if (descriptions.has(description)) throw new Error(`Duplicate meta description: ${description}`);
  titles.add(title);
  descriptions.add(description);
  const json = html.match(/<script data-learn-seo type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error(`No structured data on ${pathname}`);
  const schema = JSON.parse(json);
  const schemaUrls = [];
  const findUrls = (value, key = '') => {
    if (key !== '@context' && typeof value === 'string' && /^https?:\/\//i.test(value)) schemaUrls.push(value);
    else if (Array.isArray(value)) value.forEach((item) => findUrls(item, key));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, child]) => findUrls(child, childKey));
  };
  findUrls(schema);
  if (schemaUrls.some((value) => new URL(value).origin !== origin)) throw new Error(`Structured data uses a non-production origin on ${pathname}`);
  for (const item of Array.isArray(schema) ? schema : [schema]) types.add(item['@type']);
  if (pathname.startsWith('/learn/') && pathname.split('/').length === 4 && !schema.some((item) => item['@type'] === 'Article')) throw new Error(`Missing Article schema on ${pathname}`);
  if (pathname === '/learn' || pathname.startsWith('/learn/') || pathname.startsWith('/tools')) {
    if (!schema.some((item) => item['@type'] === 'BreadcrumbList')) throw new Error(`Missing Breadcrumb schema on ${pathname}`);
  }
  if (['/about', '/contact', '/privacy', '/terms', '/disclaimer'].includes(pathname)) {
    if (schema.some((item) => item['@type'] === 'Article')) throw new Error(`Legal/trust page has inappropriate Article schema on ${pathname}`);
    if (!schema.some((item) => item['@type'] === 'WebPage') || !schema.some((item) => item['@type'] === 'BreadcrumbList')) throw new Error(`Missing WebPage or breadcrumb schema on ${pathname}`);
  }
}

console.log(JSON.stringify({ sitemapRoutes: urls.length, origin, uniqueTitles: titles.size, uniqueDescriptions: descriptions.size, structuredDataTypes: [...types].sort(), privateRoutesExcluded: true }, null, 2));
