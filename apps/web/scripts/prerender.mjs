import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { loadEnv } from 'vite';
import { publicPaths, toolPaths, trustPaths, sitemapPaths, render, renderTool, renderTrust } from '../dist-ssr/prerender.js';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
// Prefer the explicit public origin. Vercel exposes its production domain for
// production builds; preview domains are deliberately never used for SEO.
const configuredOrigin = env.VITE_SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
if (!configuredOrigin) throw new Error('Set VITE_SITE_URL to the production origin (or build on Vercel with VERCEL_PROJECT_PRODUCTION_URL available).');
const parsedOrigin = new URL(configuredOrigin);
if (parsedOrigin.protocol !== 'https:' || parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
  throw new Error('VITE_SITE_URL must be an HTTPS origin such as https://example.com, without a path, query, or fragment.');
}
const origin = parsedOrigin.origin;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const verificationToken = String(env.VITE_GOOGLE_SITE_VERIFICATION || '').trim();
const template = await readFile(resolve('dist/index.html'), 'utf8');
// Keep the original SPA shell for private routes and unknown URLs.
const appShell = template
  .replace(/<title>[\s\S]*?<\/title>/, '<title>Hisab Ki Kitab</title>')
  .replace(/<meta\s+name="description"[\s\S]*?\/>/, '')
  .replace('</head>', '<meta name="robots" content="noindex,follow" />\n</head>');
await writeFile(resolve('dist/app.html'), appShell);
for (const path of [...publicPaths, ...toolPaths, ...trustPaths]) {
  const { html, metadata } = await (trustPaths.includes(path) ? renderTrust(path, origin) : toolPaths.includes(path) ? renderTool(path, origin) : render(path, origin));
const verificationTag = verificationToken ? `<meta name="google-site-verification" content="${escape(verificationToken)}" />\n` : '';
const head = `<title>${escape(metadata.title)}</title>\n${verificationTag}${metadata.tags.map(([attribute, key, value]) => `<meta data-learn-seo ${attribute}="${escape(key)}" content="${escape(value)}" />`).join('\n')}\n${metadata.canonical ? `<link data-learn-seo rel="canonical" href="${escape(metadata.canonical)}" />` : ''}\n${metadata.schema?.length ? `<script data-learn-seo type="application/ld+json">${JSON.stringify(metadata.schema).replace(/</g, '\\u003c')}</script>` : ''}`;
  const output = template.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta\s+name="description"[\s\S]*?\/>/, '').replace('</head>', `${head}\n</head>`).replace('<div id="root" class="h-full"></div>', `<div id="root" class="h-full">${html}</div>`);
  const target = resolve('dist', path === '/' ? 'index.html' : `${path.slice(1)}/index.html`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, output);
}
await writeFile(resolve('dist/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapPaths.map((path) => `<url><loc>${escape(new URL(path, origin).href)}</loc></url>`).join('')}</urlset>`);
await writeFile(resolve('dist/robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard\nDisallow: /expenses\nDisallow: /income\nDisallow: /goals\nDisallow: /debts\nDisallow: /budget\nDisallow: /advisor\nDisallow: /reports\nDisallow: /settings\nDisallow: /onboarding\nDisallow: /reset-password/\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(resolve('dist/404.html'), `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="robots" content="noindex,follow" /><title>Page not found | Hisab Ki Kitab</title><link rel="icon" type="image/svg+xml" href="/wallet.svg" /></head><body style="font-family:system-ui,sans-serif;max-width:42rem;margin:10vh auto;padding:1rem;line-height:1.6"><main><h1>Page not found</h1><p>This link may be old or the page may have moved.</p><nav aria-label="Helpful pages"><a href="/">Home</a> · <a href="/learn">Financial guides</a> · <a href="/tools">Calculators</a></nav></main></body></html>`);
console.log(`Prerendered ${publicPaths.length + toolPaths.length + trustPaths.length} public pages (${sitemapPaths.length} indexable), sitemap.xml, and robots.txt.`);
