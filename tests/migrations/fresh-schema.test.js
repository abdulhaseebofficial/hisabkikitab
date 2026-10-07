const fs = require('fs');
const path = require('path');
/**
 * Verifies the fresh-database path without touching production data.
 *
 * Creates a throwaway schema, points search_path at it, runs every migration
 * into it, checks what came out, and drops it again. The migrations use
 * unqualified names, so they land in the temporary schema rather than public.
 *
 * It connects on its OWN client, to the direct (non-pooled) URL, and never
 * through the shared pool.
 *
 * That is not tidiness. `SET search_path` is session state, and a
 * transaction-mode pooler hands the same backend connection to whoever asks
 * next - so this test's search_path could be inherited by a completely
 * different process, which would then look for its tables in a schema this
 * test had already dropped. That is exactly what happened: an API server
 * running alongside started answering "column finance_mode does not exist"
 * for a column that was plainly there.
 */
require('../../scripts/require-test-database');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'apps', 'api', '.env') });


const { Client } = require('pg');

const API = path.join(__dirname, '..', '..', 'apps', 'api');
const { migrationFiles } = require(path.join(API, 'src/infrastructure/database/migrate'));
const { migrationUrl } = require(path.join(API, 'src/infrastructure/database/databaseUrl'));

const MIGRATIONS = path.join(__dirname, '..', '..', 'database', 'migrations');
// Unique per run. With a fixed name, two runs at once each begin by dropping
// the other's schema, and both then fail reporting tables that were there a
// moment ago - a confusing way to discover you started the suite twice.
const SCHEMA = 'migration_smoke_test_' + process.pid + '_' + Date.now().toString(36);

(async () => {
  // A dedicated connection, on the direct URL where one is configured, so no
  // session state of this test's can reach anybody else.
  const client = new Client({
    connectionString: migrationUrl(),
    // The test guard requires localhost; disposable PostgreSQL normally has no TLS.
    ssl: false,
  });
  await client.connect();

  let failed = false;
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${SCHEMA}`);
    await client.query(`SET search_path TO ${SCHEMA}, public`);

    const files = migrationFiles();
    console.log('  migrations found: ' + files.join(', '));

    for (const name of files) {
      if (name === '0020_debt_contacts.sql') {
        await client.query(`INSERT INTO users (name, email, password)
          VALUES ('Legacy debtor', 'migration-debts@example.test', 'test-hash')`);
        await client.query(`INSERT INTO debts (user_id, kind, person_name, original_amount)
          SELECT id, 'LENT', 'Same Name', 12.34 FROM users WHERE email='migration-debts@example.test'`);
        await client.query(`INSERT INTO debts (user_id, kind, person_name, original_amount)
          SELECT id, 'BORROWED', 'Same Name', 56.78 FROM users WHERE email='migration-debts@example.test'`);
        await client.query(`INSERT INTO debt_payments (debt_id,user_id,amount)
          SELECT id,user_id,2.34 FROM debts WHERE original_amount=12.34`);
        await client.query(`UPDATE debts SET paid_amount=2.34,status='PARTIALLY_PAID'
          WHERE original_amount=12.34`);
      }
      if (name === '0021_shared_bill_occurrence.sql') {
        // Two old same-name recurring bills are ambiguous, not proof of a
        // duplicate generated occurrence. The additive migration leaves both.
        await client.query('BEGIN');
        try {
          const { rows: spaces } = await client.query(
            `INSERT INTO sl_spaces(owner_id,name,currency,residents)
             SELECT id,'Legacy space','PKR',1 FROM users
              WHERE email='migration-debts@example.test' RETURNING id,owner_id`);
          const legacy = spaces[0];
          await client.query("INSERT INTO sl_memberships(space_id,user_id,role) VALUES($1,$2,'admin')",
            [legacy.id, legacy.owner_id]);
          const { rows: periods } = await client.query(
            "INSERT INTO sl_periods(space_id,month,budget_minor,food_budget_minor) VALUES($1,'2024-02-01',0,0) RETURNING id",
            [legacy.id]);
          const { rows: categories } = await client.query(
            "INSERT INTO sl_categories(space_id,kind,stable_key,name) VALUES($1,'bill','legacy-rent','Rent') RETURNING id",
            [legacy.id]);
          await client.query(
            `INSERT INTO sl_bills(space_id,period_id,category_id,name,date,due_date,amount_minor,method,recurring,split_pending)
             VALUES($1,$2,$3,'Rent','2024-02-10','2024-02-12',0,'equal',true,true),
                   ($1,$2,$3,'Rent','2024-02-10','2024-02-12',0,'equal',true,true)`,
            [legacy.id, periods[0].id, categories[0].id]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS, name), 'utf8');
      await client.query(sql);
      console.log('  applied ' + name);
    }

    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 ORDER BY table_name`,
      [SCHEMA]
    );
    const tables = rows.map((r) => r.table_name);
    console.log('  tables created: ' + tables.length + ' -> ' + tables.join(', '));

    const expected = ['budgets', 'chat_messages', 'debt_contacts', 'debt_payments', 'debts',
      'expenses', 'feedback', 'financial_requests', 'goal_contributions', 'goals', 'income',
      'notifications', 'refresh_tokens', 'users'];
    const missing = expected.filter((t) => !tables.includes(t));
    if (missing.length) {
      console.log('  FAIL missing: ' + missing.join(', '));
      failed = true;
    } else {
      console.log('  ok: a fresh database gets the complete schema');
    }

    const { rows: legacyDebts } = await client.query(
      `SELECT d.person_name, d.original_amount, d.paid_amount, d.contact_id,
              c.display_name, c.user_id=d.user_id AS same_owner
         FROM debts d JOIN debt_contacts c ON c.id=d.contact_id
        ORDER BY d.original_amount`);
    if (legacyDebts.length !== 2 ||
      String(legacyDebts[0].original_amount) !== '12.34' ||
      String(legacyDebts[1].original_amount) !== '56.78' ||
      String(legacyDebts[0].paid_amount) !== '2.34' ||
      String(legacyDebts[1].paid_amount) !== '0' ||
      legacyDebts.some((d) => d.person_name !== 'Same Name' || d.display_name !== 'Same Name' || !d.same_owner) ||
      legacyDebts[0].contact_id === legacyDebts[1].contact_id) {
      console.log('  FAIL historical same-name debts were merged or changed');
      failed = true;
    } else {
      console.log('  ok: same-name historical debts keep distinct contacts and exact amounts');
    }
    const { rows: legacyPayments } = await client.query('SELECT amount FROM debt_payments');
    if (legacyPayments.length !== 1 || String(legacyPayments[0].amount) !== '2.34') {
      console.log('  FAIL historical payment changed during contact backfill');
      failed = true;
    }
    const { rows: legacyBills } = await client.query(
      "SELECT recurring_origin_id,recurrence_identity_known FROM sl_bills WHERE name='Rent'");
    if (legacyBills.length !== 2 || legacyBills.some((bill) =>
      bill.recurring_origin_id !== null || bill.recurrence_identity_known !== null)) {
      console.log('  FAIL ambiguous historical Shared Living bills changed');
      failed = true;
    } else {
      console.log('  ok: ambiguous historical recurring bills remain separate and unmarked');
    }

    // Constraints, not just tables. A migration whose "does this already
    // exist?" guard is not schema-aware will find the copy in public, decide
    // there is nothing to do, and create a table here with none of its rules -
    // silently, because the tables all still appear.
    const { rows: cons } = await client.query(
      `SELECT c.conname FROM pg_constraint c
         JOIN pg_class t  ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = $1`,
      [SCHEMA]
    );
    const names = cons.map((r) => r.conname);
    const expectedConstraints = [
      'debts_id_user_key',
      'debt_payments_debt_owner_fkey',
      'debts_status_matches_balance',
      'debts_settled_at_matches_status',
      'debt_contacts_id_user_key',
      'debts_contact_owner_fkey',
      // 0005: every account must be reachable by password or by Google.
      'users_has_a_way_in',
      'financial_requests_pkey',
      'sl_expenses_version_positive',
      'sl_bills_version_positive',
      'sl_payments_version_positive',
      'sl_bills_recurring_origin_space_fkey',
    ];
    const missingConstraints = expectedConstraints.filter((c) => !names.includes(c));
    if (missingConstraints.length) {
      console.log('  FAIL missing constraints: ' + missingConstraints.join(', '));
      failed = true;
    } else {
      console.log('  ok: and every constraint that protects it');
    }
    const { rows: occurrenceIndexes } = await client.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname=$1
         AND indexname='sl_bills_one_recurring_origin_per_period'`, [SCHEMA]);
    if (occurrenceIndexes.length !== 1 || !occurrenceIndexes[0].indexdef.includes('UNIQUE INDEX')) {
      console.log('  FAIL recurring bill occurrence index missing');
      failed = true;
    }

    // Running them a second time into the same schema must not error.
    for (const name of files) {
      await client.query(fs.readFileSync(path.join(MIGRATIONS, name), 'utf8'));
    }
    const { rows: afterReplay } = await client.query('SELECT count(*)::int AS n FROM debt_contacts');
    if (afterReplay[0].n !== 2) {
      console.log('  FAIL reapplication created extra contacts');
      failed = true;
    }
    console.log('  ok: re-applying the same migrations is harmless');
  } catch (err) {
    console.log('  FAIL ' + err.message);
    failed = true;
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => {});
    await client.query('SET search_path TO public').catch(() => {});
    // A dedicated client is closed, not returned to a pool.
    await client.end().catch(() => {});
  }
  process.exit(failed ? 1 : 0);
})();
