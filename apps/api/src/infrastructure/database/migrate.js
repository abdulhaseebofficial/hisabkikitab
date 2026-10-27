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
const crypto = require('crypto');
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

/**
 * The content hash of a migration file.
 *
 * Line endings are normalised to LF first. The same file checked out on
 * Windows and on the Linux build host differs only by CRLF, and a checksum
 * that disagreed across platforms would be worse than no checksum at all -
 * it would refuse to start for a difference that does not exist.
 */
const checksumOf = (name) => {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
};

/**
 * Creates the ledger and, separately, makes sure it can hold a checksum.
 *
 * The ALTER is bookkeeping for the ledger table itself, not an application
 * schema change, so it deliberately does NOT get a numbered migration: adding
 * one would make every deployed build report a pending migration and refuse to
 * start. It runs only from the migrate CLI. Startup never calls this.
 */
const ensureLedger = async (client) => {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name        text        PRIMARY KEY,
       applied_at  timestamptz NOT NULL DEFAULT now()
     )`
  );
  // Nullable on purpose: rows written before this existed keep NULL, and are
  // reported as unverified rather than treated as corrupt.
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
};

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
      await client.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [name, checksumOf(name)]
      );
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

/**
 * What has been applied, oldest first, plus what no longer matches.
 *
 * Strictly read-only - startup calls this, and startup must never run DDL.
 * The column probe exists because a database migrated before checksums were
 * introduced has no `checksum` column yet, and asking for it would throw.
 *
 * `changed`     - applied with a recorded checksum that no longer matches the
 *                 file on disk. An already-applied migration was edited.
 * `unverified`  - applied before checksums existed. Not an error; it simply
 *                 cannot be proven either way until adopted.
 */
const status = async () => {
  const probe = await getPool().query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='schema_migrations'
                AND column_name='checksum') AS present`
  );
  const hasChecksum = probe.rows[0].present;

  const { rows } = await getPool().query(
    hasChecksum
      ? `SELECT name, applied_at, checksum FROM schema_migrations ORDER BY name`
      : `SELECT name, applied_at, NULL::text AS checksum FROM schema_migrations ORDER BY name`
  );

  const files = migrationFiles();
  const onDisk = new Set(files);
  const pending = files.filter((n) => !rows.some((r) => r.name === n));

  const changed = [];
  const unverified = [];
  for (const row of rows) {
    if (!onDisk.has(row.name)) continue; // reported separately as unexpected
    if (row.checksum == null) { unverified.push(row.name); continue; }
    if (row.checksum !== checksumOf(row.name)) changed.push(row.name);
  }

  return { applied: rows, pending, changed, unverified };
};

/**
 * Stamps the current file hash onto rows that predate checksums.
 *
 * An explicit operator action, never automatic: it asserts "the schema this
 * database is running really is what these files produce". Run it only after
 * that has actually been established - comparing the deployed schema against a
 * freshly migrated one is the way to establish it. Rows that already carry a
 * checksum are left alone, so this can never overwrite real evidence.
 */
const adopt = async () => {
  const client = await getPool().connect();
  const stamped = [];
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    await ensureLedger(client);
    const { rows } = await client.query(
      'SELECT name FROM schema_migrations WHERE checksum IS NULL ORDER BY name'
    );
    const onDisk = new Set(migrationFiles());
    for (const { name } of rows) {
      if (!onDisk.has(name)) continue;
      await client.query(
        'UPDATE schema_migrations SET checksum = $2 WHERE name = $1 AND checksum IS NULL',
        [name, checksumOf(name)]
      );
      stamped.push(name);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return stamped;
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

  if (process.argv[2] === 'adopt') {
    adopt()
      .then((stamped) => {
        console.log(stamped.length
          ? `[migrate] checksums adopted for ${stamped.length}: ${stamped.join(', ')}`
          : '[migrate] nothing to adopt; every applied migration already has a checksum');
      })
      .catch((err) => {
        console.error('[migrate] adopt failed:', err.message);
        process.exitCode = 1;
      })
      .finally(closePool);
  } else {
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
}

module.exports = { migrate, status, tableNames, migrationFiles, checksumOf, adopt };
