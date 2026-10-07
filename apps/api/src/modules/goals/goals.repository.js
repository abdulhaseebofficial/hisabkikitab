/**
 * Savings goals and their contribution ledger.
 *
 * Two things worth knowing before editing:
 *  - `is_completed` is kept in step with the saved amount on every write, so a
 *    goal can never be funded and still read as open;
 *  - contributions are their own table, gathered back into an array by the
 *    SELECT, so the API returns one goal object with its ledger inside.
 */

const { query, queryOne, transaction } = require('../../infrastructure/database/pool');
const { toApi, toApiList, buildSet, isUuid } = require('../../infrastructure/database/rows');
const { DEFAULT_GOAL_ICON } = require('../../shared/constants');
const { decimalToMinor, minor, minorToApi } = require('../../shared/finance/personalMoney');

/**
 * Rolls the ledger up into the array the API has always returned. COALESCE
 * keeps it an empty array rather than null for a goal with no contributions.
 */
const WITH_CONTRIBUTIONS = `
  SELECT g.*,
         COALESCE(
           (SELECT json_agg(json_build_object('amount', c.amount_minor::text, 'date', c.date, 'note', c.note)
                            ORDER BY c.date)
              FROM goal_contributions c WHERE c.goal_id = g.id),
           '[]'::json
         ) AS contributions
    FROM goals g
`;

/** `status` is active | completed | anything else for all. */
const list = async (userId, status) => {
  const clauses = ['g.user_id = $1'];
  if (status === 'active') clauses.push('NOT g.is_completed');
  if (status === 'completed') clauses.push('g.is_completed');

  const rows = await query(
    `${WITH_CONTRIBUTIONS} WHERE ${clauses.join(' AND ')}
      ORDER BY g.is_completed, g.deadline NULLS LAST, g.created_at DESC`,
    [userId]
  );
  return toApiList(rows);
};

/** The open goals the dashboard previews, soonest deadline first. */
const listOpen = async (userId, limit = 5) => {
  const rows = await query(
    `SELECT * FROM goals WHERE user_id = $1 AND NOT is_completed
      ORDER BY deadline NULLS LAST LIMIT $2`,
    [userId, limit]
  );
  return toApiList(rows);
};

const findById = async (id, userId) => {
  if (!isUuid(id)) return null;
  const row = await queryOne(`${WITH_CONTRIBUTIONS} WHERE g.id = $1 AND g.user_id = $2`, [
    id,
    userId,
  ]);
  return toApi(row);
};

const create = async (userId, data, tx = { queryOne }) => {
  const saved = decimalToMinor(data.savedAmount || 0);
  const target = decimalToMinor(data.targetAmount, { allowZero: false });
  const reached = saved >= target;

  const row = await tx.queryOne(
    `INSERT INTO goals
       (user_id, title, target_amount, target_amount_minor, saved_amount, saved_amount_minor, deadline, icon, note,
        is_completed, completed_at)
     VALUES ($1, $2, 0, $3, 0, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      userId,
      data.title,
      target.toString(),
      saved.toString(),
      data.deadline || null,
      data.icon || DEFAULT_GOAL_ICON,
      data.note || '',
      reached,
      reached ? new Date() : null,
    ]
  );
  return { ...toApi(row), contributions: [] };
};

/**
 * Applies a partial update, then re-syncs the completion flag - lowering the
 * target can complete a goal, raising it can re-open one.
 */
const update = async (id, userId, patch) => {
  const { fragment, values, next } = buildSet({
    title: patch.title,
    target_amount_minor: patch.targetAmount === undefined ? undefined : decimalToMinor(patch.targetAmount, { allowZero: false }).toString(),
    deadline: patch.deadline,
    icon: patch.icon,
    note: patch.note,
  });

  if (fragment) {
    await query(
      `UPDATE goals SET ${fragment}, updated_at = now()
        WHERE id = $${next} AND user_id = $${next + 1}`,
      [...values, id, userId]
    );
    await syncCompletion(id, userId);
  }
  return findById(id, userId);
};

/**
 * Keeps is_completed in step with the saved amount, stamping completed_at only
 * on the transition so the date does not move every time a goal is topped up.
 */
const syncCompletion = async (id, userId, tx = null) => {
  const run = tx ? tx.query.bind(tx) : query;
  await run(
    `UPDATE goals
        SET is_completed = (saved_amount_minor >= target_amount_minor),
            completed_at = CASE
              WHEN saved_amount_minor >= target_amount_minor AND NOT is_completed THEN now()
              WHEN saved_amount_minor <  target_amount_minor THEN NULL
              ELSE completed_at
            END,
            updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
};

/**
 * Adds to (or, with a negative amount, withdraws from) a goal and records the
 * movement in the ledger. Both writes happen together or not at all.
 *
 * Returns { goal, wasCompleted } so the caller can tell whether this call is
 * the one that finished the goal.
 */
const contribute = async (id, userId, amount, note = '', outerTx = null) => {
  const perform = async (tx) => {
    // Lock the row so two contributions cannot both read the old balance.
    const current = await tx.queryOne(
      `SELECT saved_amount_minor, is_completed FROM goals
        WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, userId]
    );
    if (!current) return { goal: null, wasCompleted: false };

    const cents = decimalToMinor(amount, { allowNegative: true, allowZero: false });
    const next = minor(current.saved_amount_minor) + cents;
    if (next < 0n) return { goal: null, wasCompleted: current.is_completed, overdrawn: true };

    await tx.query(`UPDATE goals SET saved_amount_minor = $3, updated_at = now() WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
      next.toString(),
    ]);
    await tx.query(
      `INSERT INTO goal_contributions (goal_id, amount, amount_minor, note) VALUES ($1, 0, $2, $3)`,
      [id, cents.toString(), note || '']
    );
    await syncCompletion(id, userId, tx);

    const row = await tx.queryOne(
      `${WITH_CONTRIBUTIONS} WHERE g.id = $1 AND g.user_id = $2`,
      [id, userId]
    );
    return { goal: toApi(row), wasCompleted: current.is_completed };
  };
  return outerTx ? perform(outerTx) : transaction(perform);
};

const remove = async (id, userId) => {
  if (!isUuid(id)) return false;
  // goal_contributions is ON DELETE CASCADE.
  const rows = await query(`DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING id`, [
    id,
    userId,
  ]);
  return rows.length > 0;
};

/** Open goals with a deadline inside the next `days` days, for the alert sweep. */
const findDueSoon = async (userId, days) => {
  const rows = await query(
    `SELECT * FROM goals
      WHERE user_id = $1 AND NOT is_completed AND deadline IS NOT NULL
        AND deadline <= now() + ($2 || ' days')::interval
      ORDER BY deadline`,
    [userId, String(days)]
  );
  return toApiList(rows);
};

module.exports = {
  list,
  listOpen,
  findById,
  create,
  update,
  contribute,
  remove,
  findDueSoon,
};
