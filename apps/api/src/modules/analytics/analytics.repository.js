/**
 * The read side.
 *
 * Two kinds of query live here. The aggregates - plain GROUP BY, returning a
 * `{ _id, total }` row shape so the pure helpers in utils/calculations.js can
 * stay ignorant of where the numbers came from. And a small number of plain
 * reads of rows that other features own.
 *
 * That second kind is deliberate. A monthly snapshot is limits, goals and
 * spending seen together; fetching the first two through the budgets and goals
 * services made analytics depend on the very modules that depend on it for
 * their progress figures. These are reads, not rules - no limit is decided
 * here, no goal is completed here - so owning the SELECT costs nothing but
 * removes the circle.
 */

const { query, queryOne } = require('../../infrastructure/database/pool');
const { toApiList } = require('../../infrastructure/database/rows');
const { minorToApi } = require('../../shared/finance/personalMoney');

/** Total expenses grouped by category, biggest first. */
const categoryTotals = async (userId, financeMode, from, to) => {
  const rows = await query(
    `SELECT category AS _id, sum(amount_minor)::text AS total_minor, count(*)::bigint AS count
       FROM expenses
      WHERE user_id = $1 AND finance_mode = $4 AND date >= $2 AND date <= $3
      GROUP BY category
      ORDER BY sum(amount_minor) DESC`,
    [userId, from, to, financeMode]
  );
  return rows.map((r) => ({ _id: r._id, totalMinor: r.total_minor, count: Number(r.count) }));
};

/** Total expenses for a date range. */
const totalSpent = async (userId, financeMode, from, to) => {
  const row = await queryOne(
    `SELECT COALESCE(sum(amount_minor), 0)::text AS total FROM expenses
      WHERE user_id = $1 AND finance_mode = $4 AND date >= $2 AND date <= $3`,
    [userId, from, to, financeMode]
  );
  return row.total;
};

/** Total logged income for a date range. */
const totalIncome = async (userId, financeMode, from, to) => {
  const row = await queryOne(
    `SELECT COALESCE(sum(amount_minor), 0)::text AS total FROM income
      WHERE user_id = $1 AND finance_mode = $4 AND date >= $2 AND date <= $3`,
    [userId, from, to, financeMode]
  );
  return row.total;
};

/**
 * Spend per day, keyed 'YYYY-MM-DD'.
 *
 * Financial date inputs are stored at UTC midnight. Group on that same UTC
 * calendar date so the server's timezone cannot put a chosen day in yesterday.
 */
const dailyTotals = async (userId, financeMode, from, to) => {
  const rows = await query(
    `SELECT to_char(date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS _id,
            sum(amount_minor)::text AS total_minor
       FROM expenses
      WHERE user_id = $1 AND finance_mode = $4 AND date >= $2 AND date <= $3
      GROUP BY 1
      ORDER BY 1`,
    [userId, from, to, financeMode]
  );
  return rows.map((r) => ({ _id: r._id, totalMinor: r.total_minor }));
};

/** How many expenses fall in a range. */
const countExpenses = async (userId, financeMode, from, to) => {
  const row = await queryOne(
    `SELECT count(*)::bigint AS n FROM expenses
      WHERE user_id = $1 AND finance_mode = $4 AND date >= $2 AND date <= $3`,
    [userId, from, to, financeMode]
  );
  return Number(row.n);
};

/** The single biggest expenses in a range. */
const topExpenses = async (userId, financeMode, from, to, limit = 5) => {
  const rows = await query(
    `SELECT id, amount_minor, category, description, date FROM expenses
      WHERE user_id = $1 AND finance_mode = $4 AND date >= $2 AND date <= $3
      ORDER BY amount_minor DESC LIMIT $5`,
    [userId, from, to, financeMode, limit]
  );
  return rows.map((r) => ({
    _id: r.id,
    amount: minorToApi(r.amount_minor),
    category: r.category,
    description: r.description,
    date: r.date,
  }));
};

/**
 * The category limits a student set for a month, so budgetProgress can put
 * them beside what was actually spent. Ordered by category to match how the
 * budgets screen lists them.
 */
const budgetLimitsFor = async (userId, financeMode, month, year) => {
  const rows = await query(
    `SELECT id, user_id, category, "limit", limit_minor, month, year, created_at, updated_at
       FROM budgets WHERE user_id = $1 AND finance_mode = $4 AND month = $2 AND year = $3
       ORDER BY category`,
    [userId, month, year, financeMode]
  );
  return toApiList(rows);
};

/** The open goals a snapshot shows, nearest deadline first. */
const openGoalsFor = async (userId, limit = 5) => {
  const rows = await query(
    `SELECT * FROM goals WHERE user_id = $1 AND NOT is_completed
      ORDER BY deadline NULLS LAST LIMIT $2`,
    [userId, limit]
  );
  return toApiList(rows);
};

module.exports = {
  categoryTotals,
  budgetLimitsFor,
  openGoalsFor,
  totalSpent,
  totalIncome,
  dailyTotals,
  countExpenses,
  topExpenses,
};
