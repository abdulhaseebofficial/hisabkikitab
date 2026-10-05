/**
 * Everything that reads or writes a student's account.
 *
 * Three rules this file exists to keep in one place: the password is hashed on
 * the way in, the private columns (hash, reset token, token version) are
 * stripped on the way out, and refresh tokens live in their own table so a
 * session can be revoked one device at a time.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, queryOne, transaction } = require('../../infrastructure/database/pool');
const { toApi, toApiList, buildSet, isUuid } = require('../../infrastructure/database/rows');
const { DEFAULT_CATEGORIES } = require('../../shared/constants');
const { decimalToMinor } = require('../../shared/finance/personalMoney');

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Columns that must never reach the client. */
const PRIVATE = ['password', 'reset_password_token', 'reset_password_expires', 'token_version'];

// Everything except the password, which is only fetched where it is compared.
const PUBLIC_COLUMNS = `
  id, name, email, monthly_income, monthly_income_minor, currency, university, hostel_name,
  custom_categories, theme, finance_mode, language, onboarding_completed, token_version,
  last_expense_reminder_at, created_at, updated_at,
  -- Not the password: whether there is one. An account created through Google
  -- has none, and the Settings screen has to offer "set a password" rather
  -- than "change password", which needs a current one that does not exist.
  (password IS NOT NULL) AS has_password,
  (google_id IS NOT NULL) AS has_google
`;

/**
 * A user as the API returns it. The private columns are dropped here rather
 * than left to each controller, which is what userSchema.toJSON used to do.
 */
const toPublicUser = (user) => {
  if (!user) return null;
  const out = { ...user };
  delete out.password;
  delete out.resetPasswordToken;
  delete out.resetPasswordExpires;
  delete out.tokenVersion;
  return out;
};

/* ------------------------------- lookups ---------------------------- */

const findByEmail = async (email, { withPassword = false } = {}) => {
  const row = await queryOne(
    `SELECT ${PUBLIC_COLUMNS}${withPassword ? ', password' : ''}
       FROM users WHERE lower(email) = lower($1)`,
    [String(email || '')]
  );
  return toApi(row);
};

const findById = async (id, { withPassword = false } = {}) => {
  if (!isUuid(id)) return null;
  const row = await queryOne(
    `SELECT ${PUBLIC_COLUMNS}${withPassword ? ', password' : ''} FROM users WHERE id = $1`,
    [id]
  );
  return toApi(row);
};

/** Every user, for the nightly alert sweep. */
const findAllForAlerts = async () => {
  const rows = await query(
    `SELECT id, name, currency, monthly_income, monthly_income_minor, last_expense_reminder_at FROM users`
  );
  return toApiList(rows);
};

/* ------------------------------ creation ---------------------------- */

const create = async ({
  name,
  email,
  password,
  monthlyIncome = 0,
  currency = 'PKR',
  university = '',
  hostelName = '',
}) => {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const row = await queryOne(
    `INSERT INTO users (name, email, password, monthly_income, monthly_income_minor, currency, university, hostel_name)
     VALUES ($1, $2, $3, 0, $4, $5, $6, $7)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      String(name).trim(),
      String(email).trim().toLowerCase(),
      hash,
      decimalToMinor(monthlyIncome || 0).toString(),
      String(currency || 'PKR').toUpperCase(),
      university || '',
      hostelName || '',
    ]
  );
  return toApi(row);
};

/* ------------------------------- google ----------------------------- */

/**
 * The account this Google identity already belongs to, if any.
 *
 * Matched on the Google subject claim, never on the email: a person can change
 * the email on their Google account, and `sub` is the only identifier Google
 * promises stays put.
 */
const findByGoogleId = async (googleId) => {
  const row = await queryOne(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE google_id = $1`,
    [String(googleId)]
  );
  return toApi(row);
};

/**
 * Attaches a Google identity to an existing account.
 *
 * Only ever called after Google has confirmed the person owns the address -
 * see infrastructure/auth/google.js. The WHERE clause refuses to move an
 * identity that is already attached somewhere else, so a second call with a
 * different user id changes nothing rather than silently re-pointing it.
 */
const linkGoogleId = async (userId, googleId) => {
  const row = await queryOne(
    `UPDATE users SET google_id = $2, updated_at = now()
      WHERE id = $1 AND (google_id IS NULL OR google_id = $2)
      RETURNING ${PUBLIC_COLUMNS}`,
    [userId, String(googleId)]
  );
  return toApi(row);
};

/**
 * A new account with no password at all.
 *
 * Not a random unusable password: that is a lie the rest of the code would
 * eventually believe, and it would make "does this account have a password?"
 * unanswerable. The column is nullable and a CHECK guarantees every row is
 * reachable by password or by Google.
 */
const createFromGoogle = async ({ name, email, googleId, currency = 'PKR' }) => {
  const row = await queryOne(
    `INSERT INTO users (name, email, google_id, currency, onboarding_completed)
     VALUES ($1, $2, $3, $4, false)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      String(name).trim(),
      String(email).trim().toLowerCase(),
      String(googleId),
      String(currency).toUpperCase(),
    ]
  );
  return toApi(row);
};

/* ------------------------------ passwords --------------------------- */

const comparePassword = (candidate, hash) => bcrypt.compare(candidate, hash || '');

/**
 * Sets a new password and invalidates every existing session: the version bump
 * kills tokens that still verify, and dropping the rows kills the rest.
 */
const setPassword = async (userId, newPassword) => {
  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  return transaction(async (tx) => {
    const row = await tx.queryOne(
      `UPDATE users
          SET password = $2,
              token_version = token_version + 1,
              reset_password_token = NULL,
              reset_password_expires = NULL,
              updated_at = now()
        WHERE id = $1
        RETURNING ${PUBLIC_COLUMNS}`,
      [userId, hash]
    );
    await tx.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
    return toApi(row);
  });
};

/* --------------------------- password reset ------------------------- */

/** Creates a reset token: the raw value is e-mailed, only the hash is stored. */
const createPasswordResetToken = async (userId) => {
  const raw = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  await query(
    `UPDATE users
        SET reset_password_token = $2, reset_password_expires = $3, updated_at = now()
      WHERE id = $1`,
    [userId, hashed, new Date(Date.now() + RESET_TOKEN_TTL_MS)]
  );
  return raw;
};

/** The account a still-valid reset token belongs to, if any. */
const findByResetToken = async (hashedToken) => {
  const row = await queryOne(
    `SELECT ${PUBLIC_COLUMNS} FROM users
      WHERE reset_password_token = $1 AND reset_password_expires > now()`,
    [hashedToken]
  );
  return toApi(row);
};

/* --------------------------- refresh tokens ------------------------- */

/**
 * Records a refresh token hash, drops the ones that have expired, and keeps at
 * most `max` devices signed in by discarding the oldest.
 */
const revokeAllSessions = async (userId) =>
  transaction(async (tx) => {
    await tx.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
    await tx.query(
      `UPDATE users SET token_version = token_version + 1, updated_at = now() WHERE id = $1`,
      [userId]
    );
  });

/* ------------------------------- profile ---------------------------- */

/** Applies a partial profile update. Unknown keys are ignored by design. */
const updateProfile = async (userId, patch, tx = { queryOne }) => {
  const columns = {
    name: patch.name,
    monthly_income_minor: patch.monthlyIncome === undefined ? undefined : decimalToMinor(patch.monthlyIncome).toString(),
    currency: patch.currency === undefined ? undefined : String(patch.currency).toUpperCase(),
    university: patch.university,
    hostel_name: patch.hostelName,
    theme: patch.theme,
    finance_mode: patch.financeMode,
    language: patch.language,
    onboarding_completed: patch.onboardingCompleted,
    custom_categories: patch.customCategories,
    last_expense_reminder_at: patch.lastExpenseReminderAt,
  };

  const { fragment, values, next } = buildSet(columns);
  if (!fragment) return findById(userId);

  const row = await tx.queryOne(
    `UPDATE users SET ${fragment}, updated_at = now()
      WHERE id = $${next} RETURNING ${PUBLIC_COLUMNS}`,
    [...values, userId]
  );
  return toApi(row);
};

const removeAccountSafely = (userId) =>
  transaction(async (tx) => {
    // Lock every space the account owns or belongs to. Transfer, leave and join
    // all lock the space first, so deletion cannot race an ownership decision.
    await tx.query(
      `SELECT s.id FROM sl_spaces s
       WHERE s.owner_id=$1 OR EXISTS (
         SELECT 1 FROM sl_memberships m WHERE m.space_id=s.id AND m.user_id=$1
       )
       ORDER BY s.id FOR UPDATE OF s`,
      [userId],
    );
    const owned = await tx.query(
      `SELECT s.id,EXISTS(
         SELECT 1 FROM sl_memberships m JOIN users u ON u.id=m.user_id
         WHERE m.space_id=s.id AND m.user_id<>$1
       ) AS has_successor
       FROM sl_spaces s WHERE s.owner_id=$1 ORDER BY s.id`,
      [userId],
    );
    if (owned.length) {
      return {
        deleted: false,
        // If any owned space lacks a successor, that is the actionable blocker.
        hasSuccessor: owned.every((space) => space.has_successor),
      };
    }
    const removed = await tx.queryOne(
      'DELETE FROM users WHERE id=$1 RETURNING id',
      [userId],
    );
    return { deleted: Boolean(removed), hasSuccessor: false };
  });

module.exports = {
  findByGoogleId,
  linkGoogleId,
  createFromGoogle,
  toPublicUser,
  findByEmail,
  findById,
  findAllForAlerts,
  create,
  comparePassword,
  setPassword,
  createPasswordResetToken,
  findByResetToken,
  revokeAllSessions,
  updateProfile,
  removeAccountSafely,
};
