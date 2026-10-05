const express = require('express');
const ctrl = require('./debts.controller');
const validate = require('../../shared/middleware/validate');
const { protect } = require('../auth/auth.middleware');
const debtValidators = require('./debts.validator');
const { requireKey } = require('../../shared/finance/idempotency');

const router = express.Router();

router.use(protect);

// Before /:id, or "summary" would be read as an id.
router.get('/summary', ctrl.getSummary);
router.get('/people', debtValidators.people, validate, ctrl.listPeople);
router.get('/people/records', debtValidators.personRecords, validate, ctrl.listPersonRecords);
router.get('/contacts', debtValidators.contacts, validate, ctrl.listContacts);
router.patch('/contacts/:id', debtValidators.renameContact, validate, ctrl.renameContact);

router.get('/', debtValidators.list, validate, ctrl.listDebts);
router.post('/', debtValidators.create, validate, requireKey, ctrl.createDebt);

router.get('/:id', debtValidators.byId, validate, ctrl.getDebt);
router.put('/:id', debtValidators.update, validate, ctrl.updateDebt);
router.delete('/:id', debtValidators.byId, validate, ctrl.deleteDebt);

router.get('/:id/payments', debtValidators.byId, validate, ctrl.listPayments);
router.post('/:id/payments', debtValidators.addPayment, validate, requireKey, ctrl.addPayment);
router.delete('/:id/payments/:paymentId', debtValidators.removePayment, validate, ctrl.deletePayment);

router.post('/:id/settle', debtValidators.settle, validate, requireKey, ctrl.settleDebt);
router.post('/:id/cancel', debtValidators.cancel, validate, ctrl.cancelDebt);

module.exports = router;
