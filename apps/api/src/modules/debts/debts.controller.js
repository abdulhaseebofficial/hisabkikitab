/**
 * Udhaar endpoints. Request in, JSON out; every rule is in debts.service.
 */

const debts = require('./debts.service');
const asyncHandler = require('../../shared/http/asyncHandler');

/** GET /api/debts - filtered, sorted, paginated. */
const listDebts = asyncHandler(async (req, res) => {
  const data = await debts.list(req.user._id, req.user.financeMode, req.query);
  res.json({ success: true, data });
});
const listPeople = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await debts.people(req.user._id, req.user.financeMode, req.query) });
});
const listPersonRecords = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await debts.personRecords(req.user._id, req.user.financeMode, req.query) });
});
const listContacts = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await debts.contacts(req.user._id, req.query) });
});
const renameContact = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { contact: await debts.renameContact(req.params.id, req.user._id, req.body) } });
});

/** GET /api/debts/summary - what is owed, and to whom, in both directions. */
const getSummary = asyncHandler(async (req, res) => {
  const data = await debts.summary(req.user._id, req.user.financeMode);
  res.json({ success: true, data });
});

/** GET /api/debts/:id - the record and its full payment history. */
const getDebt = asyncHandler(async (req, res) => {
  const data = await debts.getById(req.params.id, req.user.financeMode, req.user._id);
  res.json({ success: true, data });
});

/** GET /api/debts/:id/payments */
const listPayments = asyncHandler(async (req, res) => {
  const payments = await debts.paymentsFor(req.params.id, req.user.financeMode, req.user._id);
  res.json({ success: true, data: { payments } });
});

/** POST /api/debts */
const createDebt = asyncHandler(async (req, res) => {
  const debt = await debts.create(req.user, req.body, req.financialRequestKey);
  res.status(201).json({
    success: true,
    message: debt.kind === 'BORROWED' ? 'Added to what you owe' : 'Added to what you are owed',
    data: { debt },
  });
});

/** PUT /api/debts/:id */
const updateDebt = asyncHandler(async (req, res) => {
  const debt = await debts.update(req.params.id, req.user, req.body);
  res.json({ success: true, message: 'Record updated', data: { debt } });
});

/** DELETE /api/debts/:id */
const deleteDebt = asyncHandler(async (req, res) => {
  const id = await debts.remove(req.params.id, req.user.financeMode, req.user._id);
  res.json({ success: true, message: 'Record deleted', data: { id } });
});

/** POST /api/debts/:id/payments - a full or partial payment. */
const addPayment = asyncHandler(async (req, res) => {
  const { debt, payment, justSettled } = await debts.addPayment(req.params.id, req.user, req.body, req.financialRequestKey);
  res.status(201).json({
    success: true,
    message: justSettled ? 'Settled in full' : 'Payment recorded',
    data: { debt, payment, justSettled },
  });
});

/** POST /api/debts/:id/settle - clear whatever is left in one go. */
const settleDebt = asyncHandler(async (req, res) => {
  const { debt, payment } = await debts.settle(req.params.id, req.user, req.body.note, req.financialRequestKey);
  res.json({ success: true, message: 'Settled in full', data: { debt, payment, justSettled: true } });
});

/** POST /api/debts/:id/cancel - it no longer counts, but it still happened. */
const cancelDebt = asyncHandler(async (req, res) => {
  const debt = await debts.cancel(req.params.id, req.user, req.body.reason);
  res.json({ success: true, message: 'Record cancelled', data: { debt } });
});

/** DELETE /api/debts/:id/payments/:paymentId - undo a mistyped payment. */
const deletePayment = asyncHandler(async (req, res) => {
  const debt = await debts.removePayment(req.params.id, req.params.paymentId, req.user.financeMode, req.user._id);
  res.json({ success: true, message: 'Payment removed', data: { debt } });
});

module.exports = {
  listDebts,
  listPeople,
  listPersonRecords,
  listContacts,
  renameContact,
  getSummary,
  getDebt,
  listPayments,
  cancelDebt,
  createDebt,
  updateDebt,
  deleteDebt,
  addPayment,
  settleDebt,
  deletePayment,
};
