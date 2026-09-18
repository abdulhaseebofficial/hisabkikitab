const crypto = require('crypto');
const { isProduction } = require('../config/validateEnv');
const { createMemoryStore, createPostgresStore } = require('../../infrastructure/rateLimit/stores');

/**
 * Rate limiting, counted somewhere every instance can see.
 *
 * This used to be express-rate-limit with its default in-memory store. That is
 * right for one long-lived server and close to useless on a platform that gives
 * each cold request its own instance: the counter an attacker is running into
 * belongs to a process that is about to be discarded, so the limit is present
 * in the response headers and stops nobody.
 *
 * The counter now lives in Postgres, which this app already requires. No second
 * piece of infrastructure, and no second credential to hold.
 *
 *
 * FAILING SAFELY
 *
 * A store that is down has to be answered one way or the other, and the right
 * answer depends on what is behind the limiter:
 *
 *   fail closed   login, registration, password reset, refresh - the endpoints
 *                 worth brute-forcing. If the counter is unavailable these
 *                 refuse rather than run unmetered, because "the limiter is
 *                 broken" and "there is no limiter" must not look the same to
 *                 somebody guessing passwords.
 *
 *   fail open     everything else. A database blip should not take the whole
 *                 API down, and the exposure from a few unmetered reads is not
 *                 comparable.
 *
 *
 * WHAT IS COUNTED, AND WHAT IS STORED
 *
 * The subject is an account id where there is one and an IP address otherwise.
 * Neither is written down: the key is a SHA-256 of the scope and the subject,
 * so the table can say how often somebody called an endpoint without saying who
 * they were. Nothing about the subject is logged either.
 */

const HASH_SALT = process.env.RATE_LIMIT_SALT || 'hisabkikitab-rate-limit';

/**
 * Which store to use.
 *
 * Explicit configuration wins. Otherwise production gets the shared counter and
 * development gets the in-memory one, because a dev server has no exposure to
 * protect and a suite that shares counters between runs is a suite that fails
 * for reasons that have nothing to do with the code.
 */
const chooseStore = () => {
  const configured = String(process.env.RATE_LIMIT_STORE || '').trim().toLowerCase();

  if (configured === 'memory') return createMemoryStore();
  if (configured === 'postgres') return createPostgresStore();
  if (configured && configured !== 'auto') {
    throw new Error(
      `RATE_LIMIT_STORE must be "postgres", "memory" or "auto" - got "${configured}"`
    );
  }

  return isProduction() ? createPostgresStore() : createMemoryStore();
};

let store = null;

/** The active store, created on first use so config errors surface at boot. */
const getStore = () => {
  if (!store) store = chooseStore();
  return store;
};

/** Only for tests: swap in a store, and put the real one back afterwards. */
const setStore = (replacement) => {
  const previous = store;
  store = replacement;
  return () => {
    store = previous;
  };
};

/**
 * The counting key: scope plus subject, hashed.
 *
 * `req.ip` is only meaningful when Express is told which proxies to trust;
 * app.js sets that. Where there is a signed-in account the account is a better
 * subject than the address it came from - one person behind a shared university
 * NAT should not be limited by their neighbours.
 */
const keyFor = (scope, req) => {
  const subject = req.user && req.user._id ? `user:${req.user._id}` : `ip:${req.ip || 'unknown'}`;
  return crypto.createHash('sha256').update(`${HASH_SALT}|${scope}|${subject}`).digest('hex');
};

const message = (msg) => ({ success: false, message: msg });

/**
 * Builds one limiter.
 *
 * @param {object} options
 * @param {string} options.scope        names the counter, so limits do not share one
 * @param {number} options.windowMs     how long a window lasts
 * @param {number} options.max          requests allowed inside it
 * @param {string} options.text         what the caller is told when refused
 * @param {boolean} options.failClosed  refuse when the store is unavailable
 */
const limiter = ({ scope, windowMs, max, text, failClosed = false }) => {
  return async function rateLimitMiddleware(req, res, next) {
    // The suites make hundreds of calls; a limit there fails runs rather than
    // finding bugs. Production is unaffected: NODE_ENV is never "test" there.
    if (process.env.NODE_ENV === 'test') return next();

    let result;
    try {
      result = await getStore().hit(keyFor(scope, req), windowMs);
    } catch (err) {
      // The subject is deliberately absent from this line.
      console.error(`[rate-limit] ${scope} store unavailable: ${err.message}`);

      if (failClosed) {
        return res
          .status(503)
          .json(message('This is temporarily unavailable. Please try again shortly.'));
      }
      return next();
    }

    const remaining = Math.max(0, max - result.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)));

    if (result.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)));
      return res.status(429).json(message(text));
    }

    return next();
  };
};

/**
 * Limits are strict in production and generous in local development.
 *
 * The point of these limits is to stop brute force coming from the internet.
 * A dev server on localhost has no such exposure, and a strict cap there only
 * breaks legitimate work. `isProduction()` is default-deny, so an unset
 * NODE_ENV still gets the strict numbers - development has to be opted into.
 */
const forEnv = (strict, relaxed) => (isProduction() ? strict : relaxed);

/** Brute-force protection for login / register / password reset. */
const authLimiter = limiter({
  scope: 'auth',
  windowMs: 15 * 60 * 1000,
  max: forEnv(20, 300),
  text: 'Too many attempts. Please try again in 15 minutes.',
  failClosed: true,
});

/**
 * Refresh and password change, which the auth limiter did not cover.
 *
 * Refresh is worth its own budget: it is the endpoint a stolen cookie is used
 * against, and it is the one endpoint a legitimate client calls on a schedule,
 * so the ceiling is higher than login's but it is no longer unmetered.
 */
const refreshLimiter = limiter({
  scope: 'refresh',
  windowMs: 15 * 60 * 1000,
  max: forEnv(60, 600),
  text: 'Too many session refreshes. Please try again shortly.',
  failClosed: true,
});

/** The AI routes cost real money per call, so they get a tighter budget. */
const aiLimiter = limiter({
  scope: 'ai',
  windowMs: 60 * 60 * 1000,
  max: forEnv(30, 300),
  text: 'You have reached the hourly AI limit. Try again a bit later.',
});

/** Feedback writes a row and attempts an e-mail, so it is worth more than a read. */
const feedbackLimiter = limiter({
  scope: 'feedback',
  windowMs: 60 * 60 * 1000,
  max: forEnv(10, 100),
  text: 'That is a lot of feedback for one hour. Please try again later.',
});

/** Broad safety net for the rest of the API. */
const globalLimiter = limiter({
  scope: 'global',
  windowMs: 15 * 60 * 1000,
  max: forEnv(600, 5000),
  text: 'Too many requests. Please slow down.',
});

module.exports = {
  authLimiter,
  refreshLimiter,
  aiLimiter,
  feedbackLimiter,
  globalLimiter,
  // Exported for tests and for the startup check.
  getStore,
  setStore,
  keyFor,
  limiter,
};
