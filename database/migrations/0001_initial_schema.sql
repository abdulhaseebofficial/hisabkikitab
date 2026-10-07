-- Hisabki Kitab schema.
--
-- Applied by `node db/migrate.js`, which runs this file as one transaction.
-- Every statement is idempotent, so re-running it is safe and is exactly what
-- the deploy does.
--
-- Amounts are `double precision` on purpose. Every total in
-- utils/calculations.js is rounded with round2() at the edge, so the rounding
-- that matters happens in one place rather than being split between the column
-- type and the code.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

/* ------------------------------- users ------------------------------ */

CREATE TABLE IF NOT EXISTS users (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text NOT NULL,
  email                     text NOT NULL,
  password                  text NOT NULL,
  monthly_income            double precision NOT NULL DEFAULT 0,
  currency                  text NOT NULL DEFAULT 'PKR',
  university                text NOT NULL DEFAULT '',
  hostel_name               text NOT NULL DEFAULT '',
  custom_categories         text[] NOT NULL DEFAULT '{}',
  theme                     text NOT NULL DEFAULT 'system',
  onboarding_completed      boolean NOT NULL DEFAULT false,
  token_version             integer NOT NULL DEFAULT 0,
  reset_password_token      text,
  reset_password_expires    timestamptz,
  last_expense_reminder_at  timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Email is matched lowercased everywhere, so the uniqueness must be too.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

/* --------------------------- refresh tokens ------------------------- */
-- One row per signed-in device. Only the hash is stored, so a database dump
-- yields no usable session. A token that verifies but has no row here has
-- already been rotated, which means it was replayed.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_hash_key ON refresh_tokens (token_hash);

/* ------------------------------ expenses ---------------------------- */

CREATE TABLE IF NOT EXISTS expenses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount              double precision NOT NULL CHECK (amount > 0),
  category            text NOT NULL,
  description         text NOT NULL DEFAULT '',
  payment_method      text NOT NULL DEFAULT 'Cash',
  date                timestamptz NOT NULL DEFAULT now(),
  is_recurring        boolean NOT NULL DEFAULT false,
  recurring_frequency text NOT NULL DEFAULT 'monthly',
  next_run_at         timestamptz,
  generated_from      uuid REFERENCES expenses(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- The dominant query is "one user's expenses in a date range, newest first".
CREATE INDEX IF NOT EXISTS expenses_user_date_idx ON expenses (user_id, date DESC);
CREATE INDEX IF NOT EXISTS expenses_user_cat_date_idx ON expenses (user_id, category, date DESC);
-- Drives the recurring sweep without scanning the table.
CREATE INDEX IF NOT EXISTS expenses_due_idx ON expenses (next_run_at) WHERE is_recurring;

/* ------------------------------- income ----------------------------- */

CREATE TABLE IF NOT EXISTS income (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      double precision NOT NULL CHECK (amount > 0),
  source      text NOT NULL DEFAULT 'Pocket Money',
  note        text NOT NULL DEFAULT '',
  date        timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS income_user_date_idx ON income (user_id, date DESC);

/* -------------------------------- goals ----------------------------- */

CREATE TABLE IF NOT EXISTS goals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          text NOT NULL,
  target_amount  double precision NOT NULL CHECK (target_amount >= 1),
  saved_amount   double precision NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
  deadline       timestamptz,
  -- No default: the icon comes from DEFAULT_GOAL_ICON in config/constants.js so
  -- the emoji is written down in exactly one place.
  icon           text NOT NULL,
  note           text NOT NULL DEFAULT '',
  is_completed   boolean NOT NULL DEFAULT false,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goals_user_open_idx ON goals (user_id, is_completed, deadline);

-- Small ledger so add / withdraw stays auditable instead of a silent overwrite.
CREATE TABLE IF NOT EXISTS goal_contributions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount      double precision NOT NULL,
  note        text NOT NULL DEFAULT '',
  date        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goal_contributions_goal_idx ON goal_contributions (goal_id, date);

/* ------------------------------- budgets ---------------------------- */

CREATE TABLE IF NOT EXISTS budgets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    text NOT NULL,
  "limit"     double precision NOT NULL CHECK ("limit" >= 0),
  month       integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year        integer NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One limit per category per month per user.
CREATE UNIQUE INDEX IF NOT EXISTS budgets_unique_idx
  ON budgets (user_id, year, month, category);

/* ---------------------------- notifications ------------------------- */

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  message     text NOT NULL,
  is_read     boolean NOT NULL DEFAULT false,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- De-duplication key such as overspend:Travel:2026-08 so the same alert is
  -- raised only once per subject per period.
  dedupe_key  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);
-- Partial, so the many rows with no dedupe key do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx
  ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

/* ------------------------------ feedback ---------------------------- */

CREATE TABLE IF NOT EXISTS feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT 'General',
  rating      integer CHECK (rating BETWEEN 1 AND 5),
  message     text NOT NULL,
  page        text NOT NULL DEFAULT '',
  emailed     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback (user_id, created_at DESC);

/* ---------------------------- chat messages ------------------------- */

CREATE TABLE IF NOT EXISTS chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_user_idx ON chat_messages (user_id, created_at);
