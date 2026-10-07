/**
 * The alerts shown in the bell menu, and the tray they sit in.
 *
 * Every alert carries a `dedupeKey` and the table has a unique index on
 * (user_id, dedupe_key), so re-running the checks is safe: a duplicate insert
 * is swallowed instead of spamming the student with the same warning. That is
 * what lets the dashboard, an expense write and a cron tick all call
 * runChecksForUser without coordinating.
 */

const notificationsRepo = require('./notifications.repository');
// Plain requires: expenses and goals announce what they did rather than
// calling in here, so nothing points back and there is no circle to defer.
const expenses = require('../expenses/expenses.service');
const goals = require('../goals/goals.service');
const { budgetProgress } = require('../analytics/analytics.service');
const { currentPeriod, daysBetween } = require('../../shared/utils/calculations');
const { modeOf } = require('../../shared/categories');
const catalogue = require('@hisabkikitab/contracts/catalogue');
const { renderNotification } = require('@hisabkikitab/contracts/notifications');

const periodKey = ({ month, year }) => `${year}-${String(month).padStart(2, '0')}`;
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Insert one notification, ignoring duplicates.
 *
 * The ON CONFLICT in the repository does the swallowing, so a duplicate comes
 * back as null rather than as an error to catch.
 */
/** Money as this person reads it, so a stored value keeps its currency. */
const money = (user, amount) => `${user.currency} ${amount}`;

/** A category id rendered as words, in the reader's language. */
const label = (user, category) =>
  catalogue.labelForAnyMode('expense', category, user && user.language);

/**
 * Raises an alert, storing WHAT it is rather than what it said.
 *
 * The key and its values go into meta; the rendered English goes into the
 * title/message columns. Those columns are no longer the source of truth -
 * they are what a row written before this falls back to, and what anything
 * reading the table directly still sees. The reader's own language is applied
 * on the way out, in decorate().
 *
 * Values are stored already formatted, because they were computed here with
 * the person's currency and category vocabulary to hand.
 */
const push = async (user, { type, key, values = {}, meta = {}, dedupeKey }) => {
  const english = renderNotification(key, {
    language: 'en',
    financeMode: modeOf(user),
    values,
  });

  return notificationsRepo.push(user._id, modeOf(user), {
    type,
    title: english ? english.title : '',
    message: english ? english.message : '',
    meta: { ...meta, i18n: { key, values } },
    dedupeKey,
  });
};

/**
 * Re-renders a stored alert in the language being read.
 *
 * A row written before alerts carried keys has nothing to render from, so it
 * keeps the words it was written with. Untranslated history is a smaller wrong
 * than a tray of blank rows or raw keys.
 */
const decorate = (notification, user) => {
  const stored = notification && notification.meta && notification.meta.i18n;
  if (!stored || !stored.key) return notification;

  const rendered = renderNotification(stored.key, {
    language: user && user.language,
    financeMode: modeOf(user),
    values: stored.values,
  });
  if (!rendered) return notification;

  return { ...notification, title: rendered.title, message: rendered.message };
};

/** Warn once per category per month when a budget crosses 80% and 100%. */
const checkOverspending = async (user) => {
  const period = currentPeriod();
  const rows = await budgetProgress(user._id, modeOf(user), period.month, period.year);
  const created = [];

  for (const row of rows) {
    if (row.status === 'over') {
      const n = await push(user, {
        type: 'overspend',
        key: 'overspendOver',
        values: {
          category: label(user, row.category),
          spent: money(user, row.spent),
          limit: money(user, row.limit),
          percent: row.usedPercent,
        },
        meta: { category: row.category, spent: row.spent, limit: row.limit },
        dedupeKey: `overspend:${row.category}:${periodKey(period)}`,
      });
      if (n) created.push(n);
    } else if (row.status === 'warning') {
      const n = await push(user, {
        type: 'overspend',
        key: 'overspendWarning',
        values: {
          category: label(user, row.category),
          percent: row.usedPercent,
          remaining: money(user, row.remaining),
        },
        meta: { category: row.category, spent: row.spent, limit: row.limit },
        dedupeKey: `budget-warning:${row.category}:${periodKey(period)}`,
      });
      if (n) created.push(n);
    }
  }

  return created;
};

/** Remind about goals whose deadline is within a week (and overdue ones). */
const checkGoalDeadlines = async (user) => {
  // Named apart from the module it comes from: `const goals = await goals...`
  // shadows the import and fails at runtime, which is exactly what happened.
  const dueSoon = await goals.listDueSoon(user._id, 7);

  const created = [];
  for (const goal of dueSoon) {
    const daysLeft = daysBetween(new Date(), new Date(goal.deadline));
    const { minor, minorToApi } = require('../../shared/finance/personalMoney');
    const difference = minor(goal.targetAmountMinor) - minor(goal.savedAmountMinor);
    const remainingMinor = difference > 0n ? difference : 0n;
    const remaining = minorToApi(remainingMinor);
    const overdue = daysLeft < 0;

    // The goal's own title is the person's words and is never translated.
    const n = await push(user, {
      type: 'goal_deadline',
      key: overdue ? 'goalOverdue' : 'goalDueSoon',
      values: {
        title: goal.title,
        remaining: money(user, remaining),
        days: daysLeft,
        perDay: money(user, minorToApi((remainingMinor + BigInt(Math.max(1, daysLeft)) - 1n) / BigInt(Math.max(1, daysLeft)))),
      },
      meta: { goalId: goal._id, remaining, daysLeft },
      dedupeKey: `goal:${goal._id}:${dayKey()}`,
    });
    if (n) created.push(n);
  }

  return created;
};

/** Nudge the student if nothing has been logged for two days. */
const checkLogReminder = async (user) => {
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const recent = await expenses.countCreatedSince(user._id, twoDaysAgo);
  if (recent > 0) return [];

  const n = await push(user, {
    type: 'log_reminder',
    key: 'logReminder',
    dedupeKey: `log-reminder:${dayKey()}`,
  });

  return n ? [n] : [];
};

/** Flag recurring bills falling due in the next three days. */
const checkBillsDue = async (user) => {
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);

  const bills = await expenses.findBillsDueBy(user._id, modeOf(user), soon);

  const created = [];
  for (const bill of bills) {
    // The description is what the person typed; only the category falls
    // back to a translated label.
    const n = await push(user, {
      type: 'bill_due',
      key: 'billDue',
      values: {
        category: label(user, bill.category),
        what: bill.description || label(user, bill.category),
        amount: money(user, bill.amount),
        date: new Date(bill.nextRunAt).toDateString(),
      },
      meta: { expenseId: bill._id, amount: bill.amount },
      dedupeKey: `bill:${bill._id}:${new Date(bill.nextRunAt).toISOString().slice(0, 10)}`,
    });
    if (n) created.push(n);
  }

  return created;
};

/** Run every check for one user. Called on dashboard load and by the cron job. */
const runChecksForUser = async (user) => {
  if (modeOf(user) === 'shared_living') return [];
  const results = await Promise.allSettled([
    checkOverspending(user),
    checkGoalDeadlines(user),
    checkLogReminder(user),
    checkBillsDue(user),
  ]);

  results
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.error('[notifications] check failed:', r.reason && r.reason.message));

  return results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
};

/* ----------------------------- the tray ----------------------------- */

const ApiError = require('../../shared/errors/ApiError');

/** Newest first, in this mode, worded for this reader. */
const listForUser = async (user, { limit, unreadOnly } = {}) => {
  const [items, unreadCount] = await Promise.all([
    notificationsRepo.list(user._id, modeOf(user), { limit, unreadOnly }),
    notificationsRepo.unreadCount(user._id, modeOf(user)),
  ]);
  return { items: items.map((item) => decorate(item, user)), unreadCount };
};

const markRead = async (id, userId) => {
  const notification = await notificationsRepo.markRead(id, userId);
  if (!notification) throw ApiError.notFound('Notification not found');
  return notification;
};

const markAllRead = (userId) => notificationsRepo.markAllRead(userId);

const remove = async (id, userId) => {
  const removed = await notificationsRepo.remove(id, userId);
  if (!removed) throw ApiError.notFound('Notification not found');
  return id;
};

const clearAll = (userId) => notificationsRepo.clearAll(userId);

module.exports = {
  push,
  runChecksForUser,
  listForUser,
  markRead,
  markAllRead,
  remove,
  clearAll,
};
