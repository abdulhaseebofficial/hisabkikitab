/**
 * recurringService — turns recurring expense templates into real expenses.
 *
 * A recurring expense (e.g. the monthly mess bill) is stored as an ordinary
 * expense with `isRecurring: true` and a `nextRunAt` date. When that date
 * passes we clone the template into a new expense and move `nextRunAt`
 * forward inside the same locked database transaction as the clone insert.
 */

const expensesRepo = require('../../modules/expenses/expenses.repository');

const daysInMonthOf = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();

/**
 * Whether `anchor` can be the day this series was scheduled on.
 *
 * A monthly series anchored on day D sits on `min(D, days in that month)`, so
 * the pointer either still shows D or was clamped to the last day of a shorter
 * month. Anything else means the anchor belongs to a different schedule - a
 * template whose `date` was edited before rescheduling existed, or a row where
 * `date` and `next_run_at` never agreed. Relocating a live bill to a different
 * day of the month on the strength of that would also change the generated
 * date, and the (generated_from, date) idempotency index would stop
 * recognising occurrences it had already created. The pointer's own day is the
 * safe reading in that case.
 */
const anchorFitsPointer = (anchor, pointer) => {
  const anchorDay = anchor.getUTCDate();
  const pointerDay = pointer.getUTCDate();
  return anchorDay === pointerDay
    || (anchorDay > pointerDay && pointerDay === daysInMonthOf(pointer));
};

/** Next occurrence; monthly dates keep the series' original day. */
const advance = (date, frequency, anchorDate = date) => {
  const next = new Date(date);
  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + 1);
  else if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else {
    const anchor = new Date(anchorDate);
    const day = Number.isNaN(anchor.getTime()) || !anchorFitsPointer(anchor, next)
      ? next.getUTCDate() : anchor.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(Math.min(day, daysInMonthOf(next)));
  }
  return next;
};

/** First run date for a brand new recurring template. */
const firstRunAfter = (date, frequency) => advance(date, frequency);

/** A changed schedule starts at its next future occurrence, without backfill. */
const nextRunAfter = (date, frequency, now = new Date()) => {
  let next = firstRunAfter(date, frequency);
  while (next <= now) next = advance(next, frequency, date);
  return next;
};

/**
 * Materialise every due occurrence for one user.
 * Returns the number of expenses created.
 */
const materializeForUser = async (userId, now = new Date()) => {
  const templates = await expensesRepo.findDue(userId);

  let created = 0;

  for (const template of templates) {
    created += await expensesRepo.withLockedDueTemplate(template._id, userId, now, async (locked, tx) => {
      let guard = 0;
      let pointer = new Date(locked.nextRunAt);
      const clones = [];
      while (pointer <= now && guard < 60) {
        clones.push({
          userId: locked.userId,
          financeMode: locked.financeMode,
          amount: locked.amount,
          amountMinor: locked.amountMinor,
          category: locked.category,
          description: locked.description,
          paymentMethod: locked.paymentMethod,
          date: new Date(pointer),
          generatedFrom: locked._id,
        });
        pointer = advance(pointer, locked.recurringFrequency, locked.date || pointer);
        guard += 1;
      }
      const count = await expensesRepo.createMany(clones, tx);
      await expensesRepo.setNextRunAt(locked._id, pointer, tx);
      return count;
    });
  }

  return created;
};

/** Cron entry point: catch every user up at once. */
const materializeAll = async ({ strict = false } = {}) => {
  const now = new Date();
  const userIds = await expensesRepo.userIdsWithDue();

  let total = 0;
  let failures = 0;
  for (const userId of userIds) {
    try {
      total += await materializeForUser(userId, now);
    } catch (err) {
      failures += 1;
      console.error('[recurring] user materialization failed:', err.message);
    }
  }

  if (total) console.log(`[recurring] created ${total} expense(s) across ${userIds.length} user(s)`);
  if (strict && failures) throw new Error(`Recurring materialization failed for ${failures} user(s)`);
  return total;
};

module.exports = { advance, firstRunAfter, nextRunAfter, materializeForUser, materializeAll };
