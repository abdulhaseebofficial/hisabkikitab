const path = require('path');
/**
 * The rules the database itself refuses to break.
 *
 * Every other test in this repo goes through the API, which means they prove
 * the application behaves - not that the data could not be corrupted by
 * something that is not the application. These write straight to Postgres,
 * bypassing every validator, service and repository check, and assert that the
 * schema still says no.
 *
 * That distinction is the whole point of a constraint. "The code never does
 * that" is a statement about today's code.
 *
 * Nothing is left behind: all of it runs inside one transaction that is always
 * rolled back, so this is safe to run against a database with real rows in it.
 */
require('../../scripts/require-test-database');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'apps', 'api', '.env') });

const API = path.join(__dirname, '..', '..', 'apps', 'api');
const { getPool, closePool } = require(path.join(API, 'src/infrastructure/database/pool'));

let passed = 0;
let failed = 0;
const failures = [];

const ok = (name, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}${detail ? '  - ' + detail : ''}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? '  - ' + detail : ''}`);
    console.log(`  FAIL  ${name}${detail ? '  - ' + detail : ''}`);
  }
};

const section = (title) => console.log(`\n--- ${title} ---`);

/**
 * Runs a statement that must be rejected, and checks it was rejected for the
 * reason we mean rather than by something incidental.
 *
 * `expected` may be several names: a single bad write can violate more than one
 * rule, and which one Postgres reports first is its business, not the test's.
 * The reported name is always printed, so the output says what actually
 * refused the row rather than what we hoped would.
 */
const mustReject = async (tx, name, sql, params, expected) => {
  const acceptable = Array.isArray(expected) ? expected : [expected];
  try {
    await tx.query('SAVEPOINT probe');
    await tx.query(sql, params);
    await tx.query('ROLLBACK TO SAVEPOINT probe');
    ok(name, false, 'the database ACCEPTED it');
  } catch (err) {
    await tx.query('ROLLBACK TO SAVEPOINT probe').catch(() => {});
    const reason = err.constraint || err.message.split('\n')[0];
    ok(name, acceptable.some((c) => err.message.includes(c)), `refused by ${reason}`);
  }
};

(async () => {
  const tx = await getPool().connect();

  try {
    await tx.query('BEGIN');

    const makeUser = async (tag) =>
      (
        await tx.query(
          `INSERT INTO users (name, email, password) VALUES ('Constraint test', $1, 'not-a-real-hash')
           RETURNING id`,
          [`constraints_${tag}_${Date.now()}@test.local`]
        )
      ).rows[0].id;

    const userA = await makeUser('a');
    const userB = await makeUser('b');

    const debtA = (
      await tx.query(
        `INSERT INTO debts (user_id, kind, person_name, original_amount)
         VALUES ($1, 'BORROWED', 'Someone', 1000) RETURNING id`,
        [userA]
      )
    ).rows[0].id;

    section('A PAYMENT AND ITS DEBT BELONG TO THE SAME STUDENT');

    await mustReject(
      tx,
      "user B cannot attach a payment to user A's debt",
      `INSERT INTO debt_payments (debt_id, user_id, amount) VALUES ($1, $2, 100)`,
      [debtA, userB],
      'debt_payments_debt_owner_fkey'
    );

    const paymentA = (
      await tx.query(
        `INSERT INTO debt_payments (debt_id, user_id, amount) VALUES ($1, $2, 100) RETURNING id`,
        [debtA, userA]
      )
    ).rows[0].id;
    ok('the rightful owner still can', Boolean(paymentA));

    await mustReject(
      tx,
      'an existing payment cannot be handed to another student',
      `UPDATE debt_payments SET user_id = $2 WHERE id = $1`,
      [paymentA, userB],
      'debt_payments_debt_owner_fkey'
    );

    await mustReject(
      tx,
      'a debt cannot change owner while it has a ledger',
      `UPDATE debts SET user_id = $2 WHERE id = $1`,
      [debtA, userB],
      'debt_payments_debt_owner_fkey'
    );

    section('STATUS AGREES WITH THE BALANCE');

    await mustReject(
      tx,
      'SETTLED with money still outstanding is refused',
      `UPDATE debts SET status = 'SETTLED', settled_at = now() WHERE id = $1`,
      [debtA],
      'debts_status_matches_balance'
    );

    // paid_amount is a running total the repository maintains; inserting a
    // payment row does not move it. Set it here as the repository would.
    await tx.query(
      `UPDATE debts SET paid_amount = 100, status = 'PARTIALLY_PAID' WHERE id = $1`,
      [debtA]
    );

    await mustReject(
      tx,
      'PENDING with money already paid is refused',
      `UPDATE debts SET status = 'PENDING' WHERE id = $1`,
      [debtA],
      'debts_status_matches_balance'
    );

    await mustReject(
      tx,
      'a debt cannot be created already SETTLED with nothing paid',
      `INSERT INTO debts (user_id, kind, person_name, original_amount, status, settled_at)
       VALUES ($1, 'LENT', 'Someone', 50, 'SETTLED', now())`,
      [userA],
      'debts_status_matches_balance'
    );

    await mustReject(
      tx,
      'paying more than was borrowed is refused',
      `UPDATE debts SET paid_amount = 2000 WHERE id = $1`,
      [debtA],
      // Two separate rules forbid this - the amount cap and the status/balance
      // agreement. Either refusal is the right answer.
      //
      // `debts_check` is Postgres's own name for the cap: the CHECK in 0002
      // spans two columns (paid_amount <= original_amount), so it became a
      // table-level constraint with a generated name rather than a column one.
      ['debts_check', 'debts_status_matches_balance']
    );

    section('SETTLED_AT AGREES WITH STATUS');

    await mustReject(
      tx,
      'an unsettled debt cannot carry a settlement date',
      `UPDATE debts SET settled_at = now() WHERE id = $1`,
      [debtA],
      'debts_settled_at_matches_status'
    );

    await mustReject(
      tx,
      'a settled debt cannot lack one',
      `UPDATE debts SET paid_amount = 1000, status = 'SETTLED', settled_at = NULL WHERE id = $1`,
      [debtA],
      'debts_settled_at_matches_status'
    );

    await tx.query(
      `UPDATE debts SET paid_amount = 1000, status = 'SETTLED', settled_at = now() WHERE id = $1`,
      [debtA]
    );
    ok('a genuine settlement is still allowed', true);

    section('THE ORIGINAL GUARANTEES STILL HOLD');

    await mustReject(
      tx,
      'a debt with no owner is refused',
      `INSERT INTO debts (user_id, kind, person_name, original_amount) VALUES (NULL, 'LENT', 'X', 10)`,
      [],
      'null value in column "user_id"'
    );

    await mustReject(
      tx,
      'a debt owned by a user who does not exist is refused',
      `INSERT INTO debts (user_id, kind, person_name, original_amount)
       VALUES (gen_random_uuid(), 'LENT', 'X', 10)`,
      [],
      ['debts_user_id_fkey', 'debt_contacts_user_id_fkey']
    );

    await mustReject(
      tx,
      'an invented status is refused',
      `INSERT INTO debts (user_id, kind, person_name, original_amount, status)
       VALUES ($1, 'LENT', 'X', 10, 'FORGIVEN')`,
      [userA],
      'debts_status_check'
    );

    await mustReject(
      tx,
      'an invented direction is refused',
      `INSERT INTO debts (user_id, kind, person_name, original_amount)
       VALUES ($1, 'GIFTED', 'X', 10)`,
      [userA],
      'debts_kind_check'
    );

    await mustReject(
      tx,
      'a debt of zero is refused',
      `INSERT INTO debts (user_id, kind, person_name, original_amount) VALUES ($1, 'LENT', 'X', 0)`,
      [userA],
      'debts_original_amount_check'
    );

    await mustReject(
      tx,
      'a payment of zero is refused',
      `INSERT INTO debt_payments (debt_id, user_id, amount) VALUES ($1, $2, 0)`,
      [debtA, userA],
      'debt_payments_amount_check'
    );

    await mustReject(
      tx,
      'a nameless debt is refused',
      `INSERT INTO debts (user_id, kind, person_name, original_amount) VALUES ($1, 'LENT', '   ', 10)`,
      [userA],
      ['debts_person_name_check', 'debt_contacts_display_name_check']
    );

    section('DELETION STAYS CONTAINED');

    await tx.query(`DELETE FROM debts WHERE id = $1`, [debtA]);
    const orphans = await tx.query(
      `SELECT count(*)::int AS n FROM debt_payments WHERE debt_id = $1`,
      [debtA]
    );
    ok('deleting a debt takes its ledger with it', orphans.rows[0].n === 0, `${orphans.rows[0].n} left`);

    const stillThere = await tx.query(`SELECT count(*)::int AS n FROM users WHERE id = $1`, [userA]);
    ok('and leaves the student alone', stillThere.rows[0].n === 1);

    section('OTHER TABLES: OWNERSHIP IS NOT OPTIONAL');

    for (const table of ['expenses', 'income', 'goals', 'budgets', 'notifications', 'chat_messages']) {
      const nullable = await tx.query(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = $1 AND column_name = 'user_id'`,
        [table]
      );
      ok(`${table}.user_id is NOT NULL`, nullable.rows[0] && nullable.rows[0].is_nullable === 'NO');
    }

    const cascades = await tx.query(
      `SELECT conrelid::regclass::text AS table_name, confdeltype
         FROM pg_constraint WHERE contype='f' AND confrelid='users'::regclass
           AND EXISTS (SELECT 1 FROM unnest(conkey) AS k(attnum)
             JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.attnum
             WHERE a.attname='user_id')`
    );
    const notCascading = cascades.rows.filter((r) => r.confdeltype !== 'c');
    ok(
      'deleting an account removes every table that references it',
      notCascading.length === 0,
      notCascading.map((r) => `${r.table_name}=${r.confdeltype}`).join(', ') || 'all CASCADE'
    );

    await tx.query('ROLLBACK');
  } catch (err) {
    await tx.query('ROLLBACK').catch(() => {});
    console.error('\nERROR:', err.message);
    failed += 1;
    failures.push(err.message);
  } finally {
    tx.release();
    await closePool();
  }

  console.log(`\n===== ${passed} passed, ${failed} failed =====`);
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(failed ? 1 : 0);
})();
