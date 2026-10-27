# Shared Living Models Documentation

## 1. Overview
The **Shared Living** module provides an institutional-grade, multi-tenant accounting system for roommates, flatmates, and hostel groups. It replaces error-prone spreadsheets with an immutable, auditable, and mathematically sound collaborative ledger.

---

## 2. Comprehensive Schema Specifications

### 1. `sl_spaces` (The Shared Living Space)
Represents a shared apartment, flat, or hostel room.
```sql
CREATE TABLE IF NOT EXISTS sl_spaces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  finance_mode  text NOT NULL DEFAULT 'shared_living' CHECK (finance_mode = 'shared_living'),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  currency      text NOT NULL CHECK (currency IN ('PKR','USD','EUR','GBP','INR','AED','SAR')),
  residents     integer NOT NULL CHECK (residents BETWEEN 1 AND 500),
  description   text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

### 2. `sl_memberships` (User Association & RBAC)
Maps registered users to a space.
```sql
CREATE TABLE IF NOT EXISTS sl_memberships (
  space_id    uuid NOT NULL REFERENCES sl_spaces(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);
```

### 3. `sl_invites` (Cryptographic Join Invitations)
```sql
CREATE TABLE IF NOT EXISTS sl_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES sl_spaces(id) ON DELETE CASCADE,
  code_hash   text NOT NULL UNIQUE CHECK (length(code_hash) = 64),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### 4. `sl_periods` (Monthly Accounting Cycles)
```sql
CREATE TABLE IF NOT EXISTS sl_periods (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id           uuid NOT NULL REFERENCES sl_spaces(id) ON DELETE CASCADE,
  month              date NOT NULL CHECK (extract(day FROM month) = 1 AND month BETWEEN '2000-01-01' AND '2200-12-01'),
  budget_minor       bigint NOT NULL CHECK (budget_minor BETWEEN 0 AND 999999999999),
  food_budget_minor  bigint NOT NULL CHECK (food_budget_minor BETWEEN 0 AND 999999999999),
  closed             boolean NOT NULL DEFAULT false,
  UNIQUE (space_id, month),
  UNIQUE (id, space_id)
);
```

### 5. `sl_members` (Roommates in the Space)
Enables tracking roommates even before they sign up for a web account.
```sql
CREATE TABLE IF NOT EXISTS sl_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES sl_spaces(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  phone       text NOT NULL DEFAULT '' CHECK (length(phone) <= 30),
  email       text NOT NULL DEFAULT '' CHECK (length(email) <= 254),
  joined_on   date NOT NULL,
  left_on     date CHECK (left_on >= joined_on),
  active      boolean NOT NULL DEFAULT true,
  weight      numeric(8,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  note        text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  archived    boolean NOT NULL DEFAULT false,
  UNIQUE (id, space_id),
  CHECK (active OR left_on IS NOT NULL)
);
```

### 6. `sl_categories` (Space Expense & Bill Categories)
```sql
CREATE TABLE IF NOT EXISTS sl_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES sl_spaces(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('food', 'bill')),
  stable_key  text NOT NULL,
  name        text NOT NULL DEFAULT '' CHECK (length(name) <= 100),
  archived    boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  UNIQUE (space_id, kind, stable_key),
  UNIQUE (id, space_id)
);
```

### 7. `sl_expenses` (Daily Shared Food / Groceries Purchases)
```sql
CREATE TABLE IF NOT EXISTS sl_expenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id      uuid NOT NULL REFERENCES sl_spaces(id) ON DELETE CASCADE,
  period_id     uuid NOT NULL,
  category_id   uuid NOT NULL,
  date          date NOT NULL,
  amount_minor  bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 999999999999),
  note          text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  method        text NOT NULL CHECK (method IN ('equal', 'selected', 'weighted', 'percentage', 'custom')),
  version       integer NOT NULL DEFAULT 1 CHECK (version > 0),
  request_id    uuid,
  request_hash  text,
  deleted       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (period_id, space_id) REFERENCES sl_periods(id, space_id),
  FOREIGN KEY (category_id, space_id) REFERENCES sl_categories(id, space_id),
  UNIQUE (id, space_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sl_expenses_request_idx ON sl_expenses (space_id, request_id) WHERE request_id IS NOT NULL;
```

### 8. `sl_bills` (Monthly Recurring / Fixed Bills)
```sql
CREATE TABLE IF NOT EXISTS sl_bills (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id                  uuid NOT NULL REFERENCES sl_spaces(id) ON DELETE CASCADE,
  period_id                 uuid NOT NULL,
  category_id               uuid NOT NULL,
  name                      text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  date                      date NOT NULL,
  due_date                  date NOT NULL,
  amount_minor              bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 999999999999),
  paid                      boolean NOT NULL DEFAULT false,
  paid_by                   uuid,
  note                      text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  recurring                 boolean NOT NULL DEFAULT false,
  recurring_origin_id       uuid REFERENCES sl_bills(id, space_id) ON DELETE RESTRICT,
  recurrence_identity_known boolean DEFAULT true,
  method                    text NOT NULL CHECK (method IN ('equal', 'selected', 'weighted', 'percentage', 'custom')),
  version                   integer NOT NULL DEFAULT 1 CHECK (version > 0),
  request_id                uuid,
  request_hash              text,
  deleted                   boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (period_id, space_id) REFERENCES sl_periods(id, space_id),
  FOREIGN KEY (category_id, space_id) REFERENCES sl_categories(id, space_id),
  FOREIGN KEY (paid_by, space_id) REFERENCES sl_members(id, space_id),
  UNIQUE (id, space_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sl_bills_request_idx ON sl_bills (space_id, request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sl_bills_one_recurring_origin_per_period ON sl_bills (space_id, period_id, recurring_origin_id) WHERE recurring_origin_id IS NOT NULL;
```

### 9. `sl_receipts` (Bill Receipt Image Storage)
Stores receipt images directly in PostgreSQL as bytea binary data with strict size bounds.
```sql
CREATE TABLE IF NOT EXISTS sl_receipts (
  bill_id     uuid PRIMARY KEY,
  space_id    uuid NOT NULL,
  image       bytea NOT NULL CHECK (octet_length(image) BETWEEN 45 AND 524288),
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (bill_id, space_id) REFERENCES sl_bills(id, space_id)
);
CREATE INDEX IF NOT EXISTS sl_receipts_space_idx ON sl_receipts (space_id);
```

### 10. `sl_shares` (Individual Calculated Member Liabilities)
```sql
CREATE TABLE IF NOT EXISTS sl_shares (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id           uuid NOT NULL REFERENCES sl_spaces(id) ON DELETE CASCADE,
  expense_id         uuid,
  bill_id            uuid,
  member_id          uuid NOT NULL,
  amount_minor       bigint NOT NULL CHECK (amount_minor >= 0),
  manually_adjusted  boolean NOT NULL DEFAULT false,
  CHECK ((expense_id IS NULL) <> (bill_id IS NULL)),
  FOREIGN KEY (expense_id, space_id) REFERENCES sl_expenses(id, space_id),
  FOREIGN KEY (bill_id, space_id) REFERENCES sl_bills(id, space_id),
  FOREIGN KEY (member_id, space_id) REFERENCES sl_members(id, space_id),
  UNIQUE (expense_id, member_id),
  UNIQUE (bill_id, member_id)
);
```

### 11. `sl_payments` (Member Contributions to the Space)
```sql
CREATE TABLE IF NOT EXISTS sl_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id      uuid NOT NULL REFERENCES sl_spaces(id) ON DELETE CASCADE,
  period_id     uuid NOT NULL,
  member_id     uuid NOT NULL,
  amount_minor  bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 999999999999),
  date          date NOT NULL,
  method        text NOT NULL CHECK (method IN ('cash', 'bank', 'mobile', 'other')),
  reference     text NOT NULL DEFAULT '' CHECK (length(reference) <= 100),
  note          text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  version       integer NOT NULL DEFAULT 1 CHECK (version > 0),
  request_id    uuid,
  request_hash  text,
  deleted       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (period_id, space_id) REFERENCES sl_periods(id, space_id),
  FOREIGN KEY (member_id, space_id) REFERENCES sl_members(id, space_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sl_payments_request_idx ON sl_payments (space_id, request_id) WHERE request_id IS NOT NULL;
```

### 12. `sl_activity` (Audit Trail)
```sql
CREATE TABLE IF NOT EXISTS sl_activity (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  space_id      uuid NOT NULL REFERENCES sl_spaces(id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name    text NOT NULL,
  action        text NOT NULL,
  entity        text NOT NULL,
  entity_id     uuid,
  before_values jsonb,
  after_values  jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sl_activity_space_idx ON sl_activity (space_id, id DESC);
```

### 13. `financial_requests` (Mutation Idempotency Ledger)
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

---

## 3. Split Algorithm & Mathematical Soundness
The allocation engine uses the **Largest Remainder Method** (`sharedLiving.calculations.js`):
1. Calculates base integer shares:
   $$\text{base\_share}_i = \left\lfloor \frac{\text{total\_amount} \times \text{weight}_i}{\sum \text{weights}} \right\rfloor$$
2. Calculates remainders for each member:
   $$\text{remainder}_i = (\text{total\_amount} \times \text{weight}_i) \pmod{\sum \text{weights}}$$
3. Distributes unallocated paisas one-by-one to members with the largest remainders, breaking ties deterministically by `member.id`.
4. Guarantees:
   $$\sum_{i} \text{amount\_minor}_i = \text{total\_amount\_minor}$$

---

## 4. API Endpoints

| Method | Path | Description | Roles |
|---|---|---|:---:|
| `GET` | `/api/shared-living/spaces` | List all spaces user belongs to | Any Member |
| `POST` | `/api/shared-living/spaces` | Create a new shared space | Authenticated User |
| `POST` | `/api/shared-living/join` | Join space via invite code | Authenticated User |
| `PATCH` | `/api/shared-living/spaces/:space` | Edit space details | Admin |
| `POST` | `/api/shared-living/spaces/:space/transfer-ownership` | Transfer space ownership | Space Owner |
| `DELETE` | `/api/shared-living/spaces/:space/membership` | Leave shared space | Any Member |
| `POST` | `/api/shared-living/spaces/:space/invite` | Rotate invite token | Admin |
| `GET` | `/api/shared-living/spaces/:space/months/:month` | Full month dashboard summary | Any Member |
| `PUT` | `/api/shared-living/spaces/:space/months/:month` | Update monthly budget or toggle lock/close | Admin |
| `POST` | `/api/shared-living/spaces/:space/months/:month/preview` | Preview split calculation without saving | Any Member |
| `POST` | `/api/shared-living/spaces/:space/months/:month/expenses` | Add shared expense | Admin |
| `POST` | `/api/shared-living/spaces/:space/months/:month/bills` | Add shared bill | Admin |
| `POST` | `/api/shared-living/spaces/:space/months/:month/payments` | Record member payment | Admin |
| `GET` | `/api/shared-living/spaces/:space/months/:month/bills/:id/receipt` | Download/view bill receipt image | Any Member |
