const { query } = require('./pool');
const { status, migrationFiles } = require('./migrate');
const { databaseUrl, DATABASE_URL_MISSING } = require('./databaseUrl');

/**
 * Open the database only when its migration ledger exactly matches this build.
 *
 * Two separate guarantees, and both matter.
 *
 * Migrations are an explicit release operation (`npm run migrate`), never an
 * application startup side effect, so a cold production function cannot apply
 * an unapproved migration merely because a new build was deployed.
 *
 * And a build whose ledger does not match refuses to serve at all. Pending
 * migrations mean the code expects columns the database does not have;
 * unexpected applied migrations mean the database is ahead of this build, which
 * is what a rollback to an older build looks like. Either way the safe answer
 * for a financial application is to fail closed rather than serve reads and
 * writes against a schema it does not understand.
 */
const connectDB = async () => {
  if (!databaseUrl()) {
    throw new Error(DATABASE_URL_MISSING);
  }

  const [{ db, version }] = await query(
    `SELECT current_database() AS db, current_setting('server_version') AS version`
  );

  const { applied, pending, changed, unverified } = await status();
  const expected = new Set(migrationFiles());
  const unexpected = applied.map(({ name }) => name).filter((name) => !expected.has(name));

  // `changed` is the third way a schema can disagree with its build, and the
  // only one the name comparison above cannot see: a migration that already ran
  // somewhere was edited afterwards. The ledger still lists it, the file still
  // exists, and the names match perfectly - but the database was built from
  // different SQL than this build ships. Refuse that too.
  if (pending.length || unexpected.length || changed.length) {
    throw new Error(
      `Database migrations do not match this build (pending: ${pending.join(', ') || 'none'}; ` +
      `unexpected: ${unexpected.join(', ') || 'none'}; ` +
      `edited after apply: ${changed.join(', ') || 'none'}). ` +
      'Run migrations only through the approved CLI workflow.'
    );
  }

  // The host comes from the URL rather than inet_server_addr(), which reports
  // the pooler's own loopback address and tells you nothing useful.
  const host = new URL(databaseUrl()).host;
  // Not a failure: rows applied before checksums existed cannot be proven
  // either way. Say so once, so it is visible rather than silently assumed.
  if (unverified.length) {
    console.log(
      `[db] ${unverified.length} migration(s) predate checksum tracking and are unverified; ` +
      'run `npm run migrate:adopt` once the running schema has been confirmed.'
    );
  }

  console.log(`[db] Postgres ${version} connected: ${host}/${db}`);
  return { db, host };
};

module.exports = connectDB;
