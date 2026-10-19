const express = require('express');
const ctrl = require('./auth.controller');
const validate = require('../../shared/middleware/validate');
const { protect } = require('./auth.middleware');
const { authLimiter, refreshLimiter } = require('../../shared/middleware/rateLimiter');
const authValidators = require('./auth.validator');

const router = express.Router();

/**
 * GET /api/auth/config
 *
 * What the sign-in screen needs to know before anyone types anything: whether
 * Google sign-in is switched on, and if so which client id to render the button
 * with. Public by design - a Google client id is not a secret, it is baked into
 * every Google button on the web - and served from here rather than compiled
 * into the bundle so there is one variable to set instead of two that can drift
 * apart.
 */
router.get('/config', ctrl.publicConfig);

// Every unauthenticated auth route is rate limited against brute forcing.
router.post('/register', authLimiter, authValidators.register, validate, ctrl.register);
router.post('/login', authLimiter, authValidators.login, validate, ctrl.login);
router.post('/demo', authLimiter, ctrl.demo);

// Rate limited like every other way into an account. An ID token is verified
// against Google on each call, so an unlimited endpoint would also be a way to
// make this server hammer Google's key endpoint on someone's behalf.
router.post('/google', authLimiter, authValidators.google, validate, ctrl.googleSignIn);
// Metered like the rest: refresh is what a stolen cookie is used against.
router.post('/refresh', refreshLimiter, ctrl.refresh);
router.post('/logout', ctrl.logout);

router.post('/forgot-password', authLimiter, authValidators.forgotPassword, validate, ctrl.forgotPassword);
router.post('/reset-password/:token', authLimiter, authValidators.resetPassword, validate, ctrl.resetPassword);

router.get('/me', protect, ctrl.me);
router.put(
  '/change-password',
  refreshLimiter,
  protect,
  authValidators.changePassword,
  validate,
  ctrl.changePassword
);

module.exports = router;
