/**
 * The small harness the suites share: an assertion that prints as it goes, and
 * a fetch wrapper that carries the auth token and the refresh cookie.
 *
 * Deliberately dependency-free. Node 18+ has fetch built in, so `npm run qa`
 * works on a fresh clone with nothing installed beyond the app itself.
 */

require('../../scripts/require-test-database');
const crypto = require('node:crypto');
const BASE = process.env.HW_API || 'http://localhost:5000/api';

const state = { pass: 0, failures: [], cookie: '' };

const ok = (name, condition, detail = '') => {
  const line = `${name}${detail ? '  — ' + detail : ''}`;
  if (condition) {
    state.pass += 1;
    console.log(`  ok    ${line}`);
  } else {
    state.failures.push(line);
    console.log(`  FAIL  ${line}`);
  }
  return condition;
};

const section = (title) => console.log(`\n--- ${title} ---`);
const heading = (title) => console.log(`\n########## ${title} ##########`);

/**
 * One request. Returns { status, data } with the body already parsed when it
 * is JSON, and the raw bytes when it is not - the report exports are PDFs.
 */
async function call(method, path, body, token, opts = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const financialPath = (method === 'POST' && (
    /^\/(expenses|income|debts|goals)$/.test(path) ||
    path === '/profile/onboarding' ||
    path === '/profile/onboarding' ||
    /^\/expenses\/[^/]+\/mark-paid$/.test(path) ||
    /^\/debts\/[^/]+\/(payments|settle)$/.test(path)
  )) || (method === 'PATCH' && /^\/goals\/[^/]+\/add$/.test(path));
  if (financialPath && opts.idempotencyKey !== null)
    headers['Idempotency-Key'] = opts.idempotencyKey || crypto.randomUUID();
  // `cookie` replays a specific one - needed to prove a superseded refresh
  // token is dead, since the jar has already moved on to the replacement.
  const jarCookie = opts.cookie !== undefined ? opts.cookie : state.cookie;
  if (jarCookie) headers.cookie = jarCookie;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) state.cookie = setCookie.split(';')[0];

  const type = res.headers.get('content-type') || '';
  let data = null;
  if (type.includes('json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.arrayBuffer();
  }

  return { status: res.status, data, type };
}

/**
 * The auth routes are brute-force limited to 20 attempts per 15 minutes per IP.
 * A couple of full runs will trip it, and once login returns 429 every later
 * check fails 401 - fifty failures that say nothing about the app. Stop at the
 * first 429 and say what actually happened.
 */
function bailIfRateLimited({ status }) {
  if (status !== 429) return;
  console.error('\nThe auth rate limiter has kicked in (HTTP 429).');
  console.error('It allows 20 attempts per 15 minutes and this suite uses several per run.');
  console.error('Either wait for the window to pass, or restart the API to clear it:');
  console.error('  npm run dev:api\n');
  process.exit(1);
}

/** Prints the tally and exits non-zero on any failure, so CI can gate on it. */
function report() {
  console.log(`\n===== ${state.pass} passed, ${state.failures.length} failed =====`);
  if (state.failures.length) {
    console.log('\nFAILURES:');
    state.failures.forEach((f) => console.log('  - ' + f));
    process.exitCode = 1;
  }
}

/** A clear message beats a stack trace when the API simply is not running. */
async function requireApi() {
  try {
    const res = await fetch(BASE.replace(/\/api$/, '') + '/api/health');
    const body = await res.json();
    if (body.database !== 'connected') {
      console.error(`\nThe API is up but its database is ${body.database}.`);
      // This said "Start MongoDB" long after the move to Postgres, which sent
      // whoever hit it looking for a database this app does not have.
      console.error('Check POSTGRES_URL in apps/api/.env, then run this again.');
      console.error('If several suites are running at once the pool may simply');
      console.error('be exhausted - run them one at a time.\n');
      process.exit(1);
    }
  } catch {
    console.error(`\nNo API answering on ${BASE}.`);
    console.error('Start it with:  npm run dev\n');
    process.exit(1);
  }
}

/** The refresh cookie the jar is currently holding. */
const currentCookie = () => state.cookie;

module.exports = {
  ok,
  section,
  heading,
  call,
  report,
  requireApi,
  bailIfRateLimited,
  currentCookie,
};
