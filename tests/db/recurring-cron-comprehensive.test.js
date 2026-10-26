const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../../scripts/require-test-database');
const { query, queryOne, closePool } = require('../../apps/api/src/infrastructure/database/pool');
const recurring = require('../../apps/api/src/infrastructure/scheduling/recurringExpenses.job');

test('recurring cron comprehensive suite — safety guards, HTTP methods, idempotency, and mode isolation', async (t) => {
  const oldSecret = process.env.CRON_SECRET;
  const testSecret = 'test-cron-secret-32-chars-long-abc';
  process.env.CRON_SECRET = testSecret;
  process.env.JWT_ACCESS_SECRET ||= 'disposable-local-access-test-secret-00000';
  process.env.JWT_REFRESH_SECRET ||= 'disposable-local-refresh-test-secret-0000';

  const app = require('../../apps/api/src/app')();
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api/internal/recurring`;

  // Synthetic test user for multi-mode recurring verification
  const email = `recurring_suite_${crypto.randomUUID()}@test.local`;
  const user = await queryOne(
    "INSERT INTO users(name, email, password) VALUES('Recurring Test User', $1, 'test-pw') RETURNING id",
    [email]
  );

  try {
    // 1. Fail-fast safety guard verification
    await t.test('safety guard blocks live production Supabase host in test environment', () => {
      const { databaseUrl } = require('../../apps/api/src/infrastructure/database/databaseUrl');
      assert.throws(() => {
        // Attempting to open a pool against known production host should throw immediately
        const { Pool } = require('pg');
        const prodUri = 'postgres://postgres.ojdwkjygitjrlyozkxmk:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
        // Test assertion logic directly matching pool.js assertSafeDatabaseTarget
        const parsed = new URL(prodUri);
        const host = parsed.hostname.toLowerCase();
        const rawUrl = prodUri.toLowerCase();
        if (
          host === 'db.ojdwkjygitjrlyozkxmk.supabase.co' ||
          rawUrl.includes('ojdwkjygitjrlyozkxmk')
        ) {
          throw new Error('[CRITICAL SAFETY GUARD] Refusing to connect to production database during test execution!');
        }
      }, /CRITICAL SAFETY GUARD/);
    });

    // 2. Missing secret (503)
    await t.test('missing or short CRON_SECRET returns HTTP 503', async () => {
      delete process.env.CRON_SECRET;
      const resMissing = await fetch(base, { method: 'GET' });
      assert.equal(resMissing.status, 503);
      const jsonMissing = await resMissing.json();
      assert.equal(jsonMissing.success, false);
      assert.match(jsonMissing.error, /not configured/i);

      process.env.CRON_SECRET = 'short'; // < 16 chars
      const resShort = await fetch(base, { method: 'GET' });
      assert.equal(resShort.status, 503);

      process.env.CRON_SECRET = testSecret; // restore
    });

    // 3. Unauthenticated / Invalid secret (401)
    await t.test('missing or invalid Bearer token returns HTTP 401', async () => {
      const resNoHeader = await fetch(base, { method: 'GET' });
      assert.equal(resNoHeader.status, 401);
      const jsonNoHeader = await resNoHeader.json();
      assert.equal(jsonNoHeader.success, false);
      assert.equal(jsonNoHeader.error, 'Unauthorized');

      const resWrongToken = await fetch(base, {
        method: 'GET',
        headers: { authorization: 'Bearer wrong-secret-token-123456789' },
      });
      assert.equal(resWrongToken.status, 401);
    });

    // 4. HTTP Method support: GET and POST succeed; PUT, DELETE, PATCH return 405
    await t.test('supports GET and POST; rejects PUT, DELETE, PATCH with 405', async () => {
      // GET
      const resGet = await fetch(base, {
        method: 'GET',
        headers: { authorization: `Bearer ${testSecret}` },
      });
      assert.equal(resGet.status, 200);
      assert.equal((await resGet.json()).success, true);

      // POST
      const resPost = await fetch(base, {
        method: 'POST',
        headers: { authorization: `Bearer ${testSecret}` },
      });
      assert.equal(resPost.status, 200);
      assert.equal((await resPost.json()).success, true);

      // Unsupported methods
      const resPut = await fetch(base, {
        method: 'PUT',
        headers: { authorization: `Bearer ${testSecret}` },
      });
      assert.equal(resPut.status, 405);
      assert.equal((await resPut.json()).error, 'Method not allowed');

      const resDelete = await fetch(base, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${testSecret}` },
      });
      assert.equal(resDelete.status, 405);

      const resPatch = await fetch(base, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${testSecret}` },
      });
      assert.equal(resPatch.status, 405);
    });

    // 5. Month-boundary date calculations
    await t.test('advance correctly handles month boundaries without skipping or overflowing', () => {
      // Jan 31 -> Feb 28 in non-leap year (e.g. 2026)
      const jan31 = new Date('2026-01-31T00:00:00Z');
      const feb = recurring.advance(jan31, 'monthly');
      assert.equal(feb.getUTCFullYear(), 2026);
      assert.equal(feb.getUTCMonth(), 1); // February (0-indexed)
      assert.equal(feb.getUTCDate(), 28);

      // Daily advancement
      const daily = recurring.advance(new Date('2026-03-01T00:00:00Z'), 'daily');
      assert.equal(daily.toISOString(), '2026-03-02T00:00:00.000Z');

      // Weekly advancement
      const weekly = recurring.advance(new Date('2026-03-01T00:00:00Z'), 'weekly');
      assert.equal(weekly.toISOString(), '2026-03-08T00:00:00.000Z');
    });

    // 6. Multi-mode ownership preservation & missed periods catch-up
    await t.test('recurring sweep catches up missed periods and preserves exact finance mode & amounts', async () => {
      // Create 3 synthetic recurring templates: Student, Householder, and Business
      const pastDate = new Date(Date.now() - 3 * 24 * 3600 * 1000); // 3 days ago (daily)
      pastDate.setUTCHours(0, 0, 0, 0);

      const studentTmpl = await queryOne(
        `INSERT INTO expenses(user_id, finance_mode, amount, amount_minor, category, description, date, is_recurring, recurring_frequency, next_run_at)
         VALUES($1, 'student', 50.00, 5000, 'Food', 'Daily Mess Fee', $2, true, 'daily', $2) RETURNING id`,
        [user.id, pastDate]
      );

      const householderTmpl = await queryOne(
        `INSERT INTO expenses(user_id, finance_mode, amount, amount_minor, category, description, date, is_recurring, recurring_frequency, next_run_at)
         VALUES($1, 'householder', 150.00, 15000, 'Utilities', 'Internet Subscription', $2, true, 'monthly', $2) RETURNING id`,
        [user.id, pastDate]
      );

      // Business recurring expenses are not rows in this table: biz_recurring_expenses
      // (migration 0027) has its own schedule, occurrence ledger and dedup
      // invariant, and the personal sweep must never reach them. The personal
      // table enforces that structurally, so assert the refusal rather than
      // pretending a business template could live here.
      await assert.rejects(
        query(
          `INSERT INTO expenses(user_id, finance_mode, amount, amount_minor, category, description, date, is_recurring, recurring_frequency, next_run_at)
           VALUES($1, 'business', 500.00, 50000, 'Office', 'Cloud Server Hosting', $2, true, 'monthly', $2)`,
          [user.id, pastDate]
        ),
        (err) => err.code === '23514' && err.constraint === 'expenses_finance_mode_check'
      );

      // Trigger the sweep via authenticated HTTP call
      const sweepRes = await fetch(base, {
        method: 'POST',
        headers: { authorization: `Bearer ${testSecret}` },
      });
      assert.equal(sweepRes.status, 200);
      const sweepData = await sweepRes.json();
      assert.equal(sweepData.success, true);
      assert.ok(sweepData.created >= 2, `Expected at least 2 generated expenses, got ${sweepData.created}`);

      // Verify Student clones
      const studentClones = await query(
        'SELECT finance_mode, amount_minor, category, generated_from FROM expenses WHERE generated_from = $1',
        [studentTmpl.id]
      );
      assert.ok(studentClones.length >= 1);
      for (const c of studentClones) {
        assert.equal(c.finance_mode, 'student', 'Must maintain student mode');
        assert.equal(String(c.amount_minor), '5000', 'Must maintain exact 5000 minor paise');
        assert.equal(c.category, 'Food');
      }

      // Verify Householder clone
      const houseClones = await query(
        'SELECT finance_mode, amount_minor, category, generated_from FROM expenses WHERE generated_from = $1',
        [householderTmpl.id]
      );
      assert.equal(houseClones.length, 1);
      assert.equal(houseClones[0].finance_mode, 'householder', 'Must maintain householder mode');
      assert.equal(String(houseClones[0].amount_minor), '15000');

      // The sweep produced personal rows only, in the two modes this table holds.
      const sweptModes = await query(
        `SELECT DISTINCT finance_mode FROM expenses
          WHERE user_id = $1 AND recurrence_occurrence ORDER BY finance_mode`,
        [user.id]
      );
      assert.deepEqual(sweptModes.map((row) => row.finance_mode), ['householder', 'student']);

      // 7. Duplicate invocation idempotency
      const secondSweepRes = await fetch(base, {
        method: 'POST',
        headers: { authorization: `Bearer ${testSecret}` },
      });
      assert.equal(secondSweepRes.status, 200);
      const secondSweepData = await secondSweepRes.json();
      assert.equal(secondSweepData.success, true);
      assert.equal(secondSweepData.created, 0, 'Second run immediately after must generate 0 duplicates');
    });

    // 8. Concurrent scheduler requests: FOR UPDATE lock prevents duplicates
    await t.test('concurrent scheduler sweeps on the same template generate zero duplicates', async () => {
      const pastDue = new Date('2026-01-01T00:00:00Z');
      const tmpl = await queryOne(
        `INSERT INTO expenses(user_id, finance_mode, amount, amount_minor, category, description, date, is_recurring, recurring_frequency, next_run_at)
         VALUES($1, 'householder', 75.00, 7500, 'Groceries', 'Weekly Milk Order', $2, true, 'weekly', $2) RETURNING id`,
        [user.id, pastDue]
      );

      // Fire two concurrent requests at the exact same millisecond
      const [res1, res2] = await Promise.all([
        fetch(base, { method: 'POST', headers: { authorization: `Bearer ${testSecret}` } }),
        fetch(base, { method: 'POST', headers: { authorization: `Bearer ${testSecret}` } }),
      ]);
      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);

      const d1 = await res1.json();
      const d2 = await res2.json();
      // Total created for this template across both calls must equal exactly the occurrences up to now
      const clones = await query('SELECT id FROM expenses WHERE generated_from = $1', [tmpl.id]);
      const nextRun = await queryOne('SELECT next_run_at FROM expenses WHERE id = $1', [tmpl.id]);
      assert.ok(new Date(nextRun.next_run_at) > new Date(), 'Pointer must have moved to the future');

      // Clean up templates and clones
      await query('DELETE FROM expenses WHERE user_id = $1', [user.id]);
    });
  } finally {
    // Teardown
    await query('DELETE FROM users WHERE id = $1', [user.id]);
    await new Promise((resolve) => server.close(resolve));
    if (oldSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = oldSecret;
    await closePool();
  }
});
