const express = require('express');
const ctrl = require('./users.controller');
const validate = require('../../shared/middleware/validate');
const { protect } = require('../auth/auth.middleware');
const profileValidators = require('./users.validator');
const { requireKey } = require('../../shared/finance/idempotency');

const router = express.Router();

router.use(protect); // everything below needs a logged-in student

router.put('/', profileValidators.update, validate, ctrl.updateProfile);
router.post('/onboarding', profileValidators.onboarding, validate, requireKey, ctrl.completeOnboarding);

router.get('/categories', ctrl.getCategories);
router.post('/categories', profileValidators.addCategory, validate, ctrl.addCategory);
router.delete('/categories/:name', ctrl.deleteCategory);

router.get('/export', ctrl.exportData);
router.delete('/', profileValidators.deleteAccount, validate, ctrl.deleteAccount);

module.exports = router;
