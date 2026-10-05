const { body, param } = require('express-validator');
const {
  name,
  email,
  password,
  confirmPassword,
  accepted,
  moneyValue,
  CURRENCY_CODES,
} = require('../../shared/validation/rules');
const { TERMS_MESSAGE } = require('@hisabkikitab/contracts/validation');

const authValidators = {
  register: [
    name(),
    email(),
    password(),
    confirmPassword(),
    accepted('acceptTerms', TERMS_MESSAGE),
    moneyValue(body('monthlyIncome').optional()),
    body('currency').optional().isIn(CURRENCY_CODES).withMessage('Unsupported currency'),
  ],

  // Login checks the shape of the address but never the password policy: the
  // rules can tighten over time, and an existing password that no longer meets
  // them must still open the account it belongs to. Only a NEW password is
  // held to the current policy.
  login: [
    email(),
    body('password').notEmpty().withMessage('Password is required'),
  ],

  // Shape only. Whether the token is genuine is Google's signature to answer,
  // not a regex - see infrastructure/auth/google.js.
  google: [
    body('idToken')
      .isString()
      .withMessage('Missing Google credential')
      .bail()
      .isLength({ min: 20, max: 8192 })
      .withMessage('Missing Google credential'),
  ],

  forgotPassword: [email()],

  resetPassword: [param('token').isLength({ min: 20 }).withMessage('Invalid reset link'), password()],

  changePassword: [
    body('currentPassword').notEmpty().withMessage('Enter your current password'),
    password('newPassword'),
    confirmPassword('confirmPassword', 'newPassword'),
  ],
};

/* ------------------------------ profile ------------------------------ */

module.exports = authValidators;
