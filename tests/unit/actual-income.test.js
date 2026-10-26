const test = require('node:test');
const assert = require('node:assert/strict');
const repo = require('../../apps/api/src/modules/analytics/analytics.repository');
const analytics = require('../../apps/api/src/modules/analytics/analytics.service');
const { reportTotals } = require('../../apps/api/src/modules/reports/reports.service');

test('monthly snapshots use received income, keep the plan separate, and isolate modes', async () => {
  const originals = {};
  const methods = ['totalSpent', 'totalIncome', 'categoryTotals', 'dailyTotals',
    'budgetLimitsFor', 'openGoalsFor', 'countExpenses'];
  for (const method of methods) originals[method] = repo[method];
  const calls = [];
  try {
    repo.totalSpent = async (owner, mode, from, to) => {
      calls.push({ owner, mode, from, to });
      return mode === 'student' ? '1001' : '501';
    };
    repo.totalIncome = async (owner, mode, from, to) => {
      calls.push({ owner, mode, from, to });
      return mode === 'student' ? '0' : '2001';
    };
    repo.categoryTotals = async () => [];
    repo.dailyTotals = async () => [];
    repo.budgetLimitsFor = async () => [];
    repo.openGoalsFor = async () => [];
    repo.countExpenses = async () => 1;

    const student = await analytics.buildSnapshot({ _id: 'owner', financeMode: 'student',
      monthlyIncomeMinor: '6000000' }, { month: 2, year: 2032 });
    assert.equal(student.income, 0);
    assert.equal(student.incomeLogged, 0);
    assert.equal(student.plannedIncome, 60000);
    assert.equal(student.totalSpent, 10.01);
    assert.equal(student.remaining, -10.01);
    assert.equal(student.safeDailySpend, 0);
    assert.equal(student.spentPercent, 0);
    assert.deepEqual(reportTotals(student), {
      income: 0, plannedIncome: 60000, spent: 10.01, netCashFlow: -10.01,
      netCashFlowRate: null, dailyAverage: student.dailyAverage, transactionCount: 1,
      // Deprecated aliases for clients still running the pre-rename bundle.
      saved: -10.01, savingsRate: 0,
    });

    const household = await analytics.buildSnapshot({ _id: 'owner', financeMode: 'householder',
      monthlyIncomeMinor: '6000000' }, { month: 2, year: 2032 });
    assert.equal(household.income, 20.01);
    assert.equal(household.plannedIncome, 60000);
    assert.equal(household.totalSpent, 5.01);
    assert.equal(household.remaining, 15);
    assert.equal(household.spentPercent, 25);
    assert.equal(reportTotals(household).netCashFlowRate, 75);
    // The deprecated names must keep reporting the same figures as the new ones.
    assert.equal(reportTotals(household).saved, reportTotals(household).netCashFlow);
    assert.equal(reportTotals(household).savingsRate, 75);
    assert(calls.every(({ owner }) => owner === 'owner'));
    assert(calls.some(({ mode }) => mode === 'student'));
    assert(calls.some(({ mode }) => mode === 'householder'));
    assert(calls.every(({ from, to }) => from.getUTCMonth() === to.getUTCMonth()));
  } finally {
    for (const method of methods) repo[method] = originals[method];
  }
});

test('weekly AI snapshot never converts planned income into received income', async () => {
  const originals = {};
  for (const method of ['totalSpent', 'totalIncome', 'categoryTotals', 'dailyTotals']) {
    originals[method] = repo[method];
  }
  try {
    repo.totalSpent = async () => '125';
    repo.totalIncome = async () => '0';
    repo.categoryTotals = async () => [];
    repo.dailyTotals = async () => [];
    const snapshot = await analytics.buildWeeklySnapshot({ _id: 'owner', financeMode: 'student',
      monthlyIncomeMinor: '6000000' });
    assert.equal(snapshot.income, 0);
    assert.equal(snapshot.plannedIncome, 60000);
    assert.equal(snapshot.totalSpent, 1.25);
    assert.equal(snapshot.remaining, -1.25);
  } finally {
    for (const [method, original] of Object.entries(originals)) repo[method] = original;
  }
});
