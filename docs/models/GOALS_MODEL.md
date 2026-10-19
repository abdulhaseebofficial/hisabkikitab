# Goals & Contributions Model Documentation

## 1. Overview
The **Goals** model powers savings milestones (e.g. "Save for a laptop", "Eid clothes fund", "Emergency reserve"). It features an auditable contribution ledger, progress metrics, target pacing calculations, and automated completion state management.

---

## 2. Database Schema

### Table: `goals`
```sql
CREATE TABLE IF NOT EXISTS goals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                text NOT NULL,
  target_amount        double precision NOT NULL CHECK (target_amount >= 1),
  target_amount_minor  bigint NOT NULL,
  saved_amount         double precision NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
  saved_amount_minor   bigint NOT NULL DEFAULT 0,
  deadline             timestamptz,
  icon                 text NOT NULL,
  note                 text NOT NULL DEFAULT '',
  is_completed         boolean NOT NULL DEFAULT false,
  completed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goals_user_open_idx ON goals (user_id, is_completed, deadline);
```

### Table: `goal_contributions` (Ledger)
```sql
CREATE TABLE IF NOT EXISTS goal_contributions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id       uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount        double precision NOT NULL,
  amount_minor  bigint NOT NULL,
  note          text NOT NULL DEFAULT '',
  date          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goal_contributions_goal_idx ON goal_contributions (goal_id, date);
```

---

## 3. Key Design Decisions

### 1. Mode-Agnostic Design Rationale
Goals are deliberately **NOT** partitioned by `finance_mode`:
- A savings goal belongs to the human being, not to a hostel room or a kitchen budget.
- If a student switches to householder mode or vice-versa, their savings journey (e.g. saving for a motorcycle or professional certification) remains intact.

### 2. Auditable Ledger Pattern
Instead of directly overwriting `saved_amount`, deposits and withdrawals are recorded in `goal_contributions`:
- Adding money: positive `amount_minor`.
- Withdrawing money: negative `amount_minor`.
- Inside an ACID transaction, `saved_amount_minor = sum(contributions)`.

### 3. Automated Completion Invariant
Whenever a contribution occurs:
$$\text{is\_completed} = (\text{saved\_amount\_minor} \ge \text{target\_amount\_minor})$$
- If completed, `completed_at` is set to `now()`.
- If a withdrawal brings `saved_amount_minor` back below target, `is_completed` reverts to `false` and `completed_at` is set to `NULL`.

---

## 4. Savings Pacing & Math

When a deadline is provided, the system computes target savings pacing:

$$\text{Days Remaining} = \max\left(1, \left\lceil \frac{\text{deadline} - \text{today}}{86,400,000} \right\rceil\right)$$
$$\text{Remaining Needed} = \max(0, \text{target\_amount} - \text{saved\_amount})$$
$$\text{Daily Pacing Target} = \frac{\text{Remaining Needed}}{\text{Days Remaining}}$$
$$\text{Weekly Pacing Target} = \text{Daily Pacing Target} \times 7$$

---

## 5. API Endpoints

| Method | Path | Description | Protected |
|---|---|---|:---:|
| `GET` | `/api/goals` | List all goals (with optional status filter `active` or `completed`) | Yes |
| `POST` | `/api/goals` | Create a new savings goal | Yes |
| `GET` | `/api/goals/:id` | Get goal details with embedded contribution history | Yes |
| `PATCH` | `/api/goals/:id` | Update goal title, deadline, target amount, or icon | Yes |
| `DELETE` | `/api/goals/:id` | Delete goal and all associated ledger entries | Yes |
| `POST` | `/api/goals/:id/contribute` | Add money to goal (deposit) | Yes |
| `POST` | `/api/goals/:id/withdraw` | Withdraw money from goal | Yes |
