# Demo Mode (ڈیمو موڈ / Read-Only Demonstration Mode)

## 1. Overview & Purpose
**Demo Mode** allows prospective users, evaluators, and visitors to experience **Hisabki Kitab** with realistic pre-populated data across all three financial modes (Student, Householder, and Shared Living) without needing to register or enter real financial information.

To guarantee that the demo environment remains pristine and cannot be vandalized, corrupted, or altered by visitors, Demo Mode enforces strict, multi-layered **read-only guarantees** spanning from the frontend UI all the way to database-level PostgreSQL triggers.

---

## 2. Multi-Layered Defense-in-Depth Architecture

```
Layer 1: Frontend UI
  - Disables action buttons (Quick Add, Feedback, Save, Delete)
  - Shows persistent "Demo Mode (Read-Only)" top banner
  - Provides instant mode-switcher between Student, Householder, and Shared Living
        ↓
Layer 2: Express API Middleware
  - Rejects any non-GET request originating from demo identity
  - Returns HTTP 403 Forbidden with key 'demo.readOnly'
        ↓
Layer 3: PostgreSQL Database Triggers
  - Defense in depth: Rejects INSERT, UPDATE, or DELETE on any demo-owned row
  - Raises SQL EXCEPTION 'Demo Mode is read-only' (SQLSTATE 42501)
```

---

## 3. Database Schema & Triggers (`0022_read_only_demo.sql`)

### Flag on `users`:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Exactly one demo user can exist
CREATE UNIQUE INDEX IF NOT EXISTS users_single_demo_idx
  ON users (is_demo)
  WHERE is_demo;
```

### PostgreSQL Guard Triggers:
1. **`hkk_reject_demo_user_write()`**:
   - Attached to: `expenses`, `income`, `budgets`, `debts`, `goals`, `notifications`, `feedback`.
   - Prevents inserting, updating, or deleting any row belonging to a user with `is_demo = true`.
2. **`hkk_reject_demo_goal_contribution()`**:
   - Attached to: `goal_contributions`.
   - Inspects the parent goal's user; rejects writes if `user.is_demo = true`.
3. **`hkk_reject_demo_space_write()`**:
   - Attached to: `sl_spaces`, `sl_memberships`, `sl_invites`, `sl_periods`, `sl_members`, `sl_categories`.
   - Rejects space-level alterations if space belongs to the demo user.
4. **`hkk_reject_demo_financial()`**:
   - Attached to: `sl_expenses`, `sl_bills`, `sl_shares`, `sl_payments`, `sl_receipts`.
   - Rejects financial entries on demo-owned shared spaces.

```sql
CREATE OR REPLACE FUNCTION hkk_reject_demo_user_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_owner_id uuid;
  new_owner_id uuid;
BEGIN
  old_owner_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE NULLIF(to_jsonb(OLD) ->> TG_ARGV[0], '')::uuid END;
  new_owner_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NULLIF(to_jsonb(NEW) ->> TG_ARGV[0], '')::uuid END;
  IF EXISTS (
    SELECT 1 FROM users WHERE id IN (old_owner_id, new_owner_id) AND is_demo
  ) THEN
    RAISE EXCEPTION 'Demo Mode is read-only' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
```

---

## 4. Pre-Populated Demonstration Data (`database/seeds/demo-readonly.js`)

The demo seed generates a complete, realistic financial life in Pakistan:
- **Student Data**:
  - Pocket money: PKR 25,000.
  - Mess bill: PKR 9,500.
  - Canteen chai, samosas, Daewoo bus ticket to Lahore, Indrive rides, Zong monthly package, university photocopy expenses.
  - Active savings goal: "Laptop Fund" (PKR 45,000 / PKR 80,000 saved).
  - Udhaar: PKR 1,500 lent to roommate "Hamza", PKR 800 borrowed from "Canteen Chacha".
- **Householder Data**:
  - Monthly income: PKR 120,000.
  - Utility bills: Electricity (PKR 18,500), Sui Gas (PKR 3,200), PTCL Fiber (PKR 3,500).
  - Monthly rashan at Imtiaz Super Market (PKR 32,000).
  - School fees and children's van fare.
  - Committee installment: PKR 15,000.
- **Shared Living Data**:
  - Space: "Flat 304, Askari 11".
  - 4 roommates (Ali, Bilal, Usman, Farhan).
  - Current month grocery run split equally.
  - K-Electric bill split by room weights.
  - Member payment ledger and net balance sheet.

---

## 5. UI Presentation & Behavior
- **Banner**: Persistent informational banner informing the user that they are in demo mode.
- **Instant Switcher**: Buttons allowing the visitor to toggle between `student`, `householder`, and `shared_living` instantly without logging out.
- **Action Suppressions**:
  - The floating `+` Quick Add expense button is hidden or disabled.
  - The feedback submission modal is read-only.
  - Account deletion and data export are protected.
