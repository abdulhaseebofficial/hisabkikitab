/**
 * Report rules.
 *
 * Works out what a month means - totals, movement against last month, budget
 * adherence, the biggest single expense - and hands back plain data. Turning
 * that data into a spreadsheet or a PDF is presentation and stays in the
 * controller, so this file has nothing to say about HTTP.
 */

const income = require('../income/income.service');
const expenses = require('../expenses/expenses.service');
const analytics = require('../analytics/analytics.service');
const { modeOf } = require('../../shared/categories');
const { buildSnapshot, MONTH_NAMES } = analytics;
const { decimalToMinor, apiToMinor, minorToApi, roundRatio, ratioPercent2 } = require('../../shared/finance/personalMoney');
const {
  currentPeriod,
  previousPeriod,
  startOfCalendarMonth,
  endOfCalendarMonth,
} = require('../../shared/utils/calculations');

const periodFrom = (query = {}) => {
  const now = currentPeriod();
  return {
    month: Number(query.month) || now.month,
    year: Number(query.year) || now.year,
  };
};

/** Category-by-category movement between two months, biggest spend first. */
const compareCategories = (snapshot, previous) => {
  const categories = new Set([
    ...Object.keys(snapshot.byCategory),
    ...Object.keys(previous.byCategory),
  ]);

  return [...categories]
    .map((category) => {
      const current = snapshot.byCategory[category] || 0;
      const before = previous.byCategory[category] || 0;
      const currentMinor = apiToMinor(current);
      const beforeMinor = apiToMinor(before);
      return {
        category,
        current,
        previous: before,
        change: minorToApi(currentMinor - beforeMinor),
        changePercent: beforeMinor === 0n ? (currentMinor > 0n ? 100 : 0)
          : ratioPercent2(currentMinor - beforeMinor, beforeMinor),
      };
    })
    .sort((a, b) => b.current - a.current);
};

/**
 * The full month in one payload: totals, category breakdown, this-vs-last
 * comparison, budget adherence and the biggest single expense.
 */
const monthly = async (user, query) => {
  const period = periodFrom(query);
  const prev = previousPeriod(period);
  const from = startOfCalendarMonth(period.year, period.month);
  const to = endOfCalendarMonth(period.year, period.month);

  const [snapshot, prevSnapshot, biggest, incomeRows] = await Promise.all([
    buildSnapshot(user, period),
    buildSnapshot(user, prev),
    analytics.topExpenses(user._id, modeOf(user), from, to, 1),
    income.totalsBySource(user._id, modeOf(user), from, to),
  ]);

  return {
    period,
    monthLabel: snapshot.monthLabel,
    currency: user.currency,

    totals: {
      income: snapshot.income,
      spent: snapshot.totalSpent,
      saved: snapshot.remaining,
      savingsRate: roundRatio(apiToMinor(snapshot.remaining), apiToMinor(snapshot.income)),
      dailyAverage: snapshot.dailyAverage,
      transactionCount: snapshot.expenseCount,
    },

    breakdown: snapshot.breakdown,
    trend: snapshot.trend,
    highestCategory: snapshot.breakdown[0] || null,
    biggestExpense: biggest[0] || null,
    incomeBySource: incomeRows.map((row) => ({ source: row.source, amount: minorToApi(row.totalMinor) })),

    comparison: {
      previousLabel: prevSnapshot.monthLabel,
      previousSpent: prevSnapshot.totalSpent,
      change: minorToApi(apiToMinor(snapshot.totalSpent) - apiToMinor(prevSnapshot.totalSpent)),
      changePercent: prevSnapshot.totalSpent === 0 ? (snapshot.totalSpent > 0 ? 100 : 0)
        : ratioPercent2(apiToMinor(snapshot.totalSpent) - apiToMinor(prevSnapshot.totalSpent), apiToMinor(prevSnapshot.totalSpent)),
      categories: compareCategories(snapshot, prevSnapshot),
    },

    budgets: snapshot.budgets,
    overBudget: snapshot.budgets.filter((b) => b.status === 'over'),
    goals: snapshot.goals,
  };
};

/**
 * Everything an export needs: the month's snapshot, every transaction in it,
 * and the filename stem both formats use.
 */
const exportData = async (user, query) => {
  const period = periodFrom(query);
  const from = startOfCalendarMonth(period.year, period.month);
  const to = endOfCalendarMonth(period.year, period.month);

  const [snapshot, rows] = await Promise.all([
    buildSnapshot(user, period),
    expenses.listForRange(user._id, modeOf(user), from, to),
  ]);

  return {
    period,
    snapshot,
    expenses: rows,
    label: `${MONTH_NAMES[period.month - 1]}-${period.year}`,
  };
};

module.exports = { monthly, exportData };
