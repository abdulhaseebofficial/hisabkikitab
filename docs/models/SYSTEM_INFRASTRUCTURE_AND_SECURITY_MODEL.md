# System Infrastructure & Security Model Documentation

## 1. Overview
This document details the underlying infrastructure, rate-limiting architecture, mutation idempotency, session token rotation, and database-level security invariants that protect **Hisabki Kitab** in production.

---

## 2. Distributed Rate Limiting (`rate_limits`)

### Why It Exists (`0009_rate_limits.sql`):
In-memory rate limiting fails in serverless and multi-instance container deployments (e.g. Vercel, serverless containers) because cold starts discard memory counters. To prevent brute-force attacks across ephemeral instances, Hisabki Kitab uses a distributed PostgreSQL-backed rate counter.

### Database Schema:
```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  key         text PRIMARY KEY,
  hits        integer NOT NULL DEFAULT 0,
  reset_at    timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limits_reset_idx ON rate_limits (reset_at);
```

### Privacy & Hash Invariant:
- The `key` is generated via:
  $$\text{key} = \text{SHA-256}(\text{scope} + \text{subject} + \text{window\_start})$$
- Neither client IP addresses nor user IDs are stored in plaintext. A database dump yields no identifiable user activity logs.
- Expired rows are swept lazily during lookups rather than requiring an external worker.

---

## 3. Financial Mutation Idempotency (`financial_requests`)

### Why It Exists (`0017_financial_request_versions.sql`):
Flaky mobile internet connections (frequent on 3G/4G in Pakistan) often cause clients to retry requests when an ACK packet drops. Without idempotency, a retry would create duplicate expenses or split bills twice.

### Database Schema:
```sql
CREATE TABLE IF NOT EXISTS financial_requests (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id    uuid NOT NULL,
  action        text NOT NULL,
  request_hash  char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
```

### Mechanism:
1. Client generates a UUID `request_id` and sends it in headers or payload.
2. The transaction hashes the request payload (`request_hash`).
3. If `(user_id, request_id)` already exists:
   - If `request_hash` matches, it immediately returns the cached `result` JSON without re-executing.
   - If `request_hash` differs, it rejects the mutation as a conflict.
4. If new, the business logic and the `financial_requests` record commit atomically within the same database transaction.

---

## 4. Refresh Token Family Rotation & Grace Period (`0008_refresh_rotation_grace.sql`)

### Silent Refresh Token Security:
1. **Refresh Token Storage**: Stored as an `httpOnly`, `SameSite=Strict`, `Secure` cookie.
2. **Database Hashing**: Stored as a SHA-256 hash in `refresh_tokens`.
3. **Rotation on Every Use**: Calling `/api/auth/refresh` issues a new refresh token and invalidates the previous token.
4. **Grace Period (Race Condition Defense)**:
   - When a browser makes multiple parallel requests upon waking up, duplicate refresh calls can occur simultaneously.
   - Under standard rotation, the second request would trigger a "replayed token" panic and logout the user.
   - Hisabki Kitab attaches `family_id`, `replaced_at`, and `grace_expires_at` (15-second window), allowing in-flight parallel requests from the same client to receive the valid session without revoking it.

---

## 5. Defense-in-Depth Database Invariants

1. **Role Revocation (`0004_revoke_browser_roles.sql`)**:
   - Explicitly revokes Supabase default browser roles (`anon`, `authenticated`) from issuing direct SQL or PostgREST calls against all internal tables.
   - Enforces that all database access occurs strictly through the authorized Node.js API service pool.
2. **Parameterized Queries**:
   - Zero dynamic string concatenation in SQL queries.
   - Queries use parameterized placeholders (`$1`, `$2`), eliminating SQL injection risks.
3. **Input Sanitation & Strict Validation**:
   - `express-validator` and `zod` enforce boundary checks on all endpoints.
   - Search strings escape SQL `LIKE` wildcards (`%`, `_`).
   - CSV export prepends single quotes to characters (`=`, `+`, `-`, `@`) to neutralize CSV formula injection attacks.
