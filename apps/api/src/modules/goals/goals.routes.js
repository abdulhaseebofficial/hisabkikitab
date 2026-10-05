const express = require('express');
const ctrl = require('./goals.controller');
const validate = require('../../shared/middleware/validate');
const { protect } = require('../auth/auth.middleware');
const goalValidators = require('./goals.validator');
const { requireKey } = require('../../shared/finance/idempotency');

const router = express.Router();

router.use(protect);

router.get('/', ctrl.listGoals);
router.post('/', goalValidators.create, validate, requireKey, ctrl.createGoal);
router.get('/:id', goalValidators.byId, validate, ctrl.getGoal);
router.put('/:id', goalValidators.update, validate, ctrl.updateGoal);
// One endpoint handles both directions: a negative amount is a withdrawal.
router.patch('/:id/add', goalValidators.contribute, validate, requireKey, ctrl.contribute);
router.delete('/:id', goalValidators.byId, validate, ctrl.deleteGoal);

module.exports = router;
