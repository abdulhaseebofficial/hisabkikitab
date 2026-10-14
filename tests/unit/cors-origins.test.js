const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const createApp = require('../../apps/api/src/app');

test('production CORS preflight accepts both public domains and configured local origin', async () => {
  const originalEnv = { NODE_ENV: process.env.NODE_ENV, CLIENT_URL: process.env.CLIENT_URL };
  process.env.NODE_ENV = 'production';
  process.env.CLIENT_URL = 'http://localhost:5173';
  const server = createApp().listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const { port } = server.address();
    for (const origin of [
      'https://www.hisabkikitab.com',
      'https://hisabkikitab.com',
      'http://localhost:5173',
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });
      assert.equal(response.status, 204, origin);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
      assert.match(response.headers.get('access-control-allow-methods'), /POST/);
      assert.match(response.headers.get('access-control-allow-headers'), /content-type/i);

      const page = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { Origin: origin },
      });
      assert.equal(page.status, 200, origin);
      assert.equal(page.headers.get('access-control-allow-origin'), origin);
      assert.equal(page.headers.get('access-control-allow-credentials'), 'true');
    }

    const rejected = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
