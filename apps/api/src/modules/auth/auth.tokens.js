const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { isProduction } = require('../../shared/config/validateEnv');

const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '30d';
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long the access cookie lives.
 *
 * Deliberately a little longer than the token inside it. The cookie expiring
 * first would strip a still-valid token from the browser mid-session; the
 * token expiring first is the ordinary case the silent refresh handles.
 */
const ACCESS_COOKIE_MS = 60 * 60 * 1000;

// Pinning the algorithm matters on VERIFY: without it, jsonwebtoken will accept
// any algorithm the token claims, which is how algorithm-confusion attacks work.
const ALGORITHM = 'HS256';

/** Short lived token, sent in an httpOnly cookie and held in memory. */
const signAccessToken = (userId, tokenVersion) => {
  if (!Number.isSafeInteger(tokenVersion) || tokenVersion < 0) {
    throw new TypeError('A current token version is required for an access token');
  }
  return jwt.sign({ sub: String(userId), type: 'access', v: tokenVersion }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES,
    algorithm: ALGORITHM,
  });
};

/**
 * Long lived token, stored in an httpOnly cookie so JavaScript cannot read it.
 * `jti` makes every issued token unique even within the same second, which is
 * what allows rotation and reuse detection to tell two tokens apart.
 */
const signRefreshToken = (userId, tokenVersion = 0) =>
  jwt.sign(
    { sub: String(userId), type: 'refresh', v: tokenVersion, jti: crypto.randomUUID() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES, algorithm: ALGORITHM }
  );

const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM] });

const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET, { algorithms: [ALGORITHM] });

/**
 * Only the hash of a refresh token is stored, exactly like a password: a leaked
 * database dump must not hand over usable sessions.
 */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * How cross-site the refresh cookie is allowed to be.
 *
 * `lax` is the default because the deployment this repo describes serves the
 * SPA and the API from one origin: vercel.json routes /api/* to the backend
 * service and /* to the frontend, and the client calls the relative path /api
 * (apps/web/src/shared/api/client.js). A cookie on a same-site request is sent
 * under `lax` whatever the method, so login, refresh and logout all work - and
 * `lax` is the setting that actually withholds the cookie from a cross-site
 * POST, which is the CSRF case `none` gives away.
 *
 * `none` remains available because README still documents a split deployment
 * (SPA on Vercel, API on Render) where the cookie really must cross sites.
 * That is now an explicit choice rather than something every production deploy
 * inherits: set COOKIE_SAMESITE=none, and only with HTTPS, since browsers
 * reject SameSite=None without Secure.
 */
const SAMESITE_VALUES = ['lax', 'strict', 'none'];

const sameSitePolicy = () => {
  const configured = String(process.env.COOKIE_SAMESITE || '').trim().toLowerCase();
  if (SAMESITE_VALUES.includes(configured)) return configured;
  return 'lax';
};

/**
 * Cookie options for the access token.
 *
 * The access token used to be kept in localStorage, where any injected script
 * could read it and keep reading it - a stored token is a token an attacker can
 * exfiltrate at leisure, long after the injection is cleaned up. In an httpOnly
 * cookie JavaScript cannot see it at all.
 *
 * The path is /api rather than /api/auth: unlike the refresh token, this one
 * has to reach every endpoint. SameSite is what carries the CSRF defence -
 * under `lax` a cross-site POST, PUT, PATCH or DELETE does not send the cookie
 * at all, and those are the only requests here that change anything.
 */
const accessCookieOptions = () => {
  const prod = isProduction();
  return {
    httpOnly: true,
    secure: prod,
    sameSite: sameSitePolicy(),
    path: '/api',
    maxAge: ACCESS_COOKIE_MS,
  };
};

/** Cookie options shared by login / refresh / logout so they always match. */
const refreshCookieOptions = () => {
  const prod = isProduction();
  return {
    httpOnly: true, // JavaScript can never read it, so XSS cannot steal the session
    secure: prod, // HTTPS only outside local development
    sameSite: sameSitePolicy(),
    path: '/api/auth', // sent only to the routes that rotate it
    maxAge: REFRESH_MS,
  };
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  refreshCookieOptions,
  accessCookieOptions,
  REFRESH_MS,
  REFRESH_COOKIE: 'hw_refresh',
  ACCESS_COOKIE: 'hw_access',
};
