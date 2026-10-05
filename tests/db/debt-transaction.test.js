const path = require('path');
/**
 * The two things about recording a payment that only a real database can prove.
 *
 * Everything else about udhaar is covered through the API in
 * tests/e2e/debts.test.js. These two are different: one needs genuine
 * concurrency, and the other needs a failure in the middle of a transaction.
 * Neither can be faked convincingly, and both are the kind of bug that only
 * shows up under load, on someone else's money.
 *
 *   1. Two payments racing for the same debt must not both read the same
 *      balance and both write against it. The repository takes FOR UPDATE on
 *      the debt row; this checks that it works rather than trusting that it is
 *      spelled correctly.
 *
 *   2. If the ledger row is written and the debt update then fails, neither may
 *      survive. A payment recorded against a balance that never moved is money
 *      the student paid and the app forgot.
 *
 * Runs against whatever apps/api/.env points at, creates its own throwaway
 * account, and deletes it at the end.
 */
require('../../scripts/require-test-database');
require('../../scripts/require-test-database');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'apps', 'api', '.env') });

const API = path.join(__dirname, '..', '..', 'apps', 'api');
const { query, queryOne, transaction, closePool } = require(path.join(API, 'src/infrastructure/database/pool'));
const debtsRepo = require(path.join(API, 'src/modules/debts/debts.repository'));

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
const section = (t) => console.log(`\n--- ${t} ---`);

(async () => {
  let userId = null;

  try {
    const user = await queryOne(
      `INSERT INTO users (name, email, password) VALUES ('Txn test', $1, 'not-a-real-hash')
       RETURNING id`,
      [`debt_txn_${Date.now()}@test.local`]
    );
    userId = user.id;

    /* ------------------------------------------------------------------ */
    section('CONCURRENT PAYMENTS CANNOT OVERSHOOT THE BALANCE');

    const raced = await queryOne(
      `INSERT INTO debts (user_id, kind, person_name, original_amount)
       VALUES ($1, 'BORROWED', 'Race', 100) RETURNING id, contact_id`,
      [userId]
    );

    // Ten simultaneous payments of 30 against a debt of 100. At most three can
    // be accepted. Without the row lock, several would read paid_amount = 0 and
    // each conclude there was room.
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        debtsRepo.addPayment(raced.id, 'student', userId, { amount: 30 }).catch((e) => ({ reason: 'THREW', error: e.message }))
      )
    );

    const accepted = attempts.filter((r) => r.reason === 'OK').length;
    const refused = attempts.filter((r) => r.reason === 'OVERPAY').length;
    const threw = attempts.filter((r) => r.reason === 'THREW');

    ok('no attempt crashed', threw.length === 0, threw.map((t) => t.error).join('; ') || 'none threw');
    ok('exactly three payments of 30 fit into 100', accepted === 3, `${accepted} accepted, ${refused} refused as overpayment`);

    const after = await queryOne(
      `SELECT paid_amount, original_amount, status FROM debts WHERE id = $1`, [raced.id]);
    ok('the balance is exactly what was accepted', Number(after.paid_amount) === accepted * 30,
      `paid_amount = ${after.paid_amount}`);
    ok('the balance never exceeded the debt', Number(after.paid_amount) <= Number(after.original_amount),
      `${after.paid_amount} <= ${after.original_amount}`);

    const ledger = await query(
      `SELECT count(*)::int AS n, coalesce(sum(amount), 0) AS total
         FROM debt_payments WHERE debt_id = $1`, [raced.id]);
    ok('the ledger holds one row per accepted payment', ledger[0].n === accepted, `${ledger[0].n} rows`);
    ok('and the ledger sums to the balance', Number(ledger[0].total) === Number(after.paid_amount),
      `${ledger[0].total} = ${after.paid_amount}`);

    /* ------------------------------------------------------------------ */
    section('A FAILURE AFTER THE LEDGER WRITE ROLLS BACK BOTH');

    const rollback = await queryOne(
      `INSERT INTO debts (user_id, kind, person_name, original_amount)
       VALUES ($1, 'LENT', 'Rollback', 500) RETURNING id`,
      [userId]
    );

    // The same two writes the repository makes, in the same order, with a
    // failure between them. This is the guarantee addPayment depends on: if
    // the second write cannot happen, the first must not survive either.
    let threwAsExpected = false;
    try {
      await transaction(async (tx) => {
        await tx.query(
          `INSERT INTO debt_payments (debt_id, user_id, amount) VALUES ($1, $2, 200)`,
          [rollback.id, userId]
        );
        await tx.query(
          `UPDATE debts SET paid_amount = 200, status = 'PARTIALLY_PAID' WHERE id = $1`,
          [rollback.id]
        );
        throw new Error('simulated failure before commit');
      });
    } catch (err) {
      threwAsExpected = err.message === 'simulated failure before commit';
    }

    ok('the failure reached the caller', threwAsExpected);

    const orphans = await query(
      `SELECT count(*)::int AS n FROM debt_payments WHERE debt_id = $1`, [rollback.id]);
    ok('no ledger row survived', orphans[0].n === 0, `${orphans[0].n} rows`);

    const untouched = await queryOne(
      `SELECT paid_amount, status FROM debts WHERE id = $1`, [rollback.id]);
    ok('the balance never moved', Number(untouched.paid_amount) === 0, `paid_amount = ${untouched.paid_amount}`);
    ok('and the status never moved', untouched.status === 'PENDING', untouched.status);

    /* ------------------------------------------------------------------ */
    section('A PAYMENT CANNOT REACH ANOTHER STUDENT\'S DEBT');

    const stranger = await queryOne(
      `INSERT INTO users (name, email, password) VALUES ('Other', $1, 'x') RETURNING id`,
      [`debt_txn_other_${Date.now()}@test.local`]
    );

    const theirs = await debtsRepo.addPayment(raced.id, 'student', stranger.id, { amount: 10 });
    ok('paying a debt you do not own is not found', theirs.reason === 'NOT_FOUND', theirs.reason);

    const unchanged = await queryOne(`SELECT paid_amount FROM debts WHERE id = $1`, [raced.id]);
    ok('and the balance is untouched by the attempt',
      Number(unchanged.paid_amount) === accepted * 30, `paid_amount = ${unchanged.paid_amount}`);

    await query(`DELETE FROM users WHERE id = $1`, [stranger.id]);

    /* ------------------------------------------------------------------ */
    section('A DEBT IS INVISIBLE FROM THE OTHER FINANCE MODE');

    // The record still belongs to this person. It belongs to their student
    // life, and looking at their household should not find it - otherwise the
    // two sets of books are one set with a label on it.
    const fromOtherMode = await debtsRepo.findById(raced.id, 'householder', userId);
    ok('the same person cannot see it from the other mode', fromOtherMode === null,
      fromOtherMode ? 'it was returned' : 'not found, as it should be');

    const payFromOtherMode = await debtsRepo.addPayment(raced.id, 'householder', userId, { amount: 5 });
    ok('and cannot pay it from there either', payFromOtherMode.reason === 'NOT_FOUND',
      payFromOtherMode.reason);

    const stillOwn = await debtsRepo.findById(raced.id, 'student', userId);
    ok('while their own mode still finds it', stillOwn !== null);

    const houseSummary = await debtsRepo.summary(userId, 'householder');
    ok('and it counts for nothing in the other mode totals',
      Number(houseSummary.payable) === 0, `payable = ${houseSummary.payable}`);

    section('ONE PROFILE GROUPS BOTH DIRECTIONS');
    await query(`INSERT INTO debts (user_id, finance_mode, kind, contact_id, person_name, original_amount)
      VALUES ($1, 'student', 'LENT', $2, ' race ', 20)`, [userId, raced.contact_id]);
    const grouped = await debtsRepo.people(userId, 'student');
    const race = grouped.items.filter((person) => person.contactId === raced.contact_id);
    ok('one person has one ledger', race.length === 1 && race[0].recordCount === 2,
      JSON.stringify(race));
    ok('the net balance combines lending and borrowing', race[0]?.netBalance === 10,
      String(race[0]?.netBalance));
    const records = await debtsRepo.personRecords(userId, 'student', raced.contact_id);
    ok('both directions are available in that ledger', records.items.length === 2 &&
      new Set(records.items.map((item) => item.kind)).size === 2);
  } catch (err) {
    console.error('\nERROR:', err.message);
    failed += 1;
    failures.push(err.message);
  } finally {
    // Every debt, payment and row created here hangs off this user by CASCADE.
    if (userId) await query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => {});
    await closePool();
  }

  console.log(`\n===== ${passed} passed, ${failed} failed =====`);
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(failed ? 1 : 0);
})();
