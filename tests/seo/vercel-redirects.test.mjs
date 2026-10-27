import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('vercel.json retains backend microservice, crons, security headers and adds signup 301 redirects', async () => {
  const content = JSON.parse(await readFile(resolve('vercel.json'), 'utf8'));

  // 1. Cron jobs verification
  assert.equal(Array.isArray(content.crons), true);
  assert.equal(content.crons.some(c => c.path === '/api/internal/recurring'), true);

  // 2. Services verification (backend must never be destroyed)
  assert.equal(content.services.backend.root, 'apps/api');
  assert.equal(content.services.backend.entrypoint, 'server.js');
  assert.equal(content.services.frontend.root, 'apps/web');

  // 3. API Rewrites verification
  assert.equal(content.rewrites.some(r => r.source === '/api(/.*)?' && r.destination?.service === 'backend'), true);

  // 4. Signup redirects (DEV-101)
  const signupRedirect = content.redirects.find(r => r.source === '/signup');
  assert.ok(signupRedirect, '/signup redirect rule must exist');
  assert.equal(signupRedirect.destination, '/register/');
  assert.equal(signupRedirect.statusCode, 301);

  const signupSlashRedirect = content.redirects.find(r => r.source === '/signup/');
  assert.ok(signupSlashRedirect, '/signup/ redirect rule must exist');
  assert.equal(signupSlashRedirect.destination, '/register/');
  assert.equal(signupSlashRedirect.statusCode, 301);

  // 5. Security headers verification
  const globalHeaders = content.headers.find(h => h.source === '/:path*');
  assert.ok(globalHeaders, 'Global security headers must exist');
  const hMap = Object.fromEntries(globalHeaders.headers.map(h => [h.key, h.value]));
  assert.equal(hMap['X-Content-Type-Options'], 'nosniff');
  assert.equal(hMap['X-Frame-Options'], 'SAMEORIGIN');
  assert.ok(hMap['Strict-Transport-Security']?.includes('max-age=63072000'));
});
