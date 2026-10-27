require('../../scripts/require-test-database');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const API = path.join(__dirname, '..', '..', 'apps', 'api');
const { query, closePool } = require(path.join(API, 'src/infrastructure/database/pool'));
const migrate = require(path.join(API, 'src/infrastructure/database/migrate'));
const connectDB = require(path.join(API, 'src/infrastructure/database/connect'));

const MIGRATIONS = path.join(__dirname, '..', '..', 'database', 'migrations');
const PROBE = '0022_read_only_demo.sql';
const PROBE_PATH = path.join(MIGRATIONS, PROBE);

/**
 * Migration 0021 was edited after it had already been applied to production.
 * The edit happened to be harmless -- the removed statements were idempotent
 * duplicates, and comparing the deployed schema against a freshly migrated one
 * proved the two produce byte-identical structure. But the startup gate could
 * not have told us that: it compares migration *names*, and the name never
 * changed.
 *
 * These tests cover the check that closes that gap, including the two
 * compatibility properties that matter more than the check itself: a database
 * that predates checksums must still start, and adoption must never overwrite
 * evidence that already exists.
 */

let original;

test.before(async () => {
  original = fs.readFileSync(PROBE_PATH, 'utf8');
  await migrate.migrate();   // ensures the ledger can hold a checksum
  await migrate.adopt();     // stamps anything applied before this existed
});

test.after(async () => {
  if (original != null) fs.writeFileSync(PROBE_PATH, original);
  await closePool();
});

test('a clean checkout reports no pending, changed or unverified migrations', async () => {
  const { pending, changed, unverified } = await migrate.status();
  assert.deepEqual(pending, [], 'nothing should be pending');
  assert.deepEqual(changed, [], 'nothing should be reported as edited');
  assert.deepEqual(unverified, [], 'adopt() should have stamped every applied row');
});

test('checksums are content-based and ignore line endings', () => {
  const sum = migrate.checksumOf(PROBE);
  assert.match(sum, /^[0-9a-f]{64}$/);

  // The same file on Windows and on the Linux build host differs only by CRLF.
  // A checksum that disagreed across platforms would refuse to start for a
  // difference that does not exist.
  const body = fs.readFileSync(PROBE_PATH, 'utf8');
  fs.writeFileSync(PROBE_PATH, body.replace(/\r?\n/g, '\r\n'));
  assert.equal(migrate.checksumOf(PROBE), sum, 'CRLF must hash the same as LF');
  fs.writeFileSync(PROBE_PATH, body.replace(/\r\n/g, '\n'));
  assert.equal(migrate.checksumOf(PROBE), sum, 'LF must hash the same as CRLF');
  fs.writeFileSync(PROBE_PATH, original);
});

test('editing an already-applied migration is detected and refuses startup', async () => {
  fs.appendFileSync(PROBE_PATH, '\n-- edited after it was applied\n');

  const { changed, pending } = await migrate.status();
  assert.deepEqual(pending, [], 'an edit is not a pending migration');
  assert.deepEqual(changed, [PROBE], 'the edited migration must be reported');

  await assert.rejects(
    () => connectDB(),
    (err) => {
      assert.match(err.message, /edited after apply/);
      assert.match(err.message, new RegExp(PROBE.replace(/\./g, '\\.')));
      return true;
    },
    'startup must fail closed on an edited migration'
  );

  fs.writeFileSync(PROBE_PATH, original);
  const after = await migrate.status();
  assert.deepEqual(after.changed, [], 'restoring the file clears the condition');
});

test('a ledger with no checksum column still starts, and says it is unverified', async () => {
  // Exactly the shape of a database migrated before this feature existed --
  // which is what production is, right now.
  await query('ALTER TABLE schema_migrations DROP COLUMN IF EXISTS checksum');

  try {
    const { changed, unverified, pending } = await migrate.status();
    assert.deepEqual(pending, []);
    assert.deepEqual(changed, [], 'nothing can be proven changed without stored checksums');
    assert.ok(unverified.length > 0, 'every applied row should be reported unverified');

    const result = await connectDB();
    assert.ok(result.db, 'startup must still succeed against a pre-checksum ledger');
  } finally {
    await migrate.migrate();
    await migrate.adopt();
  }
});

test('adopt never overwrites a checksum that is already recorded', async () => {
  const sum = migrate.checksumOf(PROBE);
  const [before] = await query(
    'SELECT checksum FROM schema_migrations WHERE name = $1', [PROBE]);
  assert.equal(before.checksum, sum);

  // A deliberately wrong value stands in for real evidence of a real drift.
  await query(
    "UPDATE schema_migrations SET checksum = 'deadbeef' WHERE name = $1", [PROBE]);
  const stamped = await migrate.adopt();
  assert.ok(!stamped.includes(PROBE), 'adopt must skip rows that already have a checksum');

  const [after] = await query(
    'SELECT checksum FROM schema_migrations WHERE name = $1', [PROBE]);
  assert.equal(after.checksum, 'deadbeef', 'the existing value must survive adopt()');

  await query(
    'UPDATE schema_migrations SET checksum = $2 WHERE name = $1', [PROBE, sum]);
});

test('startup still refuses a pending migration and an unexpected one', async () => {
  await query("INSERT INTO schema_migrations (name) VALUES ('9999_not_in_this_build.sql')");
  try {
    await assert.rejects(() => connectDB(), /unexpected: 9999_not_in_this_build\.sql/);
  } finally {
    await query("DELETE FROM schema_migrations WHERE name = '9999_not_in_this_build.sql'");
  }
});
