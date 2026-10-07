import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { publicPaths, toolPaths, trustPaths, sitemapPaths } from '../../apps/web/dist-ssr/prerender.js';

const origin = 'https://hisabkikitab.com';
const dist = resolve('apps/web/dist');
const generated = new Set([...publicPaths, ...toolPaths, ...trustPaths]);
const indexable = new Set(sitemapPaths);
const appRoutes = new Set(['/login', '/register', '/forgot-password', '/onboarding', '/dashboard', '/expenses', '/income', '/goals', '/debts', '/budget', '/advisor', '/reports', '/settings']);
const normalize = (path) => path.replace(/\/+$/, '') || '/';
const exists = async (path) => access(resolve(dist, path.replace(/^\//, ''))).then(() => true, () => false);

export async function scanGeneratedLinks() {
  const pages = [];
  const broken = [];
  for (const path of generated) {
    const file = resolve(dist, path === '/' ? 'index.html' : `${path.slice(1)}/index.html`);
    const doc = new JSDOM(await readFile(file, 'utf8'), { url: new URL(path, origin).href }).window.document;
    const outbound = new Set();
    for (const anchor of doc.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href');
      if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
      let target;
      try { target = new URL(href, new URL(path, origin)); } catch { broken.push({ from: path, href, reason: 'invalid URL' }); continue; }
      if (target.origin !== origin) continue;
      const destination = normalize(target.pathname);
      if (indexable.has(destination) && destination !== path) outbound.add(destination);
      const known = generated.has(destination) || appRoutes.has(destination) || destination.startsWith('/reset-password/');
      if (!known && !(await exists(destination))) {
        broken.push({ from: path, href, reason: 'missing route or asset' });
      } else if (target.hash && generated.has(destination)) {
        const targetDoc = destination === path ? doc : new JSDOM(await readFile(resolve(dist, destination === '/' ? 'index.html' : `${destination.slice(1)}/index.html`), 'utf8')).window.document;
        let id;
        try { id = decodeURIComponent(target.hash.slice(1)); } catch { broken.push({ from: path, href, reason: 'invalid fragment encoding' }); continue; }
        if (!targetDoc.getElementById(id)) broken.push({ from: path, href, reason: 'missing fragment target' });
      }
    }
    pages.push({ path, indexable: indexable.has(path), outbound: [...outbound].sort() });
  }
  const inbound = new Map(sitemapPaths.map((path) => [path, new Set()]));
  for (const page of pages.filter((item) => item.indexable)) {
    for (const target of page.outbound) inbound.get(target).add(page.path);
  }
  const graph = pages.map((page) => ({ ...page, inbound: [...(inbound.get(page.path) || [])].sort() })).sort((a, b) => a.path.localeCompare(b.path));
  return { graph, orphans: graph.filter((page) => page.indexable && !page.inbound.length && page.path !== '/').map((page) => page.path), broken };
}
