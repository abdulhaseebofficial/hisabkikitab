/**
 * The one Postgres connection pool, plus the two helpers every repository uses.
 *
 * `pg` is enough here: Supabase speaks ordinary Postgres over TLS, so the same
 * driver works for `npm run dev` locally and for the function on Vercel. The
 * pool is created lazily so importing a repository never opens a socket - the
 * health check has to answer even when the database is unreachable.
 */

const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const { databaseUrl, DATABASE_URL_MISSING } = require('./databaseUrl');

/**
 * Supabase signs its database certificates with its own private CA, so the
 * system trust store cannot verify them and Node rejects the connection with
 * "self-signed certificate in certificate chain". The usual workaround is
 * `rejectUnauthorized: false`, which turns verification off entirely and
 * accepts any certificate at all - including an attacker's.
 *
 * Pin Supabase's published root instead. supabase-ca.crt is their
 * prod-ca-2021 root; its SHA-256 fingerprint was checked against the chain the
 * pooler actually serves before it was committed.
 */
const SUPABASE_CA = path.join(__dirname, 'supabase-ca.crt');

let supabaseCa = null;
const supabaseRootCert = () => {
  if (!supabaseCa) supabaseCa = fs.readFileSync(SUPABASE_CA, 'utf8');
  return supabaseCa;
};

/** How to speak TLS to whichever Postgres the connection string points at. */
const sslFor = (uri) => {
  let host;
  try {
    host = new URL(uri).hostname;
  } catch {
    return { rejectUnauthorized: true };
  }

  // A database on this machine has no network to eavesdrop on, and local
  // Postgres usually has no certificate at all.
  if (/^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(host)) return false;

  if (/\.supabase\.(com|co)$/i.test(host)) {
    return { ca: supabaseRootCert(), rejectUnauthorized: true };
  }

  // Neon, and anything else, presents a publicly trusted certificate.
  return { rejectUnauthorized: true };
};

/**
 * The connection string with `sslmode` removed.
 *
 * `pg` parses sslmode out of the URL and builds its own TLS settings from it,
 * which then take precedence over the `ssl` object passed alongside - so a
 * string ending in `?sslmode=require` quietly discards the pinned Supabase CA
 * and fails to verify. Strip it and let `sslFor` be the single answer to how
 * TLS is done. Every other parameter is left alone.
 */
const withoutSslMode = (uri) => {
  try {
    const url = new URL(uri);
    if (!url.searchParams.has('sslmode')) return uri;
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return uri;
  }
};

/**
 * Keep exact SQL values as strings. Callers may explicitly convert bounded
 * counts; money code converts minor-unit strings to BigInt before arithmetic.
 */
types.setTypeParser(20, (value) => {
  const parsed = BigInt(value);
  return parsed <= BigInt(Number.MAX_SAFE_INTEGER) && parsed >= BigInt(Number.MIN_SAFE_INTEGER)
    ? Number(value) : value;
});
types.setTypeParser(1700, (value) => {
  // Debt NUMERIC(14,2) remains a decimal-number API for now. Preserve larger
  // or higher-precision values as text instead of silently losing digits.
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= 999999999999.99
    && /^-?\d+(?:\.\d{1,2})?$/.test(value) ? number : value;
});

let pool = null;

/** The pool, created on first use. */
const getPool = () => {
  if (!pool) {
    const uri = databaseUrl();
    if (!uri) throw new Error(DATABASE_URL_MISSING);

    pool = new Pool({
      connectionString: withoutSslMode(uri),
      ssl: sslFor(uri),
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // A pool error with no listener would take the whole process down.
    pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  }
  return pool;
};

/** One query. Returns the rows, since that is all any caller wants. */
const query = async (text, params) => {
  const result = await getPool().query(text, params);
  return result.rows;
};

/** The first row, or undefined. */
const queryOne = async (text, params) => {
  const rows = await query(text, params);
  return rows[0];
};

/**
 * Runs `fn` inside a transaction on a single client, rolling back on throw.
 * Used where two writes must not be observed apart - contributing to a goal,
 * rotating a refresh token, deleting an account.
 */
const transaction = async (fn) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const scoped = {
      query: async (text, params) => (await client.query(text, params)).rows,
      queryOne: async (text, params) => (await client.query(text, params)).rows[0],
    };
    const result = await fn(scoped);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

/** True when a live connection can be opened and answers. */
const isConnected = async () => {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

const closePool = async () => {
  if (pool) {
    const closing = pool;
    pool = null;
    await closing.end().catch(() => {});
  }
};

module.exports = { getPool, query, queryOne, transaction, isConnected, closePool };
