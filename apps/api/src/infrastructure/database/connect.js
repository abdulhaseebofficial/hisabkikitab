const { query } = require('./pool');
const { status, migrationFiles } = require('./migrate');
const { databaseUrl, DATABASE_URL_MISSING } = require('./databaseUrl');

/**
 * Open the database only when its migration ledger exactly matches this build.
 * Normal requests must never run DDL; migrations require the explicit CLI.
 */
const connectDB = async () => {
  if (!databaseUrl()) {
    throw new Error(DATABASE_URL_MISSING);
  }

  const [{ db, version }] = await query(
    `SELECT current_database() AS db, current_setting('server_version') AS version`
  );

  const { applied, pending } = await status();
  const expected = new Set(migrationFiles());
  const unexpected = applied.map(({ name }) => name).filter((name) => !expected.has(name));
  if (pending.length || unexpected.length) {
    throw new Error(
      `Database migrations do not match this build (pending: ${pending.join(', ') || 'none'}; ` +
      `unexpected: ${unexpected.join(', ') || 'none'}). Run migrations only through the approved CLI workflow.`
    );
  }

  // The host comes from the URL rather than inet_server_addr(), which reports
  // the pooler's own loopback address and tells you nothing useful.
  const host = new URL(databaseUrl()).host;
  console.log(`[db] Postgres ${version} connected: ${host}/${db}`);
  return { db, host };
};

module.exports = connectDB;
