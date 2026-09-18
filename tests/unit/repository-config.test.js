const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
test('frontend defaults, overrides and invalid ports are consistent with browser configuration', () => {
  for (const port of ['', '5180', '0', '65536', 'abc']) {
    const result = spawnSync(process.execPath, ['-e', `
      const config = require('./tests/browser/config');
      console.log(JSON.stringify({ baseURL: config.use.baseURL, url: config.webServer.url }));
    `], { cwd: root, env: { ...process.env, FRONTEND_PORT: port, BROWSER_BASE_URL: '' }, encoding: 'utf8' });
    if (['0', '65536', 'abc'].includes(port)) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /FRONTEND_PORT must be/);
    } else {
      assert.equal(result.status, 0, result.stderr);
      const expected = `http://localhost:${port || 5173}`;
      assert.deepEqual(JSON.parse(result.stdout), { baseURL: expected, url: expected });
    }
  }
});

test('explicit browser URL leaves server lifecycle to its owner', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const externalConfig = require('./tests/browser/config');
    console.log(JSON.stringify({ baseURL: externalConfig.use.baseURL, managed: !!externalConfig.webServer }));
  `], { cwd: root, env: { ...process.env, BROWSER_BASE_URL: 'http://localhost:5181' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { baseURL: 'http://localhost:5181', managed: false });
});

test('dead-code scanner ignores generated output but detects real orphan files and unused exports', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'hisab-dead-code-'));
  const write = (name, content) => {
    const file = path.join(fixture, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const scan = () => spawnSync(process.execPath, ['scripts/find-dead-code.js'], { cwd: fixture, encoding: 'utf8' });
  try {
    write('scripts/find-dead-code.js', fs.readFileSync(path.join(root, 'scripts/find-dead-code.js')));
    write('apps/api/server.js', 'console.log("entry");');
    for (const dir of ['test-results', 'playwright-report', 'blob-report', 'coverage', 'build', 'dist', 'node_modules', '.cache', '.vite', '.vite-temp', '.vitest', '.turbo', '.nyc_output', '.vercel']) {
      write(`${dir}/unreachable.js`, 'module.exports = { generated: true };');
      write(`${dir}/package.json`, 'invalid generated data');
      fs.mkdirSync(path.join(fixture, dir, 'empty'));
    }
    let result = scan();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    write('apps/api/src/orphan.js', 'const unused = true;');
    result = scan();
    assert.equal(result.status, 1);
    assert.match(result.stdout, /! apps\/api\/src\/orphan.js/);
    write('apps/api/server.js', "require('./src/orphan');");
    write('apps/api/src/orphan.js', 'const unusedExport = () => {}; module.exports = { unusedExport };');
    result = scan();
    assert.equal(result.status, 1);
    assert.match(result.stdout, /orphan.js :: unusedExport/);
  } finally {
    // mkdtemp returns a new absolute directory owned exclusively by this test.
    assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
    assert.ok(path.basename(fixture).startsWith('hisab-dead-code-'));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
