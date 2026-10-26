/**
 * The production audit script is only allowed to read, and that has to be
 * enforced by Postgres rather than by the script being careful.
 *
 * The first version relied on `SET SESSION CHARACTERISTICS AS TRANSACTION READ
 * ONLY` through the shared pool. That setting applies to the single pooled
 * connection that ran it; the next query can be handed a different connection
 * where it was never applied, and a write on that connection succeeds. Measured,
 * not assumed - which is why the script now runs inside an explicit read-only
 * transaction on one client, and why `assertReadOnly` checks at runtime before
 * reading anything.
 *
 * These tests are what stop that regressing: they prove every write class is
 * refused inside the transaction the script uses, and that the assertion fails
 * loudly when the protection is absent.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
require('../../scripts/require-test-database');
const { getPool, closePool } = require('../../apps/api/src/infrastructure/database/pool');
const { assertReadOnly, READ_ONLY_VIOLATION } = require('../../scripts/recurring-drift-inventory');

test.after(() => closePool());

/** Runs `fn` with one client inside a transaction of the given mode. */
const inTransaction = async (mode, fn) => {
  const client = await getPool().connect();
  try {
    await client.query(`BEGIN TRANSACTION ${mode}`);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
};

test('a read-only transaction refuses every way of changing data or schema', async () => {
  const attempts = [
    ['INSERT', `INSERT INTO expenses(user_id,finance_mode,amount,category,date)
                VALUES(gen_random_uuid(),'student',1,'Mess/Food',now())`],
    ['UPDATE', 'UPDATE expenses SET amount = amount WHERE false'],
    ['DELETE', 'DELETE FROM expenses WHERE false'],
    ['TRUNCATE', 'TRUNCATE expenses'],
    ['CREATE TABLE', 'CREATE TABLE hkk_audit_probe (x int)'],
    ['ALTER TABLE', 'ALTER TABLE expenses ADD COLUMN hkk_audit_probe int'],
    ['DROP TABLE', 'DROP TABLE IF EXISTS expenses'],
    ['CREATE TEMP TABLE', 'CREATE TEMP TABLE hkk_audit_probe_tmp (x int)'],
    ['CREATE INDEX', 'CREATE INDEX hkk_audit_probe_idx ON expenses(date)'],
    ['GRANT', 'GRANT SELECT ON expenses TO PUBLIC'],
  ];

  await inTransaction('READ ONLY', async (client) => {
    for (const [label, sql] of attempts) {
      await client.query('SAVEPOINT attempt');
      let code = null;
      try {
        await client.query(sql);
      } catch (err) {
        code = err.code;
      }
      await client.query('ROLLBACK TO SAVEPOINT attempt');
      assert.equal(code, READ_ONLY_VIOLATION, `${label} must be refused as read-only`);
    }

    // Reading is of course still allowed, or the audit could not report.
    const { rows } = await client.query('SELECT count(*)::int AS n FROM expenses');
    assert.equal(typeof rows[0].n, 'number');
  });
});

test('the audit asserts its own read-only protection before reading', async () => {
  await inTransaction('READ ONLY', async (client) => {
    assert.equal(await assertReadOnly(client), true);
    // The assertion must leave the transaction usable for the audit itself.
    const { rows } = await client.query('SELECT 1 AS alive');
    assert.equal(rows[0].alive, 1);
  });
});

test('the audit refuses to run when the transaction can write', async () => {
  await inTransaction('READ WRITE', async (client) => {
    await assert.rejects(
      () => assertReadOnly(client),
      (err) => /refusing to run/.test(err.message) && /read-only/.test(err.message),
    );
  });
});

test('the audit script leaves no trace of itself behind', async () => {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM pg_class
        WHERE relname LIKE 'hkk_read_only_assertion%' OR relname LIKE 'hkk_audit_probe%'`
    );
    assert.equal(rows[0].n, 0, 'probe tables must never survive');
  } finally {
    client.release();
  }
});
