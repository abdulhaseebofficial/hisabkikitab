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

/**
 * Characters that cannot be stored, as opposed to characters we dislike.
 *
 * Postgres `text` holds any Unicode scalar except NUL: a NUL in a parameter is
 * rejected by the server with 22021, which arrived as a 500 and an error-log
 * entry for what is really a malformed request. The rest of the C0 block is
 * included because a line feed or tab is the only control character a person
 * ever means to type in a description, and the others only arrive from a
 * broken client or someone probing.
 *
 * Deliberately NOT in here: `<`, `>`, quotes, ampersands, bidi controls, or
 * anything else that merely looks dangerous. Those are legitimate in a note -
 * "rent > 20000", "Ali's shop" - and they are made safe at the two places that
 * matter: parameterised SQL, and React escaping every string it renders. A
 * validator that strips them instead would store something the person did not
 * type, which is the one thing a financial record must never do.
 */
const UNSTORABLE_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u;

/**
 * A free-text field a person writes in their own language.
 *
 * Three things happen, in this order:
 *
 *   NFC normalisation. Urdu, Hindi and Tamil can each encode the same word
 *   two ways - precomposed, or a base letter plus combining marks - and
 *   Postgres compares bytes. Without this, a description saved from one
 *   keyboard is not found by a search typed on another, even though both
 *   render identically. NFC is canonical equivalence: it is the same text by
 *   Unicode's own definition, not a rewrite of what was typed.
 *
 *   Trim. Surrounding whitespace only.
 *
 *   Reject the unstorable. With a named field and a 400, instead of a 500 from
 *   the database.
 *
 * Length is counted in characters, not bytes, so a 200-character limit is 200
 * Urdu characters and not the 67 that a byte limit would allow.
 */
const unicodeText = (chain, { max, min = 0, message } = {}) =>
  chain
    .isString()
    .withMessage(message || 'This field must be text')
    .bail()
    .customSanitizer((value) => String(value).normalize('NFC').trim())
    .custom((value) => {
      if (UNSTORABLE_TEXT.test(value)) {
        throw new Error('Remove the control characters from this text');
      }
      return true;
    })
    .isLength({ min, max })
    .withMessage(message || `Keep this under ${max} characters`);

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
  unicodeText,
  UNSTORABLE_TEXT,
  CURRENCY_CODES,
};
