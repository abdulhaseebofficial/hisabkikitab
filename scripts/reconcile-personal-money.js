/** Read-only, aggregate-only preflight against a disposable PostgreSQL copy. */
require('./require-test-database');
const { getPool, closePool } = require('../apps/api/src/infrastructure/database/pool');

const columns = [
  ['users', 'monthly_income'], ['expenses', 'amount'], ['income', 'amount'],
  ['goals', 'target_amount'], ['goals', 'saved_amount'],
  ['goal_contributions', 'amount'], ['budgets', 'limit'],
];

async function main() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN READ ONLY');
    for (const [table, column] of columns) {
      // Identifiers come exclusively from the static list above.
      const name = column === 'limit' ? '"limit"' : column;
      const { rows: [summary] } = await client.query(`
        SELECT count(*)::integer AS rows,
          count(*) FILTER (WHERE ${name}::text IN ('NaN', 'Infinity', '-Infinity'))::integer AS non_finite,
          count(*) FILTER (WHERE CASE WHEN ${name}::text IN ('NaN', 'Infinity', '-Infinity')
            THEN false ELSE ${name}::numeric * 100 <> trunc(${name}::numeric * 100) END)::integer AS sub_minor,
          count(*) FILTER (WHERE CASE WHEN ${name}::text IN ('NaN', 'Infinity', '-Infinity')
            THEN false ELSE ${name}::numeric * 100 < -9223372036854775808 OR
              ${name}::numeric * 100 > 9223372036854775807 END)::integer AS out_of_range,
          max(abs(CASE WHEN ${name}::text IN ('NaN', 'Infinity', '-Infinity') THEN NULL
            ELSE ${name}::numeric * 100 - round(${name}::numeric * 100) END)) AS max_minor_discrepancy
        FROM ${table}`);
      console.log(JSON.stringify({ table, column, ...summary }));
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}
main().catch(error => { console.error('[reconcile] failed:', error.message); process.exitCode = 1; });
