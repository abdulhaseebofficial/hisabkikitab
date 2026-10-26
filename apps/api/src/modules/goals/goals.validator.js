const { body } = require('express-validator');
const { idParam, moneyValue, unicodeText } = require('../../shared/validation/rules');

const goalValidators = {
  create: [
    unicodeText(body('title'), { min: 1, max: 80, message: 'Give your goal a name' }),
    moneyValue(body('targetAmount'), { allowZero: false, minMinor: 100n }),
    moneyValue(body('savedAmount').optional()),
    body('deadline').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid deadline'),
    body('icon').optional().isLength({ max: 8 }),
    unicodeText(body('note').optional(), { max: 200 }),
  ],

  update: [
    idParam('id'),
    unicodeText(body('title').optional(), { min: 1, max: 80, message: 'Give your goal a name' }),
    moneyValue(body('targetAmount').optional(), { allowZero: false, minMinor: 100n }),
    body('deadline').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body('icon').optional().isLength({ max: 8 }),
    unicodeText(body('note').optional(), { max: 200 }),
  ],

  contribute: [
    idParam('id'),
    moneyValue(body('amount'), { allowNegative: true, allowZero: false }),
    unicodeText(body('note').optional(), { max: 200 }),
  ],

  byId: [idParam('id')],
};

/* ------------------------------- budget ------------------------------ */

module.exports = goalValidators;
