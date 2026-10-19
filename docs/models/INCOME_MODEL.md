# Income Model Documentation

## 1. Overview
The **Income** model records individual inflows of money across personal finance modes (`student` and `householder`). It complements the user's estimated baseline monthly income (`users.monthly_income`) by providing a verifiable transaction ledger of actual funds received.

---

## 2. Database Schema

### Table: `income`
```sql
CREATE TABLE IF NOT EXISTS income (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  finance_mode  text NOT NULL DEFAULT 'student' CHECK (finance_mode IN ('student', 'householder')),
  amount        double precision NOT NULL CHECK (amount > 0),
  amount_minor  bigint NOT NULL,
  source        text NOT NULL DEFAULT 'Pocket Money',
  note          text NOT NULL DEFAULT '',
  date          timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS income_user_date_idx ON income (user_id, finance_mode, date DESC);
```

---

## 3. Monetary Integrity & Minor Units
- Stores exact paisa/cents values in `amount_minor bigint` ($amount \times 100$).
- Synced automatically with `amount` via database triggers (`sync_personal_money_minor()`).
- Prevents floating-point precision loss during multi-source aggregations.

---

## 4. Income Sources by Mode

The contract catalogue defines allowed sources according to active mode:

### Student Mode Sources:
- `Pocket Money` (Jeb Kharch) — Monthly or ad-hoc support sent by parents.
- `Part-time Job` (Part-time Kaam) — Teaching, campus jobs, evening shifts.
- `Scholarship` (Wazifa) — Merit or need-based university stipends.
- `Freelance` (Freelance) — Coding, design, writing, assignments.
- `Gift` (Tohfa) — Eidi, birthday money, relative gifts.
- `Other` (Deegar) — Miscellaneous income (requires note).

### Householder Mode Sources:
- `salary` (Tankhwah) — Primary employment salary.
- `business_income` (Karobar Ki Aamdani) — Retail, shop, trade profits.
- `freelance_income` (Freelance Aamdani) — Independent contracting/consulting.
- `rental_income` (Kiraya Aamdani) — Property, room, or commercial rents collected.
- `investments` (Sarmayakari Munafa) — Dividends, profits, prize bond winnings.
- `pension` (Pension) — Retirement or government pensions.
- `family_contribution` (Ghar Walon Ka Hissa) — Spousal or children contributions to the household pot.
- `other` (Deegar) — Unclassified income (requires note).

---

## 5. Interaction with User Monthly Income & Budgets
- On registration/onboarding, users declare an anticipated `monthly_income`.
- When actual `income` records are logged, dashboard calculations compare **Actual Inflows vs Anticipated Inflows**:
  $$\text{Realized Inflow} = \sum \text{income.amount (current month)}$$
  $$\text{Effective Income} = \begin{cases} \text{Realized Inflow} & \text{if Realized Inflow} > 0 \\ \text{users.monthly_income} & \text{otherwise} \end{cases}$$
- This dynamic fallback ensures that students who receive irregular pocket money always see meaningful dashboard health metrics.

---

## 6. API Endpoints

| Method | Path | Description | Protected |
|---|---|---|:---:|
| `GET` | `/api/income` | List all income entries for the current mode | Yes |
| `POST` | `/api/income` | Log a new income receipt | Yes |
| `GET` | `/api/income/:id` | Get details of a single income entry | Yes |
| `PATCH` | `/api/income/:id` | Update an income entry | Yes |
| `DELETE` | `/api/income/:id` | Delete an income entry | Yes |
