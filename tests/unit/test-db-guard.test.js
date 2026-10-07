const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const script = path.resolve(__dirname, '../../scripts/require-test-database.js');
const check = (url, extra = {}) => spawnSync(process.execPath, [script], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    ALLOW_DESTRUCTIVE_TEST_DB: 'true',
    TEST_DATABASE_URL: url,
    ...extra,
  },
  encoding: 'utf8',
});

test('integration guard accepts only explicitly enabled localhost test databases', () => {
  assert.equal(check('postgresql://user:pass@127.0.0.1:5432/hisabkikitab_test').status, 0);
  assert.notEqual(check('postgresql://user:pass@production.example/test_db').status, 0);
  assert.notEqual(check('postgresql://user:pass@127.0.0.1:5432/production').status, 0);
  assert.notEqual(check('postgresql://user:pass@127.0.0.1:5432/test_db',
    { BROWSER_API_URL: 'https://production.example' }).status, 0);
  assert.notEqual(check('postgresql://user:pass@127.0.0.1:5432/test_db',
    { ALLOW_DESTRUCTIVE_TEST_DB: 'false' }).status, 0);
});
