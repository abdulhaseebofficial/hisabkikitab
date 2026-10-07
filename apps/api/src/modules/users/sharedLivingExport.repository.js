const { transaction } = require('../../infrastructure/database/pool');
const { toApiList } = require('../../infrastructure/database/rows');

/** A consistent snapshot of spaces this account belongs to, without other users' contacts. */
const forUser = (userId) => transaction(async (tx) => {
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const spaces = await tx.query(
    `SELECT s.id, s.name, s.currency, s.description, s.organization_type,
            s.organization_name, s.residents, s.created_at, m.role, m.created_at AS joined_at
       FROM sl_spaces s JOIN sl_memberships m ON m.space_id = s.id
      WHERE m.user_id = $1 ORDER BY s.created_at, s.id`,
    [userId]
  );
  const ids = spaces.map((space) => space.id);
  if (!ids.length) return { spaces: [], memberships: [], members: [], periods: [],
    categories: [], expenses: [], bills: [], shares: [], payments: [], activity: [] };
  const scoped = (sql) => tx.query(sql, [ids]);
  const memberships = await tx.query(
    'SELECT space_id, user_id, role, created_at FROM sl_memberships WHERE user_id = $1',
    [userId]
  );
  const members = await scoped(
    'SELECT id, space_id, name, joined_on, left_on, active, archived, weight FROM sl_members WHERE space_id = ANY($1::uuid[]) ORDER BY space_id, joined_on, id'
  );
  const periods = await scoped(
    'SELECT id, space_id, month, budget_minor, food_budget_minor, closed FROM sl_periods WHERE space_id = ANY($1::uuid[]) ORDER BY space_id, month'
  );
  const categories = await scoped(
    'SELECT id, space_id, kind, stable_key, name, archived, position FROM sl_categories WHERE space_id = ANY($1::uuid[]) ORDER BY space_id, kind, position'
  );
  const expenses = await scoped(
    'SELECT id, space_id, period_id, category_id, date, amount_minor, note, method, deleted, split_pending, created_at FROM sl_expenses WHERE space_id = ANY($1::uuid[]) ORDER BY space_id, date, id'
  );
  const bills = await scoped(
    'SELECT id, space_id, period_id, category_id, paid_by, name, note, method, date, due_date, amount_minor, paid, recurring, deleted, split_pending, created_at FROM sl_bills WHERE space_id = ANY($1::uuid[]) ORDER BY space_id, date, id'
  );
  const shares = await scoped(
    'SELECT id, space_id, expense_id, bill_id, member_id, amount_minor, manually_adjusted FROM sl_shares WHERE space_id = ANY($1::uuid[]) ORDER BY space_id, id'
  );
  const payments = await scoped(
    'SELECT id, space_id, period_id, member_id, amount_minor, date, method, reference, note, deleted, created_at FROM sl_payments WHERE space_id = ANY($1::uuid[]) ORDER BY space_id, date, id'
  );
  const activity = await scoped(
    'SELECT id, space_id, action, entity, entity_id, created_at FROM sl_activity WHERE space_id = ANY($1::uuid[]) ORDER BY space_id, id'
  );
  return Object.fromEntries(Object.entries({ spaces, memberships, members, periods, categories,
    expenses, bills, shares, payments, activity }).map(([key, rows]) => [key, toApiList(rows)]));
});

module.exports = { forUser };
