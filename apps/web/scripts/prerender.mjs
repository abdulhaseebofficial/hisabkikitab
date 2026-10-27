import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { loadEnv } from 'vite';
import { publicPaths, toolPaths, trustPaths, featurePaths, sitemapPaths, render, renderTool, renderTrust, renderFeature } from '../dist-ssr/prerender.js';
import { canonicalSiteOrigin } from '../../../scripts/site-origin.mjs';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
// Prefer the explicit public origin. Vercel exposes its production domain for
// production builds; preview domains are deliberately never used for SEO.
const origin = canonicalSiteOrigin(env.VITE_SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : ''));
if (!origin) throw new Error('Set VITE_SITE_URL to the production origin (or build on Vercel with VERCEL_PROJECT_PRODUCTION_URL available).');
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const verificationToken = String(env.VITE_GOOGLE_SITE_VERIFICATION || '').trim();
const template = await readFile(resolve('dist/index.html'), 'utf8');
// Only preload the Latin fonts used above the fold. The browser otherwise
// discovers these after downloading and parsing the stylesheet.
const cssFile = template.match(/href="(\/assets\/[^"?]+\.css)"/)?.[1];
const css = cssFile ? await readFile(resolve('dist', cssFile.slice(1)), 'utf8') : '';
const fontPaths = [...new Set([...css.matchAll(/url\(([^)]+(?:inter|source-serif-4)-latin-wght-normal[^)]*\.woff2)\)/g)].map(match => match[1].replace(/^['"]|['"]$/g, '')))];
const fontPreloads = fontPaths.map(path => `<link rel="preload" href="${escape(path)}" as="font" type="font/woff2" crossorigin />`).join('\n');
// Keep the original SPA shell for private routes and unknown URLs.
const appShell = template
  .replace(/<title>[\s\S]*?<\/title>/, '<title>Hisab Ki Kitab</title>')
  .replace(/<meta\s+name="description"[\s\S]*?\/>/, '')
  .replace('</head>', '<meta name="robots" content="noindex,follow" />\n</head>');
await writeFile(resolve('dist/app.html'), appShell);
for (const path of [...publicPaths, ...toolPaths, ...trustPaths, ...featurePaths]) {
  const { html, metadata, initialArticle } = await (
    trustPaths.includes(path)
      ? renderTrust(path, origin)
      : toolPaths.includes(path)
      ? renderTool(path, origin)
      : featurePaths.includes(path)
      ? renderFeature(path, origin)
      : render(path, origin)
  );
  const verificationTag = verificationToken ? `<meta name="google-site-verification" content="${escape(verificationToken)}" />\n` : '';
  const head = `<title>${escape(metadata.title)}</title>\n${verificationTag}${metadata.tags.map(([attribute, key, value]) => `<meta data-learn-seo ${attribute}="${escape(key)}" content="${escape(value)}" />`).join('\n')}\n${metadata.canonical ? `<link data-learn-seo rel="canonical" href="${escape(metadata.canonical)}" />` : ''}\n${metadata.schema?.length ? `<script data-learn-seo type="application/ld+json">${JSON.stringify(metadata.schema).replace(/</g, '\\u003c')}</script>` : ''}`;
  const articleData = initialArticle ? `<script id="hkk-article" type="application/json">${JSON.stringify(initialArticle).replace(/</g, '\\u003c')}</script>` : '';
  const output = template.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta\s+name="description"[\s\S]*?\/>/, '').replace('</head>', `${fontPreloads}\n${head}\n</head>`).replace('<div id="root" class="h-full"></div>', `<div id="root" class="h-full">${html}</div>${articleData}`);
  const target = resolve('dist', path === '/' ? 'index.html' : `${path.slice(1)}/index.html`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, output);
}
await writeFile(resolve('dist/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapPaths.map((path) => `<url><loc>${escape(new URL(path === '/' ? '/' : `${path.replace(/\/+$/, '')}/`, origin).href)}</loc></url>`).join('')}</urlset>`);
await writeFile(resolve('dist/robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard\nDisallow: /expenses\nDisallow: /income\nDisallow: /goals\nDisallow: /debts\nDisallow: /budget\nDisallow: /advisor\nDisallow: /reports\nDisallow: /settings\nDisallow: /onboarding\nDisallow: /reset-password/\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(resolve('dist/404.html'), `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="robots" content="noindex,follow" /><title>Page not found | HisabKi Kitab</title><link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="32x32" /><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" /><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" /><link rel="manifest" href="/site.webmanifest" /></head><body style="font-family:system-ui,-apple-system,sans-serif;max-width:44rem;margin:12vh auto;padding:1.5rem;line-height:1.6;background:#f4f8ff;color:#0b1742;text-align:center"><main><div style="font-size:3.5rem;font-weight:800;color:#1468ff">404</div><h1 style="font-size:1.5rem;font-weight:700;margin:0.5rem 0">Page not found | HisabKi Kitab</h1><p style="color:#475569;margin-bottom:1.5rem">This link may be old or the page may have moved.</p><div style="margin-bottom:1.5rem"><a href="/" style="display:inline-block;background:#1468ff;color:#fff;padding:0.75rem 1.5rem;border-radius:9999px;font-weight:600;text-decoration:none">Back to Home</a></div><nav aria-label="Helpful pages" style="font-size:0.9rem"><a href="/dashboard" style="color:#1468ff;text-decoration:underline">Dashboard</a> · <a href="/learn/" style="color:#1468ff;text-decoration:underline">Financial Guides</a> · <a href="/tools/" style="color:#1468ff;text-decoration:underline">Calculators</a> · <a href="/features/" style="color:#1468ff;text-decoration:underline">Features</a></nav></main></body></html>`);
console.log(`Prerendered ${publicPaths.length + toolPaths.length + trustPaths.length + featurePaths.length} public pages (${sitemapPaths.length} indexable), sitemap.xml, and robots.txt.`);
