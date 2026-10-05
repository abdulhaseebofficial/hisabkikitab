const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../../scripts/require-test-database');
const { query, queryOne, closePool } = require('../../apps/api/src/infrastructure/database/pool');
const expenses = require('../../apps/api/src/modules/expenses/expenses.repository');
const income = require('../../apps/api/src/modules/income/income.repository');
const analytics = require('../../apps/api/src/modules/analytics/analytics.service');
const reports = require('../../apps/api/src/modules/reports/reports.service');

test('date-only filters and monthly totals include the selected UTC calendar day independent of server timezone', async () => {
  const originalTimezone = process.env.TZ;
  const user = await queryOne('INSERT INTO users(name,email,password) VALUES($1,$2,$3) RETURNING id',
    ['Date boundary', `${crypto.randomUUID()}@test.local`, 'test-only']);
  try {
    process.env.TZ = 'America/Los_Angeles';
    for (const [date, amount] of [
      ['2026-10-01T00:00:00.000Z', 0.3],
      ['2026-10-05T00:00:00.000Z', 0.1],
      ['2026-10-05T23:30:00.000Z', 0.2],
      ['2026-10-31T00:00:00.000Z', 0.4],
      ['2026-11-01T00:00:00.000Z', 0.5],
    ]) {
      await expenses.create(user.id, { financeMode: 'student', category: 'Food', amount,
        date: new Date(date) });
    }
    await income.create(user.id, { financeMode: 'student', amount: 0.3,
      date: new Date('2026-10-05T00:00:00.000Z') });

    const day = await expenses.list(user.id, 'student', { from: '2026-10-05', to: '2026-10-05' });
    assert.equal(day.pagination.total, 2);
    assert.equal(day.filteredTotal, 0.3);
    assert.deepEqual(day.items.map((row) => new Date(row.date).toISOString()).sort(),
      ['2026-10-05T00:00:00.000Z', '2026-10-05T23:30:00.000Z']);
    assert.equal(JSON.parse(JSON.stringify(day.items[0])).date, new Date(day.items[0].date).toISOString());
    const dayIncome = await income.list(user.id, 'student', { from: '2026-10-05', to: '2026-10-05' });
    assert.equal(dayIncome.total, 0.3);

    const userApi = { _id: user.id, financeMode: 'student', monthlyIncomeMinor: '0', currency: 'PKR' };
    const snapshot = await analytics.buildSnapshot(userApi, { month: 10, year: 2026 });
    assert.equal(snapshot.totalSpent, 1);
    assert.equal(snapshot.incomeLogged, 0.3);
    assert.equal(snapshot.trend.find((row) => row.date === '2026-10-01').amount, 0.3);
    assert.equal(snapshot.trend.find((row) => row.date === '2026-10-05').amount, 0.3);
    assert.equal(snapshot.trend.find((row) => row.date === '2026-10-31').amount, 0.4);
    assert.equal(snapshot.trend.some((row) => row.date === '2026-11-01'), false);
    const report = await reports.monthly(userApi, { month: 10, year: 2026 });
    assert.equal(report.totals.spent, 1);
    assert.equal((await reports.exportData(userApi, { month: 10, year: 2026 })).expenses.length, 4);
  } finally {
    process.env.TZ = originalTimezone;
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test.after(async () => closePool());
