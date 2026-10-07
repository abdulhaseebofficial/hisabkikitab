const { body } = require('express-validator');
const { idParam, moneyValue } = require('../../shared/validation/rules');

const budgetValidators = {
  upsert: [
    body('category').trim().notEmpty().withMessage('Pick a category'),
    moneyValue(body('limit')),
    body('month').optional().isInt({ min: 1, max: 12 }).toInt(),
    body('year').optional().isInt({ min: 2000, max: 2200 }).toInt(),
  ],

  bulk: [
    body('items').isArray({ min: 1 }).withMessage('Send at least one budget line'),
    body('items.*.category').trim().notEmpty().withMessage('Every line needs a category'),
    moneyValue(body('items.*.limit')),
    body('month').optional().isInt({ min: 1, max: 12 }).toInt(),
    body('year').optional().isInt({ min: 2000, max: 2200 }).toInt(),
  ],

  update: [idParam('id'), moneyValue(body('limit'))],

  byId: [idParam('id')],
};

/* --------------------------------- ai -------------------------------- */

module.exports = budgetValidators;
