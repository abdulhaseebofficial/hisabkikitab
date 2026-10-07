/**
 * Expense reads and writes, including the filtered list behind the Expenses
 * page. Replaces models/Expense.js.
 */

const { query, queryOne, transaction } = require('../../infrastructure/database/pool');
const { toApi, toApiList, buildSet, isUuid } = require('../../infrastructure/database/rows');
const { decimalToMinor, minor, minorToApi } = require('../../shared/finance/personalMoney');

// Sort keys the client is allowed to ask for, mapped to real columns so the
// query string can never reach the SQL.
const SORT_COLUMNS = {
  date: 'date',
  amount: 'amount_minor',
  category: 'category',
  createdAt: 'created_at',
};

/**
 * `%` and `_` are wildcards to LIKE, so escape them in user text - otherwise a
 * search for "50%" matches everything. `\` is the escape character.
 */
const escapeLike = (input) => String(input).replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Turns the query string into a WHERE clause and its parameters.
 *
 * Returns the SQL fragment (without the WHERE keyword), the values, and the
 * next free placeholder number so the caller can append LIMIT/OFFSET.
 */
/**
 * The WHERE every expense query starts from.
 *
 * Two clauses, always, before anything the caller asked for: whose row it is,
 * and which life it belongs to. A household gas bill must not appear in a
 * student's month, and a filter combination must not be able to drop either
 * one - which is why they are clauses 0 and 1 rather than something appended
 * later.
 */
const buildWhere = (userId, financeMode, q = {}) => {
  const clauses = ['user_id = $1', 'finance_mode = $2'];
  const values = [userId, financeMode];
  let n = 3;

  const { from, to, category, paymentMethod, minAmount, maxAmount, search, isRecurring } = q;

  if (from) {
    clauses.push(`date >= $${n}`);
    values.push(new Date(from));
    n += 1;
  }
  if (to) {
    const end = new Date(to);
    end.setUTCHours(23, 59, 59, 999); // API date-only bounds use UTC calendar days
    clauses.push(`date <= $${n}`);
    values.push(end);
    n += 1;
  }

  if (category) {
    clauses.push(`category = ANY($${n})`);
    values.push(String(category).split(','));
    n += 1;
  }
  if (paymentMethod) {
    clauses.push(`payment_method = ANY($${n})`);
    values.push(String(paymentMethod).split(','));
    n += 1;
  }

  if (minAmount) {
    clauses.push(`amount_minor >= $${n}`);
    values.push(decimalToMinor(minAmount).toString());
    n += 1;
  }
  if (maxAmount) {
    clauses.push(`amount_minor <= $${n}`);
    values.push(decimalToMinor(maxAmount).toString());
    n += 1;
  }

  if (isRecurring === 'true') clauses.push('is_recurring');

  if (search) {
    // Same two fields the old regex searched, still case-insensitive.
    clauses.push(`(description ILIKE $${n} ESCAPE '\\' OR category ILIKE $${n} ESCAPE '\\')`);
    values.push(`%${escapeLike(search)}%`);
    n += 1;
  }

  return { where: clauses.join(' AND '), values, next: n };
};

/**
 * One page of expenses, the count of the whole filtered set, and its total -
 * so the UI can show "total for this filter" without a second round trip.
 */
const list = async (userId, financeMode, q = {}) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  const sortColumn = SORT_COLUMNS[q.sortBy] || 'date';
  const direction = q.order === 'asc' ? 'ASC' : 'DESC';

  const { where, values, next } = buildWhere(userId, financeMode, q);

  const [items, summary] = await Promise.all([
    query(
      `SELECT * FROM expenses WHERE ${where}
        ORDER BY ${sortColumn} ${direction}, id DESC
        LIMIT $${next} OFFSET $${next + 1}`,
      [...values, limit, (page - 1) * limit]
    ),
    queryOne(
      `SELECT count(*)::bigint AS total, COALESCE(sum(amount_minor), 0)::text AS sum
         FROM expenses WHERE ${where}`,
      values
    ),
  ]);

  const total = Number(summary.total);
  return {
    items: toApiList(items),
    total,
    filteredTotal: minorToApi(summary.sum),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
};

/** One expense, scoped to its owner so another student's id reads as missing. */
const findById = async (id, financeMode, userId) => {
  if (!isUuid(id)) return null;
  const row = await queryOne(
    `SELECT * FROM expenses WHERE id = $1 AND user_id = $2 AND finance_mode = $3`,
    [id, userId, financeMode]
  );
  return toApi(row);
};

const create = async (userId, data, tx = { queryOne }) => {
  const row = await tx.queryOne(
    `INSERT INTO expenses
       (user_id, finance_mode, amount, amount_minor, category, description, payment_method, date,
        is_recurring, recurring_frequency, next_run_at, generated_from)
     VALUES ($1, $2, 0, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      userId,
      data.financeMode,
      (data.amountMinor == null ? decimalToMinor(data.amount, { allowZero: false }) : minor(data.amountMinor)).toString(),
      data.category,
      data.description || '',
      data.paymentMethod || 'Cash',
      data.date,
      Boolean(data.isRecurring),
      data.recurringFrequency || 'monthly',
      data.nextRunAt || null,
      data.generatedFrom || null,
    ]
  );
  return toApi(row);
};

const update = async (id, financeMode, userId, patch) => {
  const columns = {
    amount_minor: patch.amount === undefined ? undefined : decimalToMinor(patch.amount, { allowZero: false }).toString(),
    category: patch.category,
    description: patch.description,
    payment_method: patch.paymentMethod,
    date: patch.date,
    is_recurring: patch.isRecurring,
    recurring_frequency: patch.recurringFrequency,
    next_run_at: patch.nextRunAt,
  };

  const { fragment, values, next } = buildSet(columns);
  if (!fragment) return findById(id, financeMode, userId);

  const row = await queryOne(
    `UPDATE expenses SET ${fragment}, updated_at = now()
      WHERE id = $${next} AND user_id = $${next + 1} AND finance_mode = $${next + 2}
      RETURNING *`,
    [...values, id, userId, financeMode]
  );
  return toApi(row);
};

const remove = async (id, financeMode, userId) => {
  if (!isUuid(id)) return false;
  const rows = await query(
    `DELETE FROM expenses WHERE id = $1 AND user_id = $2 AND finance_mode = $3 RETURNING id`, [
    id,
    userId,
    financeMode,
  ]);
  return rows.length > 0;
};

/** Every expense this student has, for the "download everything" export. */
const listAllForUser = async (userId, financeMode) => {
  const rows = await query(
    `SELECT * FROM expenses WHERE user_id = $1 AND finance_mode = $2 ORDER BY date DESC, id DESC`,
    [userId, financeMode]
  );
  return toApiList(rows);
};

/** Every expense in a date range, oldest first - the report export. */
const listForRange = async (userId, financeMode, from, to) => {
  const rows = await query(
    `SELECT * FROM expenses WHERE user_id = $1 AND finance_mode = $4 AND date >= $2 AND date <= $3
      ORDER BY date, id`,
    [userId, from, to, financeMode]
  );
  return toApiList(rows);
};

/** How many expenses still use a category - blocks deleting one in use. */
const countByCategory = async (userId, financeMode, category) => {
  const row = await queryOne(
    `SELECT count(*)::bigint AS n FROM expenses WHERE user_id = $1 AND category = $2 AND finance_mode = $3`,
    [userId, category, financeMode]
  );
  return Number(row.n);
};

/* --------------------------- recurring sweep ------------------------ */

/** Recurring templates that have come due, for one user or for everybody. */
const findDue = async (userId = null) => {
  const rows = userId
    ? await query(
        `SELECT * FROM expenses
          WHERE user_id = $1 AND is_recurring AND next_run_at IS NOT NULL AND next_run_at <= now()`,
        [userId]
      )
    : await query(
        `SELECT * FROM expenses
          WHERE is_recurring AND next_run_at IS NOT NULL AND next_run_at <= now()`
      );
  return toApiList(rows);
};

/** Lock and recheck a due template; the callback writes clones and pointer on this client. */
const withLockedDueTemplate = (id, userId, now, materialize) => transaction(async (tx) => {
  const row = await tx.queryOne(
    `SELECT * FROM expenses WHERE id = $1 AND user_id = $2 AND is_recurring
       AND next_run_at IS NOT NULL AND next_run_at <= $3 FOR UPDATE`,
    [id, userId, now]
  );
  return row ? materialize(toApi(row), tx) : 0;
});

/** Serialize manual bill payments with the recurring sweep and other payments. */
const withLockedBillTemplate = (id, userId, financeMode, pay, outerTx = null) => {
  const perform = async (tx) => {
  if (!isUuid(id)) return null;
  const row = await tx.queryOne(
    `SELECT * FROM expenses WHERE id = $1 AND user_id = $2 AND finance_mode = $3 FOR UPDATE`,
    [id, userId, financeMode]
  );
  return row ? pay(toApi(row), tx) : null;
  };
  return outerTx ? perform(outerTx) : transaction(perform);
};

/** Moves a template's pointer forward after it has been materialised. */
const setNextRunAt = async (id, nextRunAt, tx = { query }) => {
  await tx.query(`UPDATE expenses SET next_run_at = $2, updated_at = now() WHERE id = $1`, [
    id,
    nextRunAt,
  ]);
};

/*
 * The recurring sweep and the reminder queries below are deliberately NOT
 * mode-scoped.
 *
 * They are the system acting on a person's behalf while nobody is looking at a
 * screen, so there is no "active mode" to speak of. A household electricity
 * bill that repeats every month must still be created in January whether or not
 * its owner last happened to be looking at their student records. Each row it
 * creates inherits the mode of the template it came from, which is what keeps
 * the isolation intact.
 */

/** Everyone with a template that has come due, for the nightly sweep. */
const userIdsWithDue = async () => {
  const rows = await query(
    `SELECT DISTINCT user_id FROM expenses
      WHERE is_recurring AND next_run_at IS NOT NULL AND next_run_at <= now()`
  );
  return rows.map((r) => r.user_id);
};

/** Writes the occurrences a template has generated, in one statement. */
const createMany = async (clones, tx = { query }) => {
  if (!clones.length) return 0;

  const values = [];
  const tuples = clones.map((c, i) => {
    const base = i * 9;
    values.push(
      c.userId,
      // The clone belongs to the same life as the template it came from, which
      // is what keeps a repeating household bill out of a student's month.
      c.financeMode,
      (c.amountMinor == null ? decimalToMinor(c.amount, { allowZero: false }) : minor(c.amountMinor)).toString(),
      c.category,
      c.description || '',
      c.paymentMethod || 'Cash',
      c.date,
      false,
      c.generatedFrom || null
    );
    return `($${base + 1}, $${base + 2}, 0, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, true)`;
  });

  const rows = await tx.query(
    `INSERT INTO expenses
       (user_id, finance_mode, amount, amount_minor, category, description, payment_method, date, is_recurring, generated_from, recurrence_occurrence)
     VALUES ${tuples.join(', ')}
     ON CONFLICT DO NOTHING RETURNING id`,
    values
  );
  return rows.length;
};

/* ----------------------------- alert rules -------------------------- */

/**
 * How many expenses this person logged since `since` - drives the nudge.
 *
 * Deliberately spans BOTH finance modes. The question this answers is "have
 * they been using the app at all", and someone who spent the week logging
 * household bills has. Scoping it to the active mode would nudge them for
 * neglecting a set of books they had simply switched away from.
 */
const countCreatedSince = async (userId, since) => {
  const row = await queryOne(
    `SELECT count(*)::bigint AS n FROM expenses WHERE user_id = $1 AND created_at >= $2`,
    [userId, since]
  );
  return Number(row.n);
};

/**
 * Recurring bills falling due on or before `by`, in one finance mode.
 *
 * Scoped to the mode, unlike the cron sweep above it. The sweep has to see
 * every template a person owns or half their recurring expenses would stop
 * being created; this one feeds reminders and the dashboard, which speak to
 * somebody looking at one set of books. Telling a student their gas bill is
 * due is a reminder about a life they are not currently in.
 */
const findBillsDueBy = async (userId, financeMode, by) => {
  const rows = await query(
    `SELECT * FROM expenses
      WHERE user_id = $1 AND finance_mode = $2
        AND is_recurring AND next_run_at IS NOT NULL AND next_run_at <= $3
      ORDER BY next_run_at`,
    [userId, financeMode, by]
  );
  return toApiList(rows);
};

module.exports = {
  buildWhere,
  list,
  findById,
  create,
  update,
  remove,
  countByCategory,
  listAllForUser,
  listForRange,
  findDue,
  withLockedDueTemplate,
  withLockedBillTemplate,
  setNextRunAt,
  userIdsWithDue,
  createMany,
  countCreatedSince,
  findBillsDueBy,
};
