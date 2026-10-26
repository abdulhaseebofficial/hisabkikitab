/**
 * The migration runner.  `npm run migrate`
 *
 * Migrations are numbered files in database/migrations/, applied in name order
 * and never edited once they have run anywhere. Each one is applied in its own
 * transaction and recorded in schema_migrations, so a second run is a no-op and
 * a failure leaves the database exactly as it was.
 *
 * Only the explicit CLI invokes migrate(). Normal API requests check the
 * ledger read-only and reject a mismatched schema.
 *
 * 0001 is the schema as it already exists in production. It is written with
 * IF NOT EXISTS throughout, so recording it against a database that was
 * provisioned before this runner existed changes nothing.
 */

const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('./pool');
const { migrationUrl } = require('./databaseUrl');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'database', 'migrations');

// Arbitrary, but must be the same in every process that migrates.
const LOCK_ID = 4711001;

/** The migration files, in the order they must be applied. */
const migrationFiles = () => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`No migrations directory at ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
};

const ensureLedger = (client) =>
  client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name        text        PRIMARY KEY,
       applied_at  timestamptz NOT NULL DEFAULT now()
     )`
  );

/**
 * Applies whatever has not run yet.
 *
 * Returns the names applied, so the caller can say something useful rather
 * than printing the same line whether or not anything happened.
 */
const migrate = async () => {
  const client = await getPool().connect();
  const applied = [];

  try {
    // Transaction-scoped, so it is released by the COMMIT or ROLLBACK below
    // whatever happens - including a crash mid-migration.
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    await ensureLedger(client);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));

    for (const name of migrationFiles()) {
      if (done.has(name)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      applied.push(name);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return applied;
};

/** What has been applied, oldest first. */
const status = async () => {
  const { rows } = await getPool().query(
    `SELECT name, applied_at FROM schema_migrations ORDER BY name`
  );
  const pending = migrationFiles().filter((n) => !rows.some((r) => r.name === n));
  return { applied: rows, pending };
};

/** The tables the app expects, for the summary line and for the QA suite. */
const tableNames = async () => {
  const { rows } = await getPool().query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
      ORDER BY table_name`
  );
  return rows.map((r) => r.table_name);
};

if (require.main === module) {
  // Run from the command line, migrations take the direct connection when the
  // host publishes one. Inside the app the existing pool is reused instead:
  // opening a second one on a serverless instance to apply nothing would cost
  // a connection on every cold start.
  const direct = migrationUrl();
  if (direct) process.env.DATABASE_URL = direct;

  migrate()
    .then(async (applied) => {
      const tables = await tableNames();
      if (applied.length) {
        console.log(`[migrate] applied ${applied.length}: ${applied.join(', ')}`);
      } else {
        console.log('[migrate] already up to date');
      }
      console.log(`[migrate] ${tables.length} tables: ${tables.join(', ')}`);
    })
    .catch((err) => {
      console.error('[migrate] failed:', err.message);
      process.exitCode = 1;
    })
    .finally(closePool);
}

module.exports = { migrate, status, tableNames, migrationFiles };
