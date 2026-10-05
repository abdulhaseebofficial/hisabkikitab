const { body } = require('express-validator');
const { idParam, amount, moneyValue } = require('../../shared/validation/rules');
const catalogue = require('@hisabkikitab/contracts/catalogue');
const { modeOf } = require('../../shared/categories');

/**
 * Which income sources this person may use.
 *
 * The allowlist follows their finance mode, so a householder can record a
 * salary, rent received or money sent from abroad, and a student still gets
 * pocket money and a scholarship. Before this the list was the six student
 * sources for everybody, which meant the household income vocabulary existed
 * in the catalogue and no request could ever use it.
 *
 * Both modes are accepted rather than only the active one. Someone who logged
 * a salary, switched to student mode and then corrected a typo in that entry
 * would otherwise be told their own stored source is unknown - the row still
 * belongs to the mode it was created in, and the mode filter on the query is
 * what keeps the two sets apart, not this list.
 */
const allowedSources = (req) => {
  const active = catalogue.categoryIdsFor('income', modeOf(req.user));
  const other = catalogue.categoryIdsFor(
    'income',
    modeOf(req.user) === 'householder' ? 'student' : 'householder'
  );
  return [...new Set([...active, ...other])];
};

const source = (chain) =>
  chain.custom((value, { req }) => {
    if (allowedSources(req).includes(value)) return true;
    throw new Error('Unknown income source');
  });

const incomeValidators = {
  create: [
    amount(),
    source(body('source').optional({ checkFalsy: true })),
    body('note').optional().trim().isLength({ max: 200 }),
    body('date').optional().isISO8601().toDate(),
  ],

  update: [
    idParam('id'),
    moneyValue(body('amount').optional(), { allowZero: false }),
    source(body('source').optional({ checkFalsy: true })),
    body('note').optional().trim().isLength({ max: 200 }),
    body('date').optional().isISO8601().toDate(),
  ],

  byId: [idParam('id')],
};

module.exports = incomeValidators;
