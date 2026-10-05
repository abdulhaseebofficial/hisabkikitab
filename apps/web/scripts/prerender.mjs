import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { loadEnv } from 'vite';
import { publicPaths, toolPaths, trustPaths, render, renderTool, renderTrust } from '../dist-ssr/prerender.js';

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
const appShell = template.replace('</head>', '<meta name="robots" content="noindex,follow" />\n</head>');
await writeFile(resolve('dist/app.html'), appShell);
for (const path of [...publicPaths, ...toolPaths, ...trustPaths]) {
  const { html, metadata } = await (trustPaths.includes(path) ? renderTrust(path, origin) : toolPaths.includes(path) ? renderTool(path, origin) : render(path, origin));
const verificationTag = verificationToken ? `<meta name="google-site-verification" content="${escape(verificationToken)}" />\n` : '';
const head = `<title>${escape(metadata.title)}</title>\n${verificationTag}${metadata.tags.map(([attribute, key, value]) => `<meta data-learn-seo ${attribute}="${escape(key)}" content="${escape(value)}" />`).join('\n')}\n<link data-learn-seo rel="canonical" href="${escape(metadata.canonical)}" />\n<script data-learn-seo type="application/ld+json">${JSON.stringify(metadata.schema).replace(/</g, '\\u003c')}</script>`;
  const output = template.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta\s+name="description"[\s\S]*?\/>/, '').replace('</head>', `${head}\n</head>`).replace('<div id="root" class="h-full"></div>', `<div id="root" class="h-full">${html}</div>`);
  const target = resolve('dist', path === '/' ? 'index.html' : `${path.slice(1)}/index.html`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, output);
}
await writeFile(resolve('dist/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...publicPaths, ...toolPaths, ...trustPaths].map((path) => `<url><loc>${escape(new URL(path, origin).href)}</loc></url>`).join('')}</urlset>`);
await writeFile(resolve('dist/robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
console.log(`Prerendered ${publicPaths.length + toolPaths.length} public pages, sitemap.xml, and robots.txt.`);
