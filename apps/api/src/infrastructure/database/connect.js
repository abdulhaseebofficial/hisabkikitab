const { query } = require('./pool');
const { databaseUrl, DATABASE_URL_MISSING } = require('./databaseUrl');

/**
 * Open the database without changing its schema. Migrations are deliberately
 * an explicit release operation (`npm run migrate`), never an application
 * startup side effect. This prevents a cold production function from applying
 * an unapproved migration merely because a new build was deployed.
 */
const connectDB = async () => {
  if (!databaseUrl()) {
    throw new Error(DATABASE_URL_MISSING);
  }

  const [{ db, version }] = await query(
    `SELECT current_database() AS db, current_setting('server_version') AS version`
  );

  // The host comes from the URL rather than inet_server_addr(), which reports
  // the pooler's own loopback address and tells you nothing useful.
  const host = new URL(databaseUrl()).host;
  console.log(`[db] Postgres ${version} connected: ${host}/${db}`);
  return { db, host };
};

module.exports = connectDB;
