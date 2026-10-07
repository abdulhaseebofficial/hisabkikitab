const express = require('express');
const ctrl = require('./expenses.controller');
const validate = require('../../shared/middleware/validate');
const { protect } = require('../auth/auth.middleware');
const expenseValidators = require('./expenses.validator');
const { requireKey } = require('../../shared/finance/idempotency');

const router = express.Router();

router.use(protect);

router.get('/', expenseValidators.list, validate, ctrl.listExpenses);
router.post('/', expenseValidators.create, validate, requireKey, ctrl.createExpense);
router.get('/:id', expenseValidators.byId, validate, ctrl.getExpense);
router.put('/:id', expenseValidators.update, validate, ctrl.updateExpense);
router.delete('/:id', expenseValidators.byId, validate, ctrl.deleteExpense);

// Ticking a bill off records it and moves its due date on, in one step.
router.post('/:id/mark-paid', expenseValidators.markPaid, validate, requireKey, ctrl.markBillPaid);

module.exports = router;
