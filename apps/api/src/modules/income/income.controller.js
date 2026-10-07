/**
 * Income endpoints. Request in, JSON out; the rules are in income.service.
 */

const income = require('./income.service');
const asyncHandler = require('../../shared/http/asyncHandler');

/** GET /api/income - optional ?month=&year= or ?from=&to= */
const listIncome = asyncHandler(async (req, res) => {
  const { items, total } = await income.list(req.user._id, req.user.financeMode, req.query);
  res.json({ success: true, data: { items, total } });
});

/** GET /api/income/summary - this month's income vs plan at a glance. */
const incomeSummary = asyncHandler(async (req, res) => {
  const data = await income.summary(req.user);
  res.json({ success: true, data });
});

/** POST /api/income */
const createIncome = asyncHandler(async (req, res) => {
  const entry = await income.create(req.user._id, req.user.financeMode, req.body, req.financialRequestKey);
  res.status(201).json({ success: true, message: 'Income added', data: { income: entry } });
});

/** PUT /api/income/:id */
const updateIncome = asyncHandler(async (req, res) => {
  const entry = await income.update(req.params.id, req.user.financeMode, req.user._id, req.body);
  res.json({ success: true, message: 'Income updated', data: { income: entry } });
});

/** DELETE /api/income/:id */
const deleteIncome = asyncHandler(async (req, res) => {
  const id = await income.remove(req.params.id, req.user.financeMode, req.user._id);
  res.json({ success: true, message: 'Income deleted', data: { id } });
});

module.exports = { listIncome, incomeSummary, createIncome, updateIncome, deleteIncome };
