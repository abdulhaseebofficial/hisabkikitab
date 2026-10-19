const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('API startup connects without importing or executing the migration runner', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/api/src/infrastructure/database/connect.js'),
    'utf8'
  );

  assert.doesNotMatch(source, /require\(['"]\.\/migrate['"]\)/);
  assert.doesNotMatch(source, /\bawait\s+migrate\s*\(/);
});

test('migrations remain available only through an explicit package command', () => {
  const apiPackage = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/api/package.json'), 'utf8')
  );

  assert.equal(apiPackage.scripts.start, 'node server.js');
  assert.match(apiPackage.scripts.migrate, /infrastructure\/database\/migrate\.js/);
  assert.doesNotMatch(apiPackage.scripts.start, /migrat/i);
});

test('the destructive demo seed is restricted to a guarded local test database', () => {
  const source = fs.readFileSync(
    path.join(root, 'database/seeds/demo-readonly.js'),
    'utf8'
  );

  assert.match(source, /require\(['"]\.\.\/\.\.\/scripts\/require-test-database['"]\)/);
  assert.ok(
    source.indexOf("require('../../scripts/require-test-database')") <
      source.indexOf("require('dotenv').config()"),
    'the safety guard must run before dotenv can load another database URL'
  );
});
