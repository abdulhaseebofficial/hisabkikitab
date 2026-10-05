/**
 * analyticsService — every aggregation the app needs, in one place.
 *
 * The dashboard, the reports page, the notification generator and the AI
 * advisor all consume the same `snapshot` object, so a number shown on screen
 * is always the same number the AI reasoned about.
 *
 * The SQL itself lives in db/analytics.js; what is left here is the shaping,
 * the zero-filling and the derived figures.
 */

const analytics = require('./analytics.repository');
const { modeOf } = require('../../shared/categories');
const { minor, minorToApi, decimalToMinor, roundRatio, divideMinor } = require('../../shared/finance/personalMoney');


const {
  startOfCalendarMonth,
  endOfCalendarMonth,
  currentPeriod,
  previousPeriod,
} = require('../../shared/utils/calculations');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Total expenses grouped by category for a date range. */
const categoryTotals = async (userId, financeMode, from, to) => {
  const rows = await analytics.categoryTotals(userId, financeMode, from, to);
  const totalMinor = rows.reduce((sum, row) => sum + minor(row.totalMinor), 0n);
  const byCategory = {};
  const byCategoryMinor = {};
  const breakdown = rows.map((row) => {
    byCategory[row._id] = minorToApi(row.totalMinor);
    byCategoryMinor[row._id] = row.totalMinor;
    return { category: row._id, amount: byCategory[row._id], percent: totalMinor > 0n
      ? minorToApi(divideMinor(minor(row.totalMinor) * 10000n, totalMinor)) : 0 };
  });
  return { byCategory, byCategoryMinor, breakdown, total: minorToApi(totalMinor) };
};

/** Total expenses for a date range. */
const totalSpent = async (userId, financeMode, from, to) =>
  minorToApi(await analytics.totalSpent(userId, financeMode, from, to));

/** Total logged income for a date range. */
const totalIncome = async (userId, financeMode, from, to) =>
  minorToApi(await analytics.totalIncome(userId, financeMode, from, to));

/**
 * Day-by-day spend for a range, with zero-filled gaps so the line chart does
 * not jump over days with no spending.
 */
const dailyTrend = async (userId, financeMode, from, to) => {
  const rows = await analytics.dailyTotals(userId, financeMode, from, to);

  const byDay = Object.fromEntries(rows.map((r) => [r._id, minorToApi(r.totalMinor)]));
  const out = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(
      cursor.getUTCDate()
    ).padStart(2, '0')}`;
    out.push({ date: key, day: cursor.getUTCDate(), amount: byDay[key] || 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

/** Budgets for a month, each joined with what has actually been spent. */
const budgetProgress = async (userId, financeMode, month, year) => {
  const from = startOfCalendarMonth(year, month);
  const to = endOfCalendarMonth(year, month);
  const [budgets, { byCategoryMinor }] = await Promise.all([
    analytics.budgetLimitsFor(userId, financeMode, month, year),
    categoryTotals(userId, financeMode, from, to),
  ]);

  return budgets
    .map((b) => {
      const spentMinor = minor(byCategoryMinor[b.category] || '0');
      const limitMinor = minor(b.limitMinor);
      return {
        _id: b._id,
        category: b.category,
        limit: minorToApi(limitMinor),
        limitMinor: limitMinor.toString(),
        spent: minorToApi(spentMinor),
        spentMinor: spentMinor.toString(),
        remaining: minorToApi(limitMinor - spentMinor),
        usedPercent: roundRatio(spentMinor, limitMinor),
        status: limitMinor <= 0n ? 'none' : spentMinor > limitMinor ? 'over'
          : spentMinor * 10n >= limitMinor * 8n ? 'warning' : 'safe',
        month: b.month,
        year: b.year,
      };
    })
    .sort((a, b) => b.usedPercent - a.usedPercent);
};

/**
 * The canonical monthly picture of one student's money.
 *
 * Income rule: `monthlyIncome` on the profile is the *planned* pocket money.
 * The income table holds what actually arrived. If anything was logged this
 * month we trust the logged figure, otherwise we fall back to the plan. Both
 * values are returned so the UI can show either.
 */
const buildSnapshot = async (user, period = currentPeriod()) => {
  const { month, year } = period;
  const from = startOfCalendarMonth(year, month);
  const to = endOfCalendarMonth(year, month);

  const prev = previousPeriod({ month, year });
  const prevFrom = startOfCalendarMonth(prev.year, prev.month);
  const prevTo = endOfCalendarMonth(prev.year, prev.month);
  const mode = modeOf(user);

  const [spent, loggedIncome, cats, trend, budgets, goals, previousMonthSpent, expenseCount] =
    await Promise.all([
      analytics.totalSpent(user._id, mode, from, to),
      analytics.totalIncome(user._id, mode, from, to),
      categoryTotals(user._id, mode, from, to),
      dailyTrend(user._id, mode, from, to),
      budgetProgress(user._id, mode, month, year),
      // Goals are shared across modes on purpose - see migration 0006.
      analytics.openGoalsFor(user._id, 5),
      analytics.totalSpent(user._id, mode, prevFrom, prevTo),
      analytics.countExpenses(user._id, mode, from, to),
    ]);

  const spentMinor = minor(spent);
  const loggedIncomeMinor = minor(loggedIncome);
  const plannedIncomeMinor = user.monthlyIncomeMinor != null ? minor(user.monthlyIncomeMinor) : decimalToMinor(user.monthlyIncome || 0);
  const incomeMinor = loggedIncomeMinor > 0n ? loggedIncomeMinor : plannedIncomeMinor;

  const now = new Date();
  const isCurrentMonth = now >= from && now <= to;
  const daysElapsed = isCurrentMonth ? now.getUTCDate() : to.getUTCDate();
  const daysLeftInMonth = isCurrentMonth ? Math.max(0, to.getUTCDate() - now.getUTCDate()) : 0;

  return {
    month,
    year,
    monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
    from,
    to,

    income: minorToApi(incomeMinor),
    plannedIncome: minorToApi(plannedIncomeMinor),
    incomeLogged: minorToApi(loggedIncomeMinor),

    totalSpent: minorToApi(spentMinor),
    remaining: minorToApi(incomeMinor - spentMinor),
    spentPercent: roundRatio(spentMinor, incomeMinor),

    breakdown: cats.breakdown,
    byCategory: cats.byCategory,
    topCategory: cats.breakdown.length ? cats.breakdown[0].category : null,

    trend,
    budgets,
    goals: goals.map((g) => ({
      _id: g._id,
      title: g.title,
      targetAmount: g.targetAmount,
      savedAmount: g.savedAmount,
      deadline: g.deadline,
      progress: Math.min(100, roundRatio(g.savedAmountMinor, g.targetAmountMinor)),
    })),

    previousMonthSpent: minorToApi(previousMonthSpent),
    dailyAverage: daysElapsed > 0 ? minorToApi(divideMinor(spentMinor, daysElapsed)) : 0,
    safeDailySpend: daysLeftInMonth > 0 ? minorToApi(divideMinor(incomeMinor > spentMinor ? incomeMinor - spentMinor : 0n, daysLeftInMonth)) : 0,
    daysElapsed,
    daysLeftInMonth,
    expenseCount,
  };
};

/** Snapshot of the last 7 days, used by the weekly AI summary. */
const buildWeeklySnapshot = async (user) => {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 6);
  from.setUTCHours(0, 0, 0, 0);

  const mode = modeOf(user);
  const [spent, cats, trend] = await Promise.all([
    analytics.totalSpent(user._id, mode, from, to),
    categoryTotals(user._id, mode, from, to),
    dailyTrend(user._id, mode, from, to),
  ]);

  return {
    monthLabel: `the last 7 days (${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)})`,
    income: minorToApi(user.monthlyIncomeMinor || '0'),
    totalSpent: minorToApi(spent),
    remaining: minorToApi(minor(user.monthlyIncomeMinor || '0') - minor(spent)),
    breakdown: cats.breakdown,
    byCategory: cats.byCategory,
    topCategory: cats.breakdown.length ? cats.breakdown[0].category : null,
    trend,
    budgets: [],
    goals: [],
    daysLeftInMonth: 7,
    dailyAverage: minorToApi(divideMinor(spent, 7)),
  };
};

/** The single biggest expense in a range, for the monthly report. */
const topExpenses = (userId, financeMode, from, to, limit) =>
  analytics.topExpenses(userId, financeMode, from, to, limit);

module.exports = {
  topExpenses,
  MONTH_NAMES,
  categoryTotals,
  totalSpent,
  totalIncome,
  budgetProgress,
  buildSnapshot,
  buildWeeklySnapshot,
};
