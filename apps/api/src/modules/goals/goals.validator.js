const { body } = require('express-validator');
const { idParam, moneyValue } = require('../../shared/validation/rules');

const goalValidators = {
  create: [
    body('title').trim().notEmpty().withMessage('Give your goal a name').isLength({ max: 80 }),
    moneyValue(body('targetAmount'), { allowZero: false, minMinor: 100n }),
    moneyValue(body('savedAmount').optional()),
    body('deadline').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid deadline'),
    body('icon').optional().isLength({ max: 8 }),
    body('note').optional().trim().isLength({ max: 200 }),
  ],

  update: [
    idParam('id'),
    body('title').optional().trim().notEmpty().isLength({ max: 80 }),
    moneyValue(body('targetAmount').optional(), { allowZero: false, minMinor: 100n }),
    body('deadline').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body('icon').optional().isLength({ max: 8 }),
    body('note').optional().trim().isLength({ max: 200 }),
  ],

  contribute: [
    idParam('id'),
    moneyValue(body('amount'), { allowNegative: true, allowZero: false }),
    body('note').optional().trim().isLength({ max: 200 }),
  ],

  byId: [idParam('id')],
};

/* ------------------------------- budget ------------------------------ */

module.exports = goalValidators;
