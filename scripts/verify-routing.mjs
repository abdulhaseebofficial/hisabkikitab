// Uses the already installed Vercel CLI compiler; adds no project dependency.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const chunks = process.env.VERCEL_CLI_CHUNKS || resolve(process.env.APPDATA || '', 'npm/node_modules/vercel/dist/chunks');
let routing;
for (const name of await readdir(chunks)) {
  if (!name.endsWith('.js')) continue;
  const file = resolve(chunks, name);
  const source = await readFile(file, 'utf8');
  const internal = source.match(/\/\/ \.\.\/routing-utils\/dist\/index\.js\s+var (require_\w+) =/);
  if (!internal) continue;
  const exports = source.slice(source.lastIndexOf('export {'));
  const exported = exports.match(new RegExp(`\\b${internal[1]}(?: as (\\w+))?[,\\n]`));
  if (!exported) continue;
  const module = await import(pathToFileURL(file).href);
  routing = module[exported[1] || internal[1]]();
  break;
}
if (!routing) throw new Error('Installed Vercel routing compiler not found; set VERCEL_CLI_CHUNKS.');
const config = JSON.parse(await readFile('vercel.json', 'utf8'));
const transformed = routing.getTransformedRoutes({ redirects: config.redirects, headers: config.headers, rewrites: config.services.frontend.rewrites });
assert.ok(!transformed.error, JSON.stringify(transformed.error));
const redirects = routing.getTransformedRoutes({ redirects: config.redirects }).routes.filter(rule => rule.src && rule.headers?.Location);
const rewrites = routing.getTransformedRoutes({ rewrites: config.services.frontend.rewrites }).routes.filter(rule => rule.src && rule.dest);
const { publicPaths, toolPaths, trustPaths } = await import('../apps/web/dist-ssr/prerender.js');
const paths = [...publicPaths, ...toolPaths, ...trustPaths].filter(path => path !== '/');
const match = (rules, path) => rules.find(rule => new RegExp(rule.src).test(path));
for (const path of paths) {
  const rule = match(redirects, path);
  assert.ok(rule, `Missing redirect: ${path}`);
  assert.equal(rule.status, 301);
  const location = path.replace(new RegExp(rule.src), rule.headers.Location);
  assert.equal(location, `${path}/`);
  assert.equal(match(redirects, location), undefined, `Loop: ${path}`);
  assert.ok(match(rewrites, location), `Missing slash rewrite: ${location}`);
}
for (const path of ['/', '/api/auth/me', '/api/internal/recurring', '/assets/file.js', '/wallet.svg', '/sitemap.xml', '/robots.txt', '/learn/image.png', '/tools/file.css']) assert.equal(match(redirects, path), undefined, `Unexpected redirect: ${path}`);
for (const path of ['/login', '/register', '/forgot-password']) {
  const rule = match(redirects, path);
  assert.equal(rule?.status, 301, path);
  assert.equal(path.replace(new RegExp(rule.src), rule.headers.Location), `${path}/`);
  assert.equal(match(redirects, `${path}/`), undefined);
  assert.equal(`${path}/`.replace(new RegExp(match(rewrites, `${path}/`).src), match(rewrites, `${path}/`).dest), '/app.html');
}
const report = { compiler: 'Installed Vercel CLI routing-utils', publicPagesChecked: paths.length, status: 301, redirectLoops: 0, excludedPaths: 9, redirects, rewrites };
await writeFile('test-results/routing-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, redirects: undefined, rewrites: undefined }, null, 2));
