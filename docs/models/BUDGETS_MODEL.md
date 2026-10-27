# Budgets Model Documentation

## 1. Overview
The **Budgets** model enables users to establish monthly category spending limits. It computes real-time budget utilization, issues proactive threshold warnings, and supports one-click AI budget plan application.

---

## 2. Database Schema

### Table: `budgets`
```sql
CREATE TABLE IF NOT EXISTS budgets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  finance_mode  text NOT NULL DEFAULT 'student' CHECK (finance_mode IN ('student', 'householder')),
  category      text NOT NULL,
  "limit"       double precision NOT NULL CHECK ("limit" >= 0),
  limit_minor   bigint NOT NULL,
  month         integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year          integer NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Guarantees exactly one limit per category per month per mode
CREATE UNIQUE INDEX IF NOT EXISTS budgets_unique_idx
  ON budgets (user_id, finance_mode, year, month, category);
```

---

## 3. Atomic Upserts & AI Plan Application
- When a user modifies a category budget, the repository performs an atomic upsert:
  ```sql
  INSERT INTO budgets (user_id, finance_mode, category, "limit", limit_minor, month, year)
  VALUES ($1, $6, $2, 0, $3, $4, $5)
  ON CONFLICT (user_id, finance_mode, year, month, category)
    DO UPDATE SET limit_minor = EXCLUDED.limit_minor, updated_at = now()
  ```
- **Batch Application (`upsertMany`)**: When the user accepts the AI Advisor’s suggested monthly budget, an atomic multi-row `INSERT ... ON CONFLICT DO UPDATE` applies all proposed category limits in a single SQL round-trip.

---

## 4. Status Thresholds & Color Codes

Budget progress is calculated against current month expenses in that category:

$$\text{Utilization} = \frac{\sum \text{Expenses in Category}}{\text{Budget Limit}} \times 100\%$$

| Threshold | Status | Visual Indicator | System Action |
|---|---|---|---|
| $< 80\%$ | `on_track` | 🟢 Green | Normal spending pace |
| $80\% - 99.9\%$ | `warning` | 🟡 Amber | Generates `overspendWarning` in-app notification |
| $\ge 100\%$ | `exceeded` | 🔴 Red | Generates `overspendOver` critical alert |

---

## 5. Mode Behavior
- In **Student Mode**: Budgets track student categories (e.g., Mess/Food limit of PKR 8,000, Books & Stationery limit of PKR 2,000).
- In **Householder Mode**: Budgets track household categories (e.g., Groceries limit of PKR 35,000, Electricity limit of PKR 25,000).
- **Mode Isolation**: Setting a budget in Student Mode does not collide with Householder Mode even for the same month/year due to the composite unique index containing `finance_mode`.

---

## 6. API Endpoints

| Method | Path | Description | Protected |
|---|---|---|:---:|
| `GET` | `/api/budget` | List all category budgets and progress for the current/selected month | Yes |
| `POST` | `/api/budget` | Set or update a single category budget limit | Yes |
| `POST` | `/api/budget/plan` | Apply an entire AI-suggested budget plan in one request | Yes |
| `DELETE` | `/api/budget/:id` | Remove a category budget limit | Yes |
| `GET` | `/api/budget/summary` | Aggregate total planned budget vs total spent | Yes |
