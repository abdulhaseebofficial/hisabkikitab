const { body, param, query } = require('express-validator');
const { idParam, amount } = require('../../shared/validation/rules');
const catalogue = require('@hisabkikitab/contracts/catalogue');

const KINDS = ['BORROWED', 'LENT'];
/** OUTSTANDING and OVERDUE are filters over derived state, not stored values. */
const FILTER_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'SETTLED', 'CANCELLED', 'OVERDUE', 'OUTSTANDING'];
const SORTS = ['newest', 'oldest', 'amount', 'remaining', 'due'];
const PURPOSE_CATEGORIES = catalogue.idsOf('udhaarPurpose');

/**
 * The free-text "what was it for", and the reason it is worth storing.
 *
 * Six months later "Ali - 5000" means nothing. "Ali - 5000 - hostel fee" is a
 * record someone can act on. It is optional, because forcing a sentence out of
 * someone recording a debt in a hurry gets "asdf".
 */
const purpose = (chain) =>
  chain.isString().trim().isLength({ max: 300 }).withMessage('Keep the purpose under 300 characters');

/**
 * A purpose category must be one of the known ones, and the ones the catalogue
 * marks requiresNote - "Other", in both languages - must come with the note
 * that makes them mean something. A record filed under "Other" with nothing
 * written is the same as a record filed under nothing.
 */
const purposeCategory = (chain) =>
  chain
    .isIn(PURPOSE_CATEGORIES)
    .withMessage('Unknown purpose')
    .bail()
    .custom((value, { req }) => {
      if (!catalogue.listRequiresNote('udhaarPurpose', value)) return true;
      const written = String(req.body.purpose || req.body.note || '').trim();
      if (written) return true;
      throw new Error('Say a little more about what this was for');
    });

/** Shared by create and update; optional on update, required on create. */
const personName = (chain) =>
  chain.isString().trim().isLength({ min: 1, max: 80 }).withMessage('Whose name should this be under?');

const debtValidators = {
  create: [
    body('kind').isIn(KINDS).withMessage('Say whether you borrowed or lent'),
    body('contactId').optional().isUUID().withMessage('Invalid debt contact id'),
    personName(body('personName').optional()),
    body().custom((value) => {
      if (Boolean(value.contactId) === Boolean(value.personName))
        throw new Error('Provide either contactId or personName');
      return true;
    }),
    amount('originalAmount'),
    body('personContact').optional().isString().trim().isLength({ max: 120 }),
    body('transactionDate').optional().isISO8601().toDate(),
    body('dueDate').optional({ nullable: true }).isISO8601().toDate(),
    body('category').optional({ nullable: true }).isString().trim().isLength({ max: 40 }),
    body('note').optional().isString().trim().isLength({ max: 500 }),
    purpose(body('purpose').optional({ nullable: true })),
    purposeCategory(body('purposeCategory').optional({ nullable: true, checkFalsy: true })),
  ],

  update: [
    idParam('id'),
    body('kind').optional().isIn(KINDS),
    personName(body('personName').optional()),
    body('originalAmount').optional().isFloat({ gt: 0 }).withMessage('Amount must be more than zero').toFloat(),
    body('personContact').optional().isString().trim().isLength({ max: 120 }),
    body('transactionDate').optional().isISO8601().toDate(),
    body('dueDate').optional({ nullable: true }).isISO8601().toDate(),
    body('category').optional({ nullable: true }).isString().trim().isLength({ max: 40 }),
    body('note').optional().isString().trim().isLength({ max: 500 }),
    purpose(body('purpose').optional({ nullable: true })),
    purposeCategory(body('purposeCategory').optional({ nullable: true, checkFalsy: true })),
  ],

  byId: [idParam('id')],

  /** A payment names an amount; the rest is optional colour. */
  addPayment: [
    idParam('id'),
    amount('amount'),
    body('paidOn').optional().isISO8601().toDate(),
    body('note').optional().isString().trim().isLength({ max: 200 }),
  ],

  /** A reason is optional; if given it is appended to the note, not replacing it. */
  cancel: [idParam('id'), body('reason').optional().isString().trim().isLength({ max: 200 })],

  settle: [idParam('id'), body('note').optional().isString().trim().isLength({ max: 200 })],

  /** Both ids matter: a payment is only reachable through the debt that owns it. */
  removePayment: [idParam('id'), param('paymentId').isUUID().withMessage('Invalid payment id')],

  list: [
    query('kind').optional().isIn(KINDS).withMessage('kind must be BORROWED or LENT'),
    query('status').optional().isIn(FILTER_STATUSES).withMessage('Unknown status filter'),
    query('sort').optional().isIn(SORTS).withMessage('Unknown sort order'),
    query('search').optional().isString().trim().isLength({ max: 80 }),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('dueFrom').optional().isISO8601(),
    query('dueTo').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  people: [
    query('search').optional().isString().trim().isLength({ max: 80 }),
    query('page').optional().isInt({ min: 1 }).toInt(),
  ],
  personRecords: [
    query('contactId').isUUID().withMessage('Invalid debt contact id'),
    query('page').optional().isInt({ min: 1 }).toInt(),
  ],
  contacts: [query('search').optional().isString().trim().isLength({ max: 80 }),
    query('page').optional().isInt({ min: 1 }).toInt()],
  renameContact: [
    idParam('id'),
    body('displayName').isString().trim().isLength({ min: 1, max: 80 }),
  ],
};

module.exports = debtValidators;
