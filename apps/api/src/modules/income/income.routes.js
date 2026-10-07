const express = require('express');
const ctrl = require('./income.controller');
const validate = require('../../shared/middleware/validate');
const { protect } = require('../auth/auth.middleware');
const incomeValidators = require('./income.validator');
const { requireKey } = require('../../shared/finance/idempotency');

const router = express.Router();

router.use(protect);

router.get('/', ctrl.listIncome);
router.get('/summary', ctrl.incomeSummary);
router.post('/', incomeValidators.create, validate, requireKey, ctrl.createIncome);
router.put('/:id', incomeValidators.update, validate, ctrl.updateIncome);
router.delete('/:id', incomeValidators.byId, validate, ctrl.deleteIncome);

module.exports = router;
