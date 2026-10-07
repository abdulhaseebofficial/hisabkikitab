/**
 * Fail fast on a dangerous configuration instead of booting into it.
 *
 * The rule everywhere below is DEFAULT-DENY: if NODE_ENV is not set we treat
 * the process as production. Forgetting to set it must never be the thing that
 * turns on debug output or leaks a password-reset token.
 */

const { databaseUrl, DATABASE_URL_MISSING } = require('../../infrastructure/database/databaseUrl');

const PLACEHOLDERS = [
  'change_me_access_secret',
  'change_me_refresh_secret',
  'change_me',
  'secret',
  'changeme',
];

const MIN_SECRET_LENGTH = 32;

/** True unless NODE_ENV explicitly says otherwise. */
const isProduction = () => process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test';

/** Debug output (stack traces, dev reset links) is opt-in, never the default. */
const isDevelopment = () => process.env.NODE_ENV === 'development';

const checkSecret = (name, errors, warnings) => {
  const value = process.env[name];

  if (!value) {
    errors.push(`${name} is not set. Generate one: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`);
    return;
  }
  if (PLACEHOLDERS.includes(value.toLowerCase())) {
    errors.push(`${name} is still the placeholder from .env.example. Replace it with a real random value.`);
    return;
  }
  if (value.length < MIN_SECRET_LENGTH) {
    const message = `${name} is only ${value.length} characters; use at least ${MIN_SECRET_LENGTH}.`;
    if (isProduction()) errors.push(message);
    else warnings.push(message);
  }
};

/**
 * Validates the environment. Throws in production, warns in development, so a
 * student running locally is never blocked but a real deployment cannot start
 * with a guessable signing key.
 */
const validateEnv = () => {
  const errors = [];
  const warnings = [];

  checkSecret('JWT_ACCESS_SECRET', errors, warnings);
  checkSecret('JWT_REFRESH_SECRET', errors, warnings);

  if (process.env.JWT_ACCESS_SECRET && process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.');
  }

  if (!databaseUrl()) {
    errors.push(DATABASE_URL_MISSING);
  }

  // A typo here fails silently and in the wrong direction - the cookie either
  // stops being sent or quietly becomes cross-site - so say so at boot.
  const sameSite = process.env.COOKIE_SAMESITE;
  if (sameSite !== undefined) {
    const value = String(sameSite).trim().toLowerCase();
    if (!['lax', 'strict', 'none'].includes(value)) {
      warnings.push(
        `COOKIE_SAMESITE is "${sameSite}", which is not lax, strict or none. Falling back to lax.`
      );
    } else if (value === 'none' && !isProduction()) {
      // Browsers discard SameSite=None without Secure, and Secure is off in
      // development - so this combination logs everyone out on every refresh.
      warnings.push(
        'COOKIE_SAMESITE=none needs Secure, which is off in development, so the browser will drop the refresh cookie.'
      );
    } else if (value === 'none') {
      warnings.push(
        'COOKIE_SAMESITE=none sends the refresh cookie on cross-site requests. ' +
          'Only a split deployment (SPA and API on different sites) needs it; on a single origin use lax.'
      );
    }
  }

  if (isProduction()) {
    if (!process.env.NODE_ENV) {
      warnings.push('NODE_ENV is not set; treating this process as production.');
    }
    if (!process.env.CLIENT_URL) {
      warnings.push('CLIENT_URL is not set, so CORS only allows http://localhost:5173.');
    }
    if (process.env.ALLOW_DEV_RESET_LINK === 'true') {
      errors.push('ALLOW_DEV_RESET_LINK must never be enabled outside local development.');
    }
    // Not fatal - the app is perfectly usable without it - but a student who
    // forgets their password is locked out for good, and that failure is
    // invisible until it happens to someone.
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      warnings.push(
        'SMTP is not configured, so password-reset emails cannot be delivered. ' +
          'Anyone who forgets their password will be locked out permanently.'
      );
    }

    // Rate limiting in production has to be counted somewhere every instance
    // can see. In memory it is per-instance, which on a platform that gives
    // each cold request its own instance means the limit is present in the
    // response headers and stops nobody.
    if (String(process.env.RATE_LIMIT_STORE || '').trim().toLowerCase() === 'memory') {
      warnings.push(
        'RATE_LIMIT_STORE=memory in production: limits are counted per instance, ' +
          'so brute-force protection is largely ineffective. Leave it unset to use ' +
          'the shared Postgres counter.'
      );
    }
  }

  // Google sign-in is optional, so an absent client id is a warning rather than
  // a refusal - the button is simply never shown. A MALFORMED one is different:
  // it means somebody intended to enable it and the feature will fail at the
  // moment a person tries to use it, which is the worst time to find out.
  const googleClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!googleClientId) {
    warnings.push(
      'GOOGLE_CLIENT_ID is not set, so "Continue with Google" is switched off. ' +
        'Set it to the OAuth 2.0 Web client id from the Google Cloud console to enable it.'
    );
  } else if (!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId)) {
    // A Web client id always has this shape. Anything else is a secret pasted
    // into the wrong variable, a truncated copy, or an id for the wrong
    // platform - and every one of those fails only at sign-in.
    errors.push(
      'GOOGLE_CLIENT_ID does not look like a Google OAuth Web client id ' +
        '(expected something ending in .apps.googleusercontent.com). ' +
        'Leave it unset to switch Google sign-in off.'
    );
  }

  warnings.forEach((w) => console.warn(`[config] warning: ${w}`));

  if (errors.length) {
    const detail = errors.map((e) => `  - ${e}`).join('\n');
    throw new Error(`Refusing to start, the configuration is unsafe:\n${detail}\n`);
  }

  console.log(`[config] validated (${isProduction() ? 'production' : process.env.NODE_ENV} mode)`);
};

module.exports = { validateEnv, isProduction, isDevelopment };
