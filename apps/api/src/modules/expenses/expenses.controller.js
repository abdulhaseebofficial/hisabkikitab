/**
 * Expense endpoints. Request in, JSON out; the rules are in expenses.service.
 */

const expenses = require('./expenses.service');
const asyncHandler = require('../../shared/http/asyncHandler');

/**
 * GET /api/expenses
 * Filtering, sorting and pagination. Also returns the sum of the filtered set
 * so the UI can show "total for this filter" without a second round trip.
 */
const listExpenses = asyncHandler(async (req, res) => {
  const { items, pagination, filteredTotal } = await expenses.list(req.user._id, req.user.financeMode, req.query);
  res.json({ success: true, data: { items, pagination, filteredTotal } });
});

/** GET /api/expenses/:id */
const getExpense = asyncHandler(async (req, res) => {
  const expense = await expenses.getById(req.params.id, req.user.financeMode, req.user._id);
  res.json({ success: true, data: { expense } });
});

/** POST /api/expenses */
const createExpense = asyncHandler(async (req, res) => {
  const expense = await expenses.create(req.user, req.body, req.financialRequestKey);
  res.status(201).json({ success: true, message: 'Expense added', data: { expense } });
});

/** PUT /api/expenses/:id */
const updateExpense = asyncHandler(async (req, res) => {
  const expense = await expenses.update(req.params.id, req.user, req.body);
  res.json({ success: true, message: 'Expense updated', data: { expense } });
});

/** DELETE /api/expenses/:id */
const deleteExpense = asyncHandler(async (req, res) => {
  const id = await expenses.remove(req.params.id, req.user.financeMode, req.user._id);
  res.json({ success: true, message: 'Expense deleted', data: { id } });
});

/** POST /api/expenses/:id/mark-paid - this bill is settled for this cycle. */
const markBillPaid = asyncHandler(async (req, res) => {
  const result = await expenses.markBillPaid(req.params.id, req.user, req.body, req.financialRequestKey);
  res.status(201).json({ success: true, message: 'Bill marked as paid', data: result });
});

module.exports = {
  markBillPaid, listExpenses, getExpense, createExpense, updateExpense, deleteExpense };
