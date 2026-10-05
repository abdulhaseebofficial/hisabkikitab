/**
 * Expense rules.
 *
 * Three things this feature decides, all of them here:
 *
 *  - a category has to be one of the student's own, built-in or custom;
 *  - a recurring expense carries a pointer to when it next falls due, and that
 *    pointer has to stay consistent with the flag through every edit;
 *  - writing an expense can push a category over its limit, so the alert
 *    checks re-run afterwards.
 */

const expensesRepo = require('./expenses.repository');
const { isOwnCategory, isOtherModeCategory, modeOf } = require('../../shared/categories');
const ApiError = require('../../shared/errors/ApiError');
const {
  advance,
  firstRunAfter,
  materializeForUser,
} = require('../../infrastructure/scheduling/recurringExpenses.job');
const events = require('../../shared/events');
const requests = require('../../shared/finance/idempotency');

const DEFAULT_PAYMENT_METHOD = 'Cash';
const DEFAULT_FREQUENCY = 'monthly';

const assertOwnCategory = (user, category) => {
  if (isOtherModeCategory(user, category)) {
    throw ApiError.badRequest(
      'That category belongs to your other finance mode. Switch modes, or pick one from this list.'
    );
  }
  if (!isOwnCategory(user, category)) {
    throw ApiError.badRequest(`"${category}" is not one of your categories`);
  }
};

/**
 * Announces a write, once the row is committed.
 *
 * Whether that means an alert is notifications' business, not this module's.
 * Fire and forget, as it was before: the expense is already saved and the
 * student should not wait on something that is not part of their answer.
 */
const announce = (user, expense, action) => {
  events.emit(events.EXPENSE_WRITTEN, { user, expense, action });
};

/** Filtered, sorted, paginated, with the sum of the filtered set. */
const list = async (userId, financeMode, filters) => {
  // Catch recurring bills up first so the list is never stale.
  await materializeForUser(userId);
  return expensesRepo.list(userId, financeMode, filters);
};

const getById = async (id, financeMode, userId) => {
  const expense = await expensesRepo.findById(id, financeMode, userId);
  if (!expense) throw ApiError.notFound('Expense not found');
  return expense;
};

const create = async (user, input, requestKey) => {
  const {
    amount,
    category,
    description,
    paymentMethod,
    date,
    isRecurring,
    recurringFrequency,
  } = input;

  assertOwnCategory(user, category);

  const when = date ? new Date(date) : new Date();
  const frequency = recurringFrequency || DEFAULT_FREQUENCY;

  const { value: expense, replayed } = await requests.run(user._id, `expense:create:${modeOf(user)}`, requestKey, input, tx => expensesRepo.create(user._id, {
    // Whichever life they are recording right now is the one this belongs to.
    financeMode: modeOf(user),
    amount,
    category,
    description: description || '',
    paymentMethod: paymentMethod || DEFAULT_PAYMENT_METHOD,
    date: when,
    isRecurring: Boolean(isRecurring),
    recurringFrequency: frequency,
    nextRunAt: isRecurring ? firstRunAfter(when, frequency) : null,
  }, tx));

  if (!replayed) announce(user, expense, 'created');
  return expense;
};

/** Only the fields a student is allowed to change are copied across. */
const EDITABLE = [
  'amount',
  'category',
  'description',
  'paymentMethod',
  'date',
  'isRecurring',
  'recurringFrequency',
];

const update = async (id, user, body) => {
  const existing = await expensesRepo.findById(id, modeOf(user), user._id);
  if (!existing) throw ApiError.notFound('Expense not found');

  if (body.category) assertOwnCategory(user, body.category);

  const patch = {};
  EDITABLE.forEach((field) => {
    if (body[field] !== undefined) patch[field] = body[field];
  });

  // Keep the recurring pointer consistent with the flag.
  const willRecur =
    patch.isRecurring === undefined ? existing.isRecurring : Boolean(patch.isRecurring);

  if (willRecur) {
    const when = patch.date ? new Date(patch.date) : new Date(existing.date);
    const frequency = patch.recurringFrequency || existing.recurringFrequency;
    if (!existing.nextRunAt) patch.nextRunAt = firstRunAfter(when, frequency);
  } else {
    patch.nextRunAt = null;
  }

  const expense = await expensesRepo.update(id, modeOf(user), user._id, patch);
  announce(user, expense, 'updated');
  return expense;
};

const remove = async (id, financeMode, userId) => {
  const removed = await expensesRepo.remove(id, financeMode, userId);
  if (!removed) throw ApiError.notFound('Expense not found');
  return id;
};

/* ------------------- for other modules to build on ------------------ */

/** The newest few, without the recurring catch-up the list route does. */
const listRecent = (userId, financeMode, limit) => expensesRepo.list(userId, financeMode, { limit });

/** Everything in a date range, for a report or an export. */
const listForRange = (userId, financeMode, from, to) =>
  expensesRepo.listForRange(userId, financeMode, from, to);

/** Every expense this student has, for the data export. */
const listAllForUser = (userId, financeMode) => expensesRepo.listAllForUser(userId, financeMode);

/** How many expenses still use a category, before it can be deleted. */
const countByCategory = (userId, financeMode, category) =>
  expensesRepo.countByCategory(userId, financeMode, category);

/** How many were logged since a moment, for the "you have not logged" nudge. */
const countCreatedSince = (userId, since) => expensesRepo.countCreatedSince(userId, since);

/** Recurring bills falling due by a date, for the bill reminder. */
const findBillsDueBy = (userId, financeMode, when) =>
  expensesRepo.findBillsDueBy(userId, financeMode, when);

/**
 * Marks a recurring bill as paid for this cycle.
 *
 * Two things happen together, and both are needed: the expense is recorded, and
 * the template's next due date moves on by one cycle. Recording without
 * advancing would leave the bill sitting in "upcoming" after it was paid, and
 * the sweep would create it a second time when the date arrived.
 *
 * Marking it paid EARLY is the ordinary case - the bill is due on the 12th and
 * somebody pays it on the 8th - so the new due date is calculated from the date
 * that was scheduled, not from today. Otherwise a household that pays a few
 * days early every month would watch its billing date drift through the
 * calendar.
 */
const markBillPaid = async (id, user, { amount, paidOn } = {}, requestKey) => {
  const { value: result } = await requests.run(user._id, `expense:mark-paid:${modeOf(user)}:${id}`, requestKey,
    { amount, paidOn }, async tx => {
      const payment = await expensesRepo.withLockedBillTemplate(id, user._id, modeOf(user), async (template, billTx) => {
        if (!template.isRecurring) throw ApiError.badRequest('That expense is not a recurring bill');

        const scheduled = template.nextRunAt ? new Date(template.nextRunAt) : new Date();
        const when = paidOn ? new Date(paidOn) : new Date();
        const created = await expensesRepo.create(user._id, {
          financeMode: template.financeMode,
          // The actual payment may differ from the template amount.
          amount: amount === undefined || amount === null ? template.amount : amount,
          amountMinor: amount === undefined || amount === null ? template.amountMinor : undefined,
          category: template.category,
          description: template.description,
          paymentMethod: template.paymentMethod,
          date: when,
          isRecurring: false,
          generatedFrom: template._id,
        }, billTx);

        const next = advance(scheduled, template.recurringFrequency);
        await expensesRepo.setNextRunAt(template._id, next, billTx);
        return { expense: created, nextDueAt: next };
      }, tx);
      if (!payment) throw ApiError.notFound('Expense not found');
      return payment;
    });
  return result;
};

module.exports = {
  markBillPaid,
  listRecent,
  listForRange,
  listAllForUser,
  countByCategory,
  countCreatedSince,
  findBillsDueBy,
  list,
  getById,
  create,
  update,
  remove,
};
