const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../../scripts/require-test-database');
const { query, queryOne, closePool } = require('../../apps/api/src/infrastructure/database/pool');
const expense = require('../../apps/api/src/modules/expenses/expenses.repository');
const income = require('../../apps/api/src/modules/income/income.repository');
const budgets = require('../../apps/api/src/modules/budgets/budgets.repository');
const goals = require('../../apps/api/src/modules/goals/goals.repository');
const analytics = require('../../apps/api/src/modules/analytics/analytics.service');
const budgetService = require('../../apps/api/src/modules/budgets/budgets.service');
const goalService = require('../../apps/api/src/modules/goals/goals.service');
const reports = require('../../apps/api/src/modules/reports/reports.service');
const money = require('../../apps/api/src/shared/finance/personalMoney');

test('exact personal ledger, aggregates, budgets, goals, recurring and legacy mirrors', async () => {
  const user = await queryOne('INSERT INTO users(name,email,password,monthly_income) VALUES($1,$2,$3,0) RETURNING id',
    ['Exact money', `${crypto.randomUUID()}@test.local`, 'test-only']);
  const from = new Date('2030-01-01T00:00:00Z');
  const to = new Date('2030-01-31T23:59:59Z');
  try {
    const base = { financeMode: 'student', category: 'Food', date: new Date('2030-01-10T00:00:00Z') };
    const first = await expense.create(user.id, { ...base, amount: 0.1 });
    const second = await expense.create(user.id, { ...base, amount: 0.2 });
    assert.equal((await expense.list(user.id, 'student')).filteredTotal, 0.3);
    assert.equal(await analytics.totalSpent(user.id, 'student', from, to), 0.3);
    const a = await income.create(user.id, { financeMode: 'student', amount: 0.1, date: base.date });
    const b = await income.create(user.id, { financeMode: 'student', amount: 0.2, date: base.date });
    assert.equal((await income.list(user.id, 'student')).total, 0.3);
    assert.equal(await analytics.totalIncome(user.id, 'student', from, to), 0.3);
    await budgets.upsert(user.id, 'student', 'Food', 0.5, 1, 2030);
    const progress = await analytics.budgetProgress(user.id, 'student', 1, 2030);
    assert.equal(progress[0].spent, 0.3);
    assert.equal(progress[0].remaining, 0.2);
    const goal = await goals.create(user.id, { title: 'Exact', targetAmount: 1.3, savedAmount: 1.1 });
    const contributed = await goals.contribute(goal._id, user.id, 0.2);
    assert.equal(contributed.goal.savedAmount, 1.3);
    assert.equal(contributed.goal.contributions[0].amount, 0.2);
    assert.equal(contributed.goal.isCompleted, true);
    const userApi = { _id: user.id, financeMode: 'student', monthlyIncomeMinor: '100', currency: 'PKR' };
    const budgetMonth = await budgetService.listForMonth(userApi, { month: 1, year: 2030 });
    assert.equal(budgetMonth.totals.remaining, 0.2);
    assert.equal(budgetMonth.totals.unallocated, 0.5);
    const goalList = await goalService.list(user.id);
    assert.equal(goalList.summary.totalSaved, 1.3);
    assert.equal(goalList.items[0].progress, 100);
    const snapshot = await analytics.buildSnapshot(userApi, { month: 1, year: 2030 });
    assert.equal(snapshot.totalSpent, 0.3);
    assert.equal(snapshot.income, 0.3);
    assert.equal(snapshot.remaining, 0);
    const report = await reports.monthly(userApi, { month: 1, year: 2030 });
    assert.equal(report.totals.spent, 0.3);
    assert.equal(report.incomeBySource[0].amount + 0, 0.3);
    const clones = await expense.createMany([{ ...base, userId: user.id, amount: 0.1,
      generatedFrom: first._id }]);
    assert.equal(clones, 1);
    const stored = await queryOne(`SELECT (SELECT sum(amount_minor)::text FROM expenses WHERE user_id=$1) AS expense,
      (SELECT sum(amount_minor)::text FROM income WHERE user_id=$1) AS income,
      (SELECT count(*) FROM expenses WHERE user_id=$1 AND amount_minor::numeric <> amount::numeric * 100) AS mismatch`, [user.id]);
    assert.equal(stored.expense, '40');
    assert.equal(stored.income, '30');
    assert.equal(Number(stored.mismatch), 0);
    assert.equal(first.amount, 0.1);
    assert.equal(second.amount, 0.2);
    assert.equal(a.amount, 0.1);
    assert.equal(b.amount, 0.2);
  } finally { await query('DELETE FROM users WHERE id=$1', [user.id]); }
});

test('input range, sub-cent precision, zero/negative rules and JSON boundary', () => {
  assert.equal(money.decimalToMinor('0.1') + money.decimalToMinor('0.2'), 30n);
  assert.equal(money.minorToApi(30n), 0.3);
  assert.equal(JSON.stringify({ amount: money.minorToApi(30n) }), '{"amount":0.3}');
  assert.equal(money.decimalToMinor('999999999999.99'), money.MAX_INPUT_MINOR);
  assert.equal(money.minorToApi(money.MAX_INPUT_MINOR), 999999999999.99);
  assert.equal(money.minorToApi(money.MAX_INPUT_MINOR + 1n), '1000000000000.00');
  assert.equal(money.decimalToMinor('-0.01', { allowNegative: true }), -1n);
  assert.equal(money.decimalToMinor('0'), 0n);
  for (const value of ['0.001', '1.234', 'NaN', 'Infinity', '1000000000000.00']) {
    assert.throws(() => money.decimalToMinor(value), RangeError);
  }
  assert.throws(() => money.decimalToMinor('-0.01'), RangeError);
  assert.throws(() => money.decimalToMinor('0', { allowZero: false }), RangeError);
});

test('maximum supported write and unusually large historical read keep every cent', async () => {
  const user = await queryOne('INSERT INTO users(name,email,password) VALUES($1,$2,$3) RETURNING id',
    ['Large money', `${crypto.randomUUID()}@test.local`, 'test-only']);
  try {
    const row = await expense.create(user.id, { financeMode: 'student', category: 'Food',
      amount: '999999999999.99', date: new Date() });
    assert.equal(row.amount, 999999999999.99);
    assert.equal(row.amountMinor, '99999999999999');
    const stored = await queryOne('SELECT amount_minor, amount FROM expenses WHERE id=$1', [row._id]);
    assert.equal(String(stored.amount_minor), '99999999999999');
    assert.equal(money.decimalToMinor(stored.amount), money.MAX_INPUT_MINOR);
    await query('UPDATE expenses SET amount_minor=$2 WHERE id=$1', [row._id, '100000000000000']);
    const historical = await expense.findById(row._id, 'student', user.id);
    assert.equal(historical.amount, '1000000000000.00');
    assert.equal(JSON.parse(JSON.stringify(historical)).amount, '1000000000000.00');
  } finally { await query('DELETE FROM users WHERE id=$1', [user.id]); }
});

test.after(async () => closePool());
