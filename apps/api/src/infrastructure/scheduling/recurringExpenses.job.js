/**
 * recurringService — turns recurring expense templates into real expenses.
 *
 * A recurring expense (e.g. the monthly mess bill) is stored as an ordinary
 * expense with `isRecurring: true` and a `nextRunAt` date. When that date
 * passes we clone the template into a new expense and move `nextRunAt`
 * forward inside the same locked database transaction as the clone insert.
 */

const expensesRepo = require('../../modules/expenses/expenses.repository');

/** Next occurrence after `date` for a given frequency. */
const advance = (date, frequency) => {
  const next = new Date(date);
  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + 1);
  else if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const daysInMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, daysInMonth));
  }
  return next;
};

/** First run date for a brand new recurring template. */
const firstRunAfter = (date, frequency) => advance(date, frequency);

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
        pointer = advance(pointer, locked.recurringFrequency);
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

module.exports = { advance, firstRunAfter, materializeForUser, materializeAll };
