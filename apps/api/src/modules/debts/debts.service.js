/**
 * Udhaar: what a student borrowed, and what they lent.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It creates no expense and no income. Borrowing 5,000 is cash arriving that
 * has to go back out again - it is not earnings, and recording it as income
 * would have the dashboard congratulate a student on money they owe. Lending is
 * the mirror: money leaving that is still theirs, not spending. Repaying is
 * neither, or a student would appear to have spent the same 5,000 twice.
 *
 * So the dashboard's income and spend stay about what was actually earned and
 * actually consumed, and a debt position is reported separately. Anything else
 * would need an accounting model this app does not have.
 *
 * BALANCES ARE NEVER TAKEN FROM A REQUEST
 *
 * `remaining` and `status` are derived - in SQL, from the ledger - on every
 * read. A client can say what it likes about what is left; it will be ignored.
 */

const debtsRepo = require('./debts.repository');
const ApiError = require('../../shared/errors/ApiError');
const events = require('../../shared/events');
const { isOwnCategory, modeOf } = require('../../shared/categories');
const { round2 } = require('../../shared/utils/calculations');
const requests = require('../../shared/finance/idempotency');

/** How far ahead "due soon" looks, for the summary and for reminders. */
const DUE_SOON_DAYS = 7;

/** Only these may be edited; money moves through payments, never through a patch. */
const EDITABLE = [
  'kind',
  'personName',
  'personContact',
  'originalAmount',
  'transactionDate',
  'dueDate',
  'category',
  'note',
  'purpose',
  'purposeCategory',
];

/**
 * A category is optional, but if one is given it has to be one of the
 * student's own - the same rule expenses follow, so the two agree about what a
 * category is.
 */
const assertCategory = (user, category) => {
  if (category === undefined || category === null || category === '') return;
  if (!isOwnCategory(user, category)) {
    throw ApiError.badRequest(`"${category}" is not one of your categories`);
  }
};

/* ------------------------------ reading ----------------------------- */

const list = (userId, financeMode, filters) => debtsRepo.list(userId, financeMode, filters);
const people = (userId, financeMode, filters) => debtsRepo.people(userId, financeMode, filters);
const personRecords = (userId, financeMode, filters) =>
  debtsRepo.personRecords(userId, financeMode, filters.contactId, filters.page || 1);
const contacts = (userId, filters) => debtsRepo.contacts(userId, filters.search, filters.page || 1);
const renameContact = async (id, userId, input) => {
  const contact = await debtsRepo.renameContact(id, userId, input.displayName.trim());
  if (!contact) throw ApiError.notFound('Debt contact not found');
  return contact;
};

/** One debt with its ledger, which is the only way the details screen is useful. */
const getById = async (id, financeMode, userId) => {
  const debt = await debtsRepo.findById(id, financeMode, userId);
  if (!debt) throw ApiError.notFound('Debt record not found');

  const payments = await debtsRepo.payments(id, userId);
  return { debt, payments };
};

const paymentsFor = async (id, financeMode, userId) => {
  const debt = await debtsRepo.findById(id, financeMode, userId);
  if (!debt) throw ApiError.notFound('Debt record not found');
  return debtsRepo.payments(id, userId);
};

/**
 * Every debt in one mode with its ledger, for the account export.
 *
 * Includes cancelled and settled records. An export is an account of what
 * happened, not a list of what is still outstanding.
 */
const listAllForExport = (userId, financeMode) =>
  debtsRepo.listAllWithPayments(userId, financeMode);

/* ------------------------------ writing ----------------------------- */

const create = async (user, input, requestKey) => {
  assertCategory(user, input.category);

  const { value } = await requests.run(user._id, `debt:create:${modeOf(user)}`, requestKey, input, async tx => {
    const debt = await debtsRepo.create(user._id, {
      financeMode: modeOf(user),
      kind: input.kind,
      contactId: input.contactId,
      personName: input.personName ? String(input.personName).trim() : undefined,
      personContact: input.personContact,
      originalAmount: input.originalAmount,
      transactionDate: input.transactionDate ? new Date(input.transactionDate) : new Date(),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      category: input.category || null,
      note: input.note,
      // Both purpose fields are optional: a debt is worth recording without a reason.
      purpose: input.purpose || null,
      purposeCategory: input.purposeCategory || null,
    }, tx);
    if (!debt) throw ApiError.notFound('Debt contact not found');
    return debt;
  });
  return value;
};

/**
 * Edits a record. The amount may be corrected, but never below what has already
 * been paid against it - that would leave a debt owing less than nothing, and
 * the ledger is the thing that is true.
 */
const update = async (id, user, body) => {
  const existing = await debtsRepo.findById(id, modeOf(user), user._id);
  if (!existing) throw ApiError.notFound('Debt record not found');

  if (body.category !== undefined) assertCategory(user, body.category);

  const patch = {};
  EDITABLE.forEach((field) => {
    if (body[field] !== undefined) patch[field] = body[field];
  });

  if (patch.originalAmount !== undefined && Number(patch.originalAmount) < existing.paidAmount) {
    throw ApiError.badRequest(
      `Already paid ${existing.paidAmount}, so the amount cannot be corrected below that`
    );
  }

  if (patch.personName !== undefined) patch.personName = String(patch.personName).trim();
  if (patch.transactionDate !== undefined) patch.transactionDate = new Date(patch.transactionDate);
  if (patch.dueDate !== undefined) patch.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;

  const debt = await debtsRepo.update(id, modeOf(user), user._id, patch);
  if (!debt) throw ApiError.notFound('Debt record not found');
  return debt;
};

/**
 * Deletes a record and its ledger.
 *
 * Settled records are never removed automatically - "I paid Ali back in March"
 * is worth keeping - but a student may still delete one they entered by
 * mistake, and that is their call to make.
 */
const remove = async (id, financeMode, userId) => {
  const removed = await debtsRepo.remove(id, financeMode, userId);
  if (!removed) throw ApiError.notFound('Debt record not found');
  return id;
};

/* ----------------------------- payments ----------------------------- */

/** Announces a settlement, once, the first time a debt is cleared. */
const announceIfSettled = async (user, result) => {
  if (result.debt.status === 'SETTLED' && !result.wasSettled) {
    await events.emitAndWait(events.DEBT_SETTLED, { user, debt: result.debt });
  }
};

const addPayment = async (id, user, { amount, paidOn, note }, requestKey) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw ApiError.badRequest('A payment has to be more than zero');
  }

  const { value: result, replayed } = await requests.run(user._id,
    `debt:payment:${modeOf(user)}:${id}`, requestKey, { amount, paidOn, note }, async tx => {
      const outcome = await debtsRepo.addPayment(id, modeOf(user), user._id,
        { amount: value, paidOn, note }, tx);
      if (outcome.reason === 'NOT_FOUND') throw ApiError.notFound('Debt record not found');
      if (outcome.reason === 'OVERPAY') throw ApiError.badRequest(
        `That is more than is left. Only ${round2(outcome.remaining)} remains on this record.`);
      return outcome;
    });

  if (!replayed) await announceIfSettled(user, result);
  return { debt: result.debt, payment: result.payment, justSettled: result.debt.status === 'SETTLED' && !result.wasSettled };
};

/**
 * Clears whatever is left in one payment.
 *
 * Convenience rather than a separate concept: it works out the remaining
 * balance and records an ordinary payment for it, so the ledger reads the same
 * as if the student had typed the figure themselves.
 */
/**
 * Cancels a record without deleting it.
 *
 * The distinction matters to the person: "delete" is for something they typed
 * by mistake, "cancel" is for a debt that existed and no longer counts. The
 * second keeps the history, and only the first is destructive.
 */
const cancel = async (id, user, reason) => {
  const result = await debtsRepo.cancel(id, modeOf(user), user._id, reason);

  if (result.reason === 'NOT_FOUND') throw ApiError.notFound('Debt record not found');
  if (result.reason === 'NOT_CANCELLABLE') {
    throw ApiError.badRequest(
      result.debt && result.debt.status === 'CANCELLED'
        ? 'This record is already cancelled'
        : 'A settled record cannot be cancelled'
    );
  }
  return result.debt;
};

const settle = async (id, user, note, requestKey) => {
  const { value: result, replayed } = await requests.run(user._id,
    `debt:settle:${modeOf(user)}:${id}`, requestKey, { note }, async tx => {
      const row = await tx.queryOne(
        'SELECT original_amount - paid_amount AS remaining FROM debts WHERE id=$1 AND user_id=$2 AND finance_mode=$3 FOR UPDATE',
        [id, user._id, modeOf(user)]);
      if (!row) throw ApiError.notFound('Debt record not found');
      if (row.remaining <= 0) throw ApiError.badRequest('This record is already settled');
      return debtsRepo.addPayment(id, modeOf(user), user._id,
        { amount: row.remaining, paidOn: new Date(), note: note || 'Settled in full' }, tx);
    });
  if (!replayed) await announceIfSettled(user, result);
  return { debt: result.debt, payment: result.payment, justSettled: true };
};

/** Removes a mistyped payment and puts the balance back. */
const removePayment = async (debtId, paymentId, financeMode, userId) => {
  const result = await debtsRepo.removePayment(debtId, paymentId, financeMode, userId);

  if (result.reason === 'NOT_FOUND') throw ApiError.notFound('Debt record not found');
  if (result.reason === 'PAYMENT_NOT_FOUND') throw ApiError.notFound('Payment not found');

  return result.debt;
};

/* ------------------------------ summary ----------------------------- */

/**
 * The student's position.
 *
 * netBalance = receivable - payable, so a positive number means more is owed to
 * them than by them. Only outstanding amounts count; a settled debt is history.
 */
const summary = async (userId, financeMode) => {
  const [totals, dueSoon] = await Promise.all([
    debtsRepo.summary(userId, financeMode),
    debtsRepo.dueWithin(userId, financeMode, DUE_SOON_DAYS),
  ]);

  return {
    payable: round2(totals.payable),
    receivable: round2(totals.receivable),
    netBalance: round2(totals.receivable - totals.payable),
    overdue: round2(totals.overdue),
    outstandingCount: totals.outstandingCount,
    settledCount: totals.settledCount,
    overdueCount: totals.overdueCount,
    dueSoon,
    dueSoonDays: DUE_SOON_DAYS,
  };
};

module.exports = {
  list,
  people,
  personRecords,
  contacts,
  renameContact,
  getById,
  paymentsFor,
  listAllForExport,
  create,
  update,
  remove,
  addPayment,
  cancel,
  settle,
  removePayment,
  summary,
};
