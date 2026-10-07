const { body, query } = require('express-validator');
const { idParam, amount, moneyValue } = require('../../shared/validation/rules');
const { PAYMENT_METHODS, RECURRING_FREQUENCIES } = require('../../shared/constants');

const expenseValidators = {
  create: [
    amount(),
    body('category').trim().notEmpty().withMessage('Pick a category'),
    body('description').optional().trim().isLength({ max: 200 }),
    body('paymentMethod').optional().isIn(PAYMENT_METHODS).withMessage('Unknown payment method'),
    body('date').optional().isISO8601().withMessage('Invalid date').toDate(),
    body('isRecurring').optional().isBoolean().toBoolean(),
    body('recurringFrequency').optional().isIn(RECURRING_FREQUENCIES),
  ],

  update: [
    idParam('id'),
    moneyValue(body('amount').optional(), { allowZero: false }),
    body('category').optional().trim().notEmpty(),
    body('description').optional().trim().isLength({ max: 200 }),
    body('paymentMethod').optional().isIn(PAYMENT_METHODS),
    body('date').optional().isISO8601().toDate(),
    body('isRecurring').optional().isBoolean().toBoolean(),
    body('recurringFrequency').optional().isIn(RECURRING_FREQUENCIES),
  ],

  list: [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('from').optional().isISO8601().withMessage('Invalid "from" date'),
    query('to').optional().isISO8601().withMessage('Invalid "to" date'),
    moneyValue(query('minAmount').optional()),
    moneyValue(query('maxAmount').optional()),
  ],

  byId: [idParam('id')],

  /**
   * A bill is rarely the same amount twice, so what was actually paid may be
   * given. Both fields are optional: ticking the box with nothing else says
   * "the usual amount, today".
   */
  markPaid: [
    idParam('id'),
    moneyValue(body('amount').optional(), { allowZero: false }),
    body('paidOn').optional().isISO8601().toDate(),
  ],
};

/* ------------------------------- income ------------------------------ */

module.exports = expenseValidators;
