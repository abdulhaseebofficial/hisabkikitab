const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('API startup never runs DDL, and refuses a schema it does not match', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/api/src/infrastructure/database/connect.js'),
    'utf8'
  );

  // The invariant is that opening the database applies nothing. An earlier
  // revision enforced that by forbidding the import outright, which also ruled
  // out the stronger check below: startup now reads the ledger and refuses to
  // serve a mismatched schema, and reading it requires the module. So the
  // assertion is about the call, not the import.
  assert.doesNotMatch(source, /\bawait\s+migrate\s*\(/, 'startup must not apply migrations');
  assert.doesNotMatch(source, /\bmigrate\s*\(\s*\)/, 'startup must not call the runner at all');

  // Only the read-only half of the runner may be used, and a mismatch has to
  // stop the process rather than be logged and ignored.
  assert.match(source, /\bstatus\s*\(\s*\)/, 'startup must read the migration ledger');
  assert.match(source, /pending\.length/, 'a pending migration must stop startup');
  assert.match(source, /unexpected\.length/, 'a schema ahead of this build must stop startup too');
  assert.match(source, /throw new Error/, 'the mismatch must throw');
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
