/**
 * Read-only inventory of recurring schedules, and a reconciliation proposal.
 *
 *   node -r dotenv/config scripts/recurring-drift-inventory.js dotenv_config_path=apps/api/.env
 *
 * A monthly series is anchored on a day of the month; `next_run_at` should sit
 * on that day or on the last day of a shorter month. Rows where it does not are
 * the historical drift: before the anchor was respected, a series that passed
 * through February kept the clamped day forever, so a rent bill due on the 31st
 * silently became due on the 28th.
 *
 * Nothing is rewritten here. Moving a due date changes which accounting month an
 * occurrence lands in, so each proposal is printed for a human to approve.
 *
 * HOW THE READ-ONLY GUARANTEE WORKS
 *
 * Everything below runs on one client inside `BEGIN TRANSACTION READ ONLY`, and
 * the transaction is rolled back rather than committed. Postgres then refuses
 * INSERT, UPDATE, DELETE, TRUNCATE and every form of DDL with error 25006, so
 * the guarantee does not rest on this file containing only SELECTs.
 *
 * It is written this way because the obvious version is not safe. `SET SESSION
 * CHARACTERISTICS AS TRANSACTION READ ONLY` applies to the one pooled
 * connection that happened to run it; the next query can be handed a different
 * connection where the setting was never applied, and a write on that
 * connection succeeds. That was measured, not assumed. A single client inside an
 * explicit read-only transaction has no such gap, and `assertReadOnly` proves it
 * at runtime before any data is read.
 */

const { getPool, closePool } = require('../apps/api/src/infrastructure/database/pool');

/** Postgres: cannot execute X in a read-only transaction. */
const READ_ONLY_VIOLATION = '25006';

const daysInMonthOf = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();

const iso = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

/** The same consistency rule the scheduler applies, so both agree on "drifted". */
const anchorFitsPointer = (anchor, pointer) => {
  const anchorDay = anchor.getUTCDate();
  const pointerDay = pointer.getUTCDate();
  return anchorDay === pointerDay
    || (anchorDay > pointerDay && pointerDay === daysInMonthOf(pointer));
};

const classify = (row) => {
  const anchor = new Date(row.date);
  const pointer = new Date(row.next_run_at);
  if (row.recurring_frequency !== 'monthly') return { kind: 'non-monthly' };
  if (anchorFitsPointer(anchor, pointer)) return { kind: 'consistent' };
  // The clamp signature: the anchor is a late day, the pointer sits earlier and
  // is not a month end, which is what a pre-fix February left behind.
  const clamped = anchor.getUTCDate() > pointer.getUTCDate()
    && pointer.getUTCDate() !== daysInMonthOf(pointer);
  return { kind: clamped ? 'drifted-clamped' : 'anchor-mismatch' };
};

/**
 * Proves the transaction really refuses writes before anything is read.
 *
 * The attempt is the cheapest write there is and it is wrapped in a savepoint,
 * so a refusal costs nothing and leaves the transaction usable. If the write is
 * *allowed*, this connection is not read-only and the audit stops: on a
 * production database, carrying on would mean every later statement is running
 * with write permission it was promised not to have.
 */
const assertReadOnly = async (client) => {
  await client.query('SAVEPOINT read_only_assertion');
  let refusedWith = null;
  try {
    await client.query('CREATE TEMP TABLE hkk_read_only_assertion (probe int)');
  } catch (err) {
    refusedWith = err.code;
  }
  await client.query('ROLLBACK TO SAVEPOINT read_only_assertion');
  await client.query('RELEASE SAVEPOINT read_only_assertion');

  if (refusedWith !== READ_ONLY_VIOLATION) {
    throw new Error(
      'refusing to run: this connection accepted a write, so the read-only '
      + `transaction is not in force (expected ${READ_ONLY_VIOLATION}, got `
      + `${refusedWith === null ? 'no error' : refusedWith}).`
    );
  }
  return true;
};

const main = async () => {
  const client = await getPool().connect();
  let started = false;
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    started = true;
    await assertReadOnly(client);

    const q = async (text, params) => (await client.query(text, params)).rows;

    const templates = await q(
      `SELECT id, user_id, finance_mode, category, description,
              date, next_run_at, recurring_frequency
         FROM expenses
        WHERE is_recurring AND next_run_at IS NOT NULL
        ORDER BY user_id, next_run_at`
    );

    // recurrence_occurrence arrived with migration 0015. An environment behind
    // that still has schedules worth inventorying, so fall back to the pointer
    // that has always been there rather than refusing to report.
    // Resolved through regclass, not information_schema: a database that has
    // collected leftover per-run test schemas has several tables called
    // "expenses", and only the one on the search path is the live set.
    const marked = await q(
      `SELECT 1 FROM pg_attribute
        WHERE attrelid='expenses'::regclass AND attname='recurrence_occurrence'
          AND NOT attisdropped`
    );
    if (!marked.length) {
      console.log('[inventory] note: this database predates migration 0015, so occurrences');
      console.log('[inventory]       are counted by generated_from alone.');
    }
    const occurrences = await q(
      `SELECT generated_from, count(*)::int AS generated,
              min(date) AS first_generated, max(date) AS last_generated,
              count(DISTINCT date)::int AS distinct_dates
         FROM expenses
        WHERE generated_from IS NOT NULL ${marked.length ? 'AND recurrence_occurrence' : ''}
        GROUP BY generated_from`
    );
    const byTemplate = new Map(occurrences.map((row) => [row.generated_from, row]));

    const buckets = { consistent: [], 'drifted-clamped': [], 'anchor-mismatch': [], 'non-monthly': [] };
    for (const row of templates) buckets[classify(row).kind].push(row);

    const [{ d: database, u: role }] = await q(
      'SELECT current_database() AS d, current_user AS u'
    );

    console.log('=== RECURRING SCHEDULE INVENTORY (read-only) ===');
    console.log(`database            : ${database}`);
    console.log(`connected as        : ${role}`);
    console.log('write protection    : BEGIN TRANSACTION READ ONLY, asserted at runtime');
    console.log(`taken at            : ${new Date().toISOString()}`);
    console.log(`recurring templates : ${templates.length}`);
    console.log(`  monthly consistent: ${buckets.consistent.length}`);
    console.log(`  monthly drifted   : ${buckets['drifted-clamped'].length}`);
    console.log(`  anchor mismatch   : ${buckets['anchor-mismatch'].length}`);
    console.log(`  daily / weekly    : ${buckets['non-monthly'].length}`);
    console.log(`generated occurrences: ${occurrences.reduce((sum, row) => sum + row.generated, 0)}`);

    const duplicated = occurrences.filter((row) => row.generated !== row.distinct_dates);
    console.log(`templates with two occurrences on one date: ${duplicated.length}`);
    for (const row of duplicated) {
      console.log(`  ! template ${row.generated_from}: ${row.generated} rows across ${row.distinct_dates} dates`);
    }

    const needsReview = [...buckets['drifted-clamped'], ...buckets['anchor-mismatch']];
    if (!needsReview.length) {
      console.log('\nNo drifted monthly schedules. No reconciliation proposed.');
      return;
    }

    console.log('\n=== RECONCILIATION PROPOSAL (nothing applied) ===');
    console.log('Each line is a suggestion for review. Applying any of these changes which');
    console.log('accounting month the next occurrence falls in, so they need sign-off and a');
    console.log('migration plan, not a script run.\n');
    for (const row of needsReview) {
      const kind = classify(row).kind;
      const current = new Date(row.next_run_at);
      // The next date this series would fall on if it were re-anchored on the
      // template's day. Computed here rather than through `advance`, because
      // `advance` deliberately refuses an anchor that does not fit the pointer -
      // which is the whole reason this row is in the list.
      const anchorDay = new Date(row.date).getUTCDate();
      const proposed = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
      proposed.setUTCDate(Math.min(anchorDay, daysInMonthOf(proposed)));
      const history = byTemplate.get(row.id);
      console.log(`template ${row.id}  user ${row.user_id}  mode ${row.finance_mode}`);
      console.log(`  ${kind}: anchor day ${new Date(row.date).getUTCDate()} vs next_run_at ${iso(row.next_run_at)}`);
      console.log(`  label: ${row.category}${row.description ? ` - ${row.description}` : ''}`);
      console.log(`  generated so far: ${history ? `${history.generated} rows, ${iso(history.first_generated)} to ${iso(history.last_generated)}` : 'none'}`);
      console.log(`  current next due: ${iso(row.next_run_at)}`);
      console.log(`  honouring anchor would resume on: ${iso(proposed)}`);
      console.log(`  safe option: leave the pointer alone. The scheduler now ignores an`);
      console.log(`               anchor that does not fit, so this row keeps its present`);
      console.log(`               day and generates no duplicates.\n`);
    }
  } finally {
    // Rolled back, never committed. There is nothing to commit, and a rollback
    // is the honest end to a transaction that was only ever allowed to read.
    if (started) await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
};

// Exported for tests/db/audit-read-only.test.js, which is what keeps the
// read-only guarantee from regressing.
module.exports = { assertReadOnly, READ_ONLY_VIOLATION };

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`[inventory] ${err.message}`);
      process.exitCode = 1;
    })
    .finally(closePool);
}
