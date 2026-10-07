/**
 * The validation pieces every module's validator builds on.
 *
 * The chains themselves live with their feature; only what all of them need
 * is here, so a new rule about ids or passwords is written once.
 */

const { body, param, query } = require('express-validator');
const {
  checkName,
  normalizeName,
  checkEmail,
  normalizeEmail,
  checkPassword,
  PASSWORD_MESSAGES,
} = require('@hisabkikitab/contracts/validation');
const { CURRENCIES } = require('../constants');
const { decimalToMinor } = require('../finance/personalMoney');

const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

// Ids are Postgres uuids. Anything else is rejected here rather than reaching
// a query, where a malformed uuid would raise 22P02 and read as a 500.
const idParam = (name) => param(name).isUUID().withMessage('Invalid id');

/**
 * A human name.
 *
 * The sanitizer collapses runs of whitespace and trims, so " Ali   Khan " is
 * stored as "Ali Khan". It removes nothing else: a name carrying a digit or a
 * script tag is rejected outright rather than quietly stripped and saved as
 * something the student did not type.
 *
 * The rule itself lives in @hisabkikitab/contracts so the sign-up form can
 * apply the identical test before submitting. This side is still the one that
 * decides.
 */
const name = (field = 'name') =>
  body(field)
    .customSanitizer(normalizeName)
    .custom((value) => {
      const result = checkName(value);
      if (!result.ok) throw new Error(result.message);
      return true;
    });

/**
 * An email address.
 *
 * Trimmed and otherwise left exactly as typed. express-validator's
 * normalizeEmail() used to run here, which lowercased everything and stripped
 * the dots and +tags out of Gmail addresses - so a student who signed up as
 * first.last@gmail.com found firstlast@gmail.com on their profile. Matching is
 * case-insensitive anyway: the unique index is on lower(email) and every
 * lookup compares that way, so nothing has to be rewritten to make it work.
 */
const email = (field = 'email') =>
  body(field)
    .customSanitizer(normalizeEmail)
    .custom((value) => {
      const result = checkEmail(value);
      if (!result.ok) throw new Error(result.message);
      return true;
    });

/**
 * A new password.
 *
 * Reports the first unmet requirement by name, using the same wording the
 * sign-up checklist shows, so the message a student reads on failure is one
 * they have already seen on screen.
 */
const password = (field = 'password') =>
  body(field)
    .isString()
    .withMessage(PASSWORD_MESSAGES.required)
    .bail()
    .custom((value) => {
      const result = checkPassword(value);
      if (!result.ok) throw new Error(result.message);
      return true;
    });

/** Confirmation must match, and must be present when the caller sends one. */
const confirmPassword = (field = 'confirmPassword', against = 'password') =>
  body(field)
    .custom((value, { req }) => value === undefined || value === req.body[against])
    .withMessage(PASSWORD_MESSAGES.mismatch);

/** A consent box: present, and actually ticked. */
const accepted = (field, message) =>
  body(field)
    .custom((value) => value === true || value === 'true' || value === 'on')
    .withMessage(message);

const moneyValue = (chain, options = {}) => chain.custom((value) => {
  try {
    const cents = decimalToMinor(value, options);
    if (options.minMinor !== undefined && cents < options.minMinor) throw new RangeError();
    return true;
  }
  catch { throw new Error('Amount must be within range and have at most two decimal places'); }
});
const amount = (field = 'amount') => moneyValue(body(field).exists().bail(), { allowZero: false });

/* ------------------------------- auth -------------------------------- */

module.exports = {
  idParam,
  name,
  email,
  password,
  confirmPassword,
  accepted,
  amount,
  moneyValue,
  CURRENCY_CODES,
};
