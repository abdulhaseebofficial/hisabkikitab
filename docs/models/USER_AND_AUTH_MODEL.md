# User & Authentication Model Documentation

## 1. Overview
The User and Authentication subsystem manages user identity, session lifecycle, security tokens, preferences, and finance mode state across **Hisabki Kitab**.

---

## 2. Database Schema

### Table: `users`
```sql
CREATE TABLE IF NOT EXISTS users (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text NOT NULL,
  email                     text NOT NULL,
  password                  text NOT NULL,
  monthly_income            double precision NOT NULL DEFAULT 0,
  monthly_income_minor      bigint NOT NULL DEFAULT 0,
  currency                  text NOT NULL DEFAULT 'PKR',
  university                text NOT NULL DEFAULT '',
  hostel_name               text NOT NULL DEFAULT '',
  custom_categories         text[] NOT NULL DEFAULT '{}',
  theme                     text NOT NULL DEFAULT 'system',
  finance_mode              text NOT NULL DEFAULT 'student' CHECK (finance_mode IN ('student', 'householder', 'shared_living')),
  language                  text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'roman_ur')),
  onboarding_completed      boolean NOT NULL DEFAULT false,
  is_demo                   boolean NOT NULL DEFAULT false,
  token_version             integer NOT NULL DEFAULT 0,
  reset_password_token      text,
  reset_password_expires    timestamptz,
  last_expense_reminder_at  timestamptz,
  google_id                 text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_single_demo_idx ON users (is_demo) WHERE is_demo;
```

### Table: `refresh_tokens`
```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  rotated_at  timestamptz,
  replaced_by text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  CONSTRAINT refresh_tokens_rotation_pair_check CHECK ((rotated_at IS NULL) = (replaced_by IS NULL))
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_hash_key ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS refresh_tokens_rotated_idx ON refresh_tokens (user_id, rotated_at);
```

---

## 3. Security & Token Lifecycle
1. **Password Hashing**: `bcryptjs` with salt work factor 10.
2. **Access Token**: Short-lived JWT (15 minutes). Sent in Authorization header: `Bearer <token>`.
3. **Refresh Token**: Long-lived (7 days) stored as an `httpOnly`, `SameSite=Strict`, `Secure` cookie.
   - Hashed with SHA-256 before storing in the database.
   - Rotation on every use: issuing a new refresh token invalidates the previous hash.
   - Grace period mechanism (`0008_refresh_rotation_grace.sql`) prevents race conditions caused by duplicate concurrent client refresh requests.
4. **Token Invalidation**: `token_version` on `users` increments to invalidate all active JWTs immediately on password change or global logout.

---

## 4. Finance Mode & Preferences State
- `finance_mode`: Determines the active operational view (`student`, `householder`, or `shared_living`).
- `language`: Presentation language (`en` or `roman_ur`). Modifying language updates labels on the fly without ever altering category identifiers or data history.
- `currency`: Supported values: `PKR`, `USD`, `EUR`, `GBP`, `INR`, `AED`, `SAR`.

---

## 5. API Endpoints

| Method | Path | Description | Protected |
|---|---|---|:---:|
| `POST` | `/api/auth/register` | Register new user account | No |
| `POST` | `/api/auth/login` | Authenticate with email/password | No |
| `POST` | `/api/auth/google` | Sign in / register via Google OAuth credential | No |
| `POST` | `/api/auth/refresh` | Rotate refresh token and get new access token | Cookie |
| `POST` | `/api/auth/logout` | Revoke session and clear refresh cookie | Yes |
| `POST` | `/api/auth/forgot-password` | Request password reset token via email | No |
| `POST` | `/api/auth/reset-password/:token` | Complete password reset | No |
| `GET` | `/api/profile` | Get current user profile and settings | Yes |
| `PATCH` | `/api/profile` | Update profile, finance mode, or language | Yes |
| `POST` | `/api/profile/export` | Download full user data export (JSON) | Yes |
| `DELETE` | `/api/profile` | Permanently delete account and all records | Yes |
