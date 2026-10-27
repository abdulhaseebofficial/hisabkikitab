-- 0027_v3_recurring_business_expenses.sql
-- HisabKi Kitab Business Mode V3: Recurring Business Expenses Subsystem
-- Dedicated tables for business recurring expense schedules, period occurrences,
-- automated bill generation, double-entry expense accruals, and demo write protection.

-- ============================================================================
-- 1. RECURRING BUSINESS EXPENSES (TEMPLATES & SCHEDULES)
-- ============================================================================
CREATE TABLE IF NOT EXISTS biz_recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES biz_suppliers(id) ON DELETE SET NULL,
  category_account_id uuid NOT NULL REFERENCES biz_accounts(id) ON DELETE RESTRICT,
  payment_account_id uuid REFERENCES biz_accounts(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  category text NOT NULL,
  vendor text NOT NULL DEFAULT '',
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  interval_count integer NOT NULL DEFAULT 1 CHECK (interval_count >= 1),
  start_date date NOT NULL,
  end_date date,
  next_due_date date NOT NULL,
  due_days_after integer NOT NULL DEFAULT 0 CHECK (due_days_after >= 0),
  auto_pay boolean NOT NULL DEFAULT false,
  payment_method text NOT NULL DEFAULT 'unpaid' CHECK (payment_method IN ('cash', 'bank', 'wallet', 'unpaid')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'completed')),
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS biz_recurring_expenses_biz_idx ON biz_recurring_expenses(business_id, status, next_due_date);
CREATE INDEX IF NOT EXISTS biz_recurring_expenses_supplier_idx ON biz_recurring_expenses(business_id, supplier_id);

-- ============================================================================
-- 2. RECURRING BUSINESS EXPENSE OCCURRENCES (GENERATED BILL HISTORY)
-- ============================================================================
CREATE TABLE IF NOT EXISTS biz_recurring_expense_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  recurring_expense_id uuid NOT NULL REFERENCES biz_recurring_expenses(id) ON DELETE CASCADE,
  expense_id uuid REFERENCES biz_expenses(id) ON DELETE SET NULL,
  period_key text NOT NULL, -- e.g. '2026-10', '2026-W42', '2026-Q4'
  occurrence_date date NOT NULL,
  due_date date NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'paid', 'skipped', 'failed')),
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, recurring_expense_id, period_key)
);

CREATE INDEX IF NOT EXISTS biz_recurring_occurrences_biz_idx ON biz_recurring_expense_occurrences(business_id, occurrence_date DESC);
CREATE INDEX IF NOT EXISTS biz_recurring_occurrences_expense_idx ON biz_recurring_expense_occurrences(recurring_expense_id);

-- ============================================================================
-- 3. DEMO WRITE PROTECTION TRIGGERS
-- ============================================================================
DROP TRIGGER IF EXISTS biz_recurring_expenses_demo_guard ON biz_recurring_expenses;
CREATE TRIGGER biz_recurring_expenses_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_write();

DROP TRIGGER IF EXISTS biz_recurring_expense_occurrences_demo_guard ON biz_recurring_expense_occurrences;
CREATE TRIGGER biz_recurring_expense_occurrences_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_recurring_expense_occurrences
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('recurring_expense_id', 'biz_recurring_expenses');
