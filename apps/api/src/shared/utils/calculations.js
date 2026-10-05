/**
 * Pure helpers for money / date maths. No DB access here so they stay easy to
 * reason about (and to unit-test).
 */

const { minor, minorToApi, apiToMinor, roundDecimalToMinor, decimalToMinor, divideMinor, ratioPercent2 } = require('../finance/personalMoney');

/** First millisecond of a month. `month` is 1-12. */
const startOfMonth = (year, month) => new Date(year, month - 1, 1, 0, 0, 0, 0);

/** Last millisecond of a month. */
const endOfMonth = (year, month) => new Date(year, month, 0, 23, 59, 59, 999);

/** Financial date inputs are encoded at UTC midnight, independent of host TZ. */
const startOfCalendarMonth = (year, month) => new Date(Date.UTC(year, month - 1, 1));
const endOfCalendarMonth = (year, month) => new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

/** Month/year of "now" (or of a supplied date) in 1-12 form. */
const currentPeriod = (date = new Date()) => ({
  month: date.getMonth() + 1,
  year: date.getFullYear(),
});

/** Previous month/year, wrapping across the new year. */
const previousPeriod = ({ month, year }) =>
  month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const daysBetween = (a, b) => Math.ceil((endOfDay(b) - startOfDay(a)) / (1000 * 60 * 60 * 24));

/** Round to 2 decimals without floating point noise (0.1+0.2 style). */
const round2 = (n) => {
  if (n === undefined || Number.isNaN(Number(n))) return Number.NaN;
  if (!Number.isFinite(Number(n))) return Number(n);
  return minorToApi(roundDecimalToMinor(n));
};

const percent = (part, whole) => {
  const asMinor = (value) => typeof value === 'bigint' ? value : apiToMinor(value);
  const denominator = asMinor(whole);
  return denominator > 0n ? ratioPercent2(asMinor(part), denominator) : 0;
};

/**
 * How much still has to be put aside, per day and per week, for a goal to be
 * funded by its deadline. Returns nulls when there is no deadline.
 */
const goalPace = (goal) => {
  const target = goal.targetAmountMinor != null ? minor(goal.targetAmountMinor) : decimalToMinor(goal.targetAmount);
  const saved = goal.savedAmountMinor != null ? minor(goal.savedAmountMinor) : decimalToMinor(goal.savedAmount);
  const remainingMinor = target > saved ? target - saved : 0n;
  const remaining = minorToApi(remainingMinor);
  if (!goal.deadline) return { remaining, daysLeft: null, perDay: null, perWeek: null, isOverdue: false };

  const daysLeft = daysBetween(new Date(), new Date(goal.deadline));
  const isOverdue = daysLeft < 0 && remaining > 0;
  const safeDays = Math.max(1, daysLeft);

  return {
    remaining,
    daysLeft,
    // Rounded UP: this is the minimum that still reaches the target in time,
    // and whole rupees are what a student actually puts aside.
    perDay: remainingMinor > 0n ? minorToApi((remainingMinor + BigInt(safeDays) - 1n) / BigInt(safeDays)) : 0,
    perWeek: remainingMinor > 0n ? minorToApi((remainingMinor * 7n + BigInt(safeDays) - 1n) / BigInt(safeDays)) : 0,
    isOverdue,
  };
};

/**
 * Turn a list of {_id: category, total} aggregation rows into an object keyed
 * by category, plus a sorted array that is friendly for charts.
 */
const shapeCategoryTotals = (rows = []) => {
  const byCategory = {};
  let total = 0n;
  rows.forEach((r) => {
    const cents = r.totalMinor !== undefined ? minor(r.totalMinor) : apiToMinor(r.total);
    byCategory[r._id] = minorToApi(cents);
    total += cents;
  });

  const breakdown = Object.entries(byCategory)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: percent(amount, total),
    }))
    .sort((a, b) => Number(apiToMinor(b.amount) - apiToMinor(a.amount)));

  return { byCategory, breakdown, total: minorToApi(total) };
};

/**
 * Traffic-light status for a budget line.
 * Spending exactly the limit is not "over" - it is nothing left, which is a
 * warning. Only genuinely exceeding the limit turns the line red.
 */
const budgetStatus = (spent, limit) => {
  const spentMinor = apiToMinor(spent);
  const limitMinor = apiToMinor(limit);
  if (limitMinor <= 0n) return 'none';
  if (spentMinor > limitMinor) return 'over';
  if (spentMinor * 10n >= limitMinor * 8n) return 'warning';
  return 'safe';                     // green
};

/** Human readable delta between two numbers, e.g. +12.5% */
const changePercent = (current, previous) => {
  const currentMinor = apiToMinor(current);
  const previousMinor = apiToMinor(previous);
  if (!previousMinor) return currentMinor > 0n ? 100 : 0;
  return ratioPercent2(currentMinor - previousMinor, previousMinor);
};

module.exports = {
  startOfMonth,
  endOfMonth,
  startOfCalendarMonth,
  endOfCalendarMonth,
  currentPeriod,
  previousPeriod,
  daysBetween,
  round2,
  percent,
  goalPace,
  shapeCategoryTotals,
  budgetStatus,
  changePercent,
};
