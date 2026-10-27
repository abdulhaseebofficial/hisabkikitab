# Expenses Model Documentation

## 1. Overview
The **Expenses** model handles individual transactions, payment methods, recurring financial commitments, categorization, and query filtration across personal finance modes (`student` and `householder`).

---

## 2. Database Schema

### Table: `expenses`
```sql
CREATE TABLE IF NOT EXISTS expenses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  finance_mode        text NOT NULL DEFAULT 'student' CHECK (finance_mode IN ('student', 'householder')),
  amount              double precision NOT NULL CHECK (amount > 0),
  amount_minor        bigint NOT NULL,
  category            text NOT NULL,
  description         text NOT NULL DEFAULT '',
  payment_method      text NOT NULL DEFAULT 'Cash',
  date                timestamptz NOT NULL DEFAULT now(),
  is_recurring        boolean NOT NULL DEFAULT false,
  recurring_frequency text NOT NULL DEFAULT 'monthly' CHECK (recurring_frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_run_at         timestamptz,
  generated_from      uuid REFERENCES expenses(id) ON DELETE SET NULL,
  recurrence_occurrence boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Primary performance indexes
CREATE INDEX IF NOT EXISTS expenses_user_date_idx ON expenses (user_id, finance_mode, date DESC);
CREATE INDEX IF NOT EXISTS expenses_user_cat_date_idx ON expenses (user_id, finance_mode, category, date DESC);
CREATE INDEX IF NOT EXISTS expenses_due_idx ON expenses (next_run_at) WHERE is_recurring;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_generated_occurrence_key
  ON expenses (generated_from, date)
  WHERE recurrence_occurrence AND generated_from IS NOT NULL;
```

---

## 3. Monetary Representation: Double Precision to Minor Units
Initially, the app used `double precision` for amounts. To ensure absolute arithmetic precision:
- `0016_personal_money_minor_shadow.sql` introduced `amount_minor bigint` (amount $\times 100$).
- `sync_personal_money_minor()` trigger synchronizes legacy and minor values automatically.
- All internal aggregations and mathematical operations utilize integer arithmetic (`minorToApi`, `decimalToMinor`).

---

## 4. Payment Methods & Categorization

### Payment Methods
Stored in `packages/contracts/vocabulary.json`:
- `Cash` (Naqd)
- `JazzCash`
- `Easypaisa`
- `Bank Transfer` (Bank Transfer)
- `Card` (Credit/Debit Card)
- `Raast` (Instant digital payment)

### Mode Categorization
Expenses enforce categories based on the user's active `finance_mode`:
- **Student Mode**: `Mess/Food`, `Rent/Hostel Fee`, `Books & Stationery`, `Travel`, `Mobile/Internet`, `Entertainment`, `Health`, `Personal Care`, `student_shopping`, `student_family`, `student_savings`, `student_emergency`, `Misc`.
- **Householder Mode**: `groceries`, `house_rent`, `electricity_bill`, `gas_bill`, `water_bill`, `internet`, `mobile`, `maintenance`, `domestic_help`, `transport_fuel`, `school_fees`, `healthcare`, `children`, `family_support`, `clothing`, `personal_care`, `dining_out`, `entertainment`, `insurance`, `loan_installment`, `charity_zakat`, `savings`, `emergency`, `guests_events`, `other`.

---

## 5. Recurring Expenses Engine

### How Recurring Expenses Work:
1. When a user marks an expense as recurring (e.g. Mess Fee or House Rent), `is_recurring = true` and `next_run_at` is computed.
2. A background scheduler (`scripts/recurring-scheduler.js` or cron worker) sweeps rows where `is_recurring = true AND next_run_at <= now()`.
3. For each due item, a new expense row is created with:
   - `generated_from` pointing to the template row ID.
   - `date = next_run_at`.
   - `is_recurring = false` (child transactions are normal expenses).
4. The template's `next_run_at` advances according to `recurring_frequency`.
5. Idempotency guarantees (`0015_recurring_occurrence_idempotency.sql`) prevent duplicate runs even if the worker restarts.

---

## 6. Query Filtration & Repository Architecture

Implemented in `apps/api/src/modules/expenses/expenses.repository.js`:

```javascript
const buildWhere = (userId, financeMode, q = {}) => {
  const clauses = ['user_id = $1', 'finance_mode = $2'];
  const values = [userId, financeMode];
  // Filters for: from, to, category, paymentMethod, minAmount, maxAmount, search, isRecurring
};
```
Every query strictly scopes results by `user_id` and `finance_mode`.

---

## 7. API Endpoints

| Method | Path | Description | Protected |
|---|---|---|:---:|
| `GET` | `/api/expenses` | Get filtered list of expenses (with pagination & totals) | Yes |
| `POST` | `/api/expenses` | Create a new expense | Yes |
| `GET` | `/api/expenses/:id` | Get expense details by ID | Yes |
| `PATCH` | `/api/expenses/:id` | Update an existing expense | Yes |
| `DELETE` | `/api/expenses/:id` | Delete an expense | Yes |
| `GET` | `/api/expenses/summary` | Get monthly spending breakdown and category totals | Yes |
