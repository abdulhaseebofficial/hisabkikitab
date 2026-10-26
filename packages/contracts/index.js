/**
 * The vocabulary the API and the web app must agree on.
 *
 * These lists were written out twice, once on each side. That works right up
 * until they drift: add a payment method to the API's validator and the
 * dropdown still offers the old six, or add one to the dropdown and the
 * validator rejects it. Both are silent until a student hits them.
 *
 * The values live in vocabulary.json rather than in this file because the two
 * consumers load JavaScript differently - the API requires CommonJS, the web
 * app is bundled as ESM - and JSON is the one format both read natively
 * without a build step or a second copy of the data.
 *
 * What belongs here: a list both sides must agree on.
 * What does not: anything one side alone decides. The colours and emoji the
 * web attaches to a category, and the fallback budget split the API uses when
 * no model is configured, stay where they are used.
 *
 * WHAT EACH LIST IS
 *
 *   CATEGORIES            the default spending categories, tuned for hostel
 *                         life. A student can add their own on top, which is
 *                         why the API calls these DEFAULT_CATEGORIES.
 *   PAYMENT_METHODS       how a hostel student in Pakistan actually pays.
 *   INCOME_SOURCES        where a student's money comes from.
 *   RECURRING_FREQUENCIES how often a recurring expense repeats. Values only -
 *                         the wording shown in the UI is the web app's.
 *   CURRENCIES            code, symbol and label for each supported currency.
 *   NOTIFICATION_TYPES    the kinds of alert the bell can hold.
 *   FEEDBACK_TYPES        what a piece of feedback is about.
 *   DEVELOPER             who the app is by. The API mails feedback here and
 *                         the web app shows it on the contact links.
 */

const vocabulary = require('./vocabulary.json');
const business = require('./business');

/** Just the codes, which is what a validator or a <select> actually wants. */
const CURRENCY_CODES = vocabulary.CURRENCIES.map((c) => c.code);

/**
 * The vocabulary and the business contracts are merged into one namespace, so
 * two definitions of the same name cannot coexist: the later one wins and the
 * earlier one disappears without a word. That happened once - business payment
 * rails replaced the personal payment methods, and every expense a person
 * submitted was rejected as an unknown payment method - so a repeat is a
 * startup failure rather than a silent substitution. Business names that mean
 * something different from a personal one get a BUSINESS_ prefix.
 */
const collisions = Object.keys(business).filter((name) => name in vocabulary);
if (collisions.length) {
  throw new Error(
    `@hisabkikitab/contracts: business redefines ${collisions.join(', ')} from vocabulary.json. `
    + 'Rename the business export (BUSINESS_* ) instead of shadowing the shared name.'
  );
}

module.exports = Object.assign({}, vocabulary, { CURRENCY_CODES }, business);
