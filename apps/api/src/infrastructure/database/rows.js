/**
 * Row shaping.
 *
 * Postgres columns are snake_case; the API speaks camelCase and exposes the
 * primary key as `_id`, which the frontend and the QA suites both depend on.
 * Rather than spell the mapping out per column in every repository, translate
 * it in one place - so a new column is exposed correctly by default and the
 * wire format cannot drift table by table.
 */

/** snake_case -> camelCase, with `id` becoming `_id`. */
const camel = (key) => {
  if (key === 'id') return '_id';
  return key.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());
};

/**
 * One row, ready to serialise. Returns null for a missing row so callers can
 * pass a "not found" straight through.
 *
 * `omit` drops columns that must never leave the server - the password hash,
 * the reset token, the token version.
 */
const { minorToApi } = require('../../shared/finance/personalMoney');
const MONEY_PAIRS = [
  ['amount', 'amount_minor'], ['monthly_income', 'monthly_income_minor'],
  ['target_amount', 'target_amount_minor'], ['saved_amount', 'saved_amount_minor'],
  ['limit', 'limit_minor'],
];

const toApi = (row, omit = []) => {
  if (!row) return null;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (omit.includes(key)) continue;
    out[camel(key)] = value;
  }
  for (const [legacy, exact] of MONEY_PAIRS) {
    if (Object.hasOwn(row, legacy) && row[exact] != null && !omit.includes(legacy)) {
      out[camel(legacy)] = minorToApi(row[exact]);
      out[camel(exact)] = String(row[exact]);
    }
  }
  if (Array.isArray(out.contributions)) {
    out.contributions = out.contributions.map((entry) => ({ ...entry, amount: minorToApi(entry.amount) }));
  }
  return out;
};

/** The same, for a list. */
const toApiList = (rows, omit = []) => rows.map((row) => toApi(row, omit));

/**
 * A bare column name: letters, digits and underscores, not starting with a
 * digit. Values are always parameterised, but the column NAME is concatenated
 * into the statement, so it is the one position here that could carry SQL.
 */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

/**
 * Builds `SET a = $1, b = $2` from an object of column -> value, skipping
 * undefined so a partial update only touches what was actually sent. Returns
 * the fragment, the values, and the next free placeholder number.
 *
 * Every caller today passes a literal object with hard-coded column names, so
 * no request data reaches the key position. The check below is what keeps that
 * true: `buildSet(req.body)` would otherwise put user input straight into the
 * statement, and it is a plausible shortcut for someone adding the next
 * endpoint. Throwing here turns that mistake into an immediate, obvious
 * failure rather than an injection.
 */
const buildSet = (patch, startAt = 1) => {
  const fragments = [];
  const values = [];
  let n = startAt;
  for (const [column, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (!IDENTIFIER.test(column)) {
      throw new Error(`buildSet: "${column}" is not a column name. Pass literal columns, never request data.`);
    }
    fragments.push(`${column} = $${n}`);
    values.push(value);
    n += 1;
  }
  return { fragment: fragments.join(', '), values, next: n };
};

/**
 * True when the string is a syntactically valid UUID.
 *
 * Postgres raises 22P02 for a malformed uuid, which would surface as a 500.
 * Every lookup by id checks this first and reports "not found" instead, which
 * is what the old ObjectId CastError path did.
 */
const isUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

module.exports = {
  toApi,
  toApiList,
  buildSet,
  isUuid,
};
