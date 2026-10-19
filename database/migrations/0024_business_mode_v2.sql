-- 0024_business_mode_v2.sql
-- HisabKi Kitab Business Mode V2 Schema Additions
-- Warehouses, Stock Transfers, Physical Stock Counts, Sales Returns, POS Shifts,
-- Employee Attendance, Payroll Breakdown Items, Budgets, and In-App Notifications.

-- 1. Warehouses & Stock Locations
CREATE TABLE IF NOT EXISTS biz_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 150),
  code text NOT NULL DEFAULT 'WH-01',
  address text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_warehouses_biz_idx ON biz_warehouses(business_id);

-- 2. Product Variants (Size, Color, etc.)
CREATE TABLE IF NOT EXISTS biz_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES biz_products(id) ON DELETE CASCADE,
  variant_name text NOT NULL CHECK (length(trim(variant_name)) BETWEEN 1 AND 100),
  sku text NOT NULL DEFAULT '',
  barcode text NOT NULL DEFAULT '',
  purchase_price_minor bigint NOT NULL DEFAULT 0 CHECK (purchase_price_minor >= 0),
  selling_price_minor bigint NOT NULL DEFAULT 0 CHECK (selling_price_minor >= 0),
  current_stock numeric(12,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_product_variants_prod_idx ON biz_product_variants(product_id);

-- 3. Multi-Branch Stock Transfers
CREATE TABLE IF NOT EXISTS biz_stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  from_branch_id uuid NOT NULL REFERENCES business_branches(id) ON DELETE RESTRICT,
  to_branch_id uuid NOT NULL REFERENCES business_branches(id) ON DELETE RESTRICT,
  transfer_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'in_transit', 'received', 'cancelled')),
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(business_id, transfer_number),
  CHECK(from_branch_id <> to_branch_id)
);
CREATE INDEX IF NOT EXISTS biz_stock_transfers_biz_idx ON biz_stock_transfers(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS biz_stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES biz_stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES biz_products(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS biz_stock_transfer_items_trans_idx ON biz_stock_transfer_items(transfer_id);

-- 4. Physical Stock Counts & Reconciliation
CREATE TABLE IF NOT EXISTS biz_stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  count_number text NOT NULL,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'reconciled', 'cancelled')),
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, count_number)
);
CREATE INDEX IF NOT EXISTS biz_stock_counts_biz_idx ON biz_stock_counts(business_id, date DESC);

CREATE TABLE IF NOT EXISTS biz_stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_count_id uuid NOT NULL REFERENCES biz_stock_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES biz_products(id) ON DELETE RESTRICT,
  expected_qty numeric(12,3) NOT NULL DEFAULT 0,
  counted_qty numeric(12,3) NOT NULL DEFAULT 0,
  variance_qty numeric(12,3) NOT NULL DEFAULT 0,
  unit_cost_minor bigint NOT NULL DEFAULT 0,
  adjustment_value_minor bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS biz_stock_count_items_count_idx ON biz_stock_count_items(stock_count_id);

-- 5. Sales Returns & Item Refunds
CREATE TABLE IF NOT EXISTS biz_sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  sale_id uuid NOT NULL REFERENCES biz_sales(id) ON DELETE RESTRICT,
  return_number text NOT NULL,
  customer_id uuid REFERENCES biz_customers(id) ON DELETE SET NULL,
  return_date date NOT NULL,
  total_refund_minor bigint NOT NULL DEFAULT 0 CHECK (total_refund_minor >= 0),
  refund_method text NOT NULL DEFAULT 'cash' CHECK (refund_method IN ('cash', 'bank', 'wallet', 'credit_adjustment')),
  refund_account_id uuid REFERENCES biz_accounts(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  restock boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, return_number)
);
CREATE INDEX IF NOT EXISTS biz_sales_returns_biz_date_idx ON biz_sales_returns(business_id, return_date DESC);

CREATE TABLE IF NOT EXISTS biz_sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES biz_sales_returns(id) ON DELETE CASCADE,
  sale_item_id uuid REFERENCES biz_sale_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES biz_products(id) ON DELETE SET NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  refund_amount_minor bigint NOT NULL CHECK (refund_amount_minor >= 0),
  condition text NOT NULL DEFAULT 'restockable' CHECK (condition IN ('restockable', 'damaged'))
);
CREATE INDEX IF NOT EXISTS biz_sales_return_items_ret_idx ON biz_sales_return_items(return_id);

-- 6. POS Cashier Shifts & Cash Drawer Reconciliation
CREATE TABLE IF NOT EXISTS biz_pos_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  cashier_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_cash_minor bigint NOT NULL DEFAULT 0 CHECK (opening_cash_minor >= 0),
  expected_cash_minor bigint NOT NULL DEFAULT 0,
  actual_cash_minor bigint NOT NULL DEFAULT 0 CHECK (actual_cash_minor >= 0),
  variance_minor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_pos_shifts_biz_status_idx ON biz_pos_shifts(business_id, status);

-- 7. Employee Attendance Tracking
CREATE TABLE IF NOT EXISTS biz_employee_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES biz_employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'leave', 'half_day')),
  check_in_time time,
  check_out_time time,
  hours_worked numeric(4,2) NOT NULL DEFAULT 8.00,
  overtime_hours numeric(4,2) NOT NULL DEFAULT 0.00,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, employee_id, date)
);
CREATE INDEX IF NOT EXISTS biz_employee_attendance_biz_date_idx ON biz_employee_attendance(business_id, date DESC);

-- 8. Itemized Payroll Breakdown
CREATE TABLE IF NOT EXISTS biz_payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES biz_payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES biz_employees(id) ON DELETE RESTRICT,
  base_salary_minor bigint NOT NULL DEFAULT 0 CHECK (base_salary_minor >= 0),
  allowances_minor bigint NOT NULL DEFAULT 0 CHECK (allowances_minor >= 0),
  deductions_minor bigint NOT NULL DEFAULT 0 CHECK (deductions_minor >= 0),
  advance_deducted_minor bigint NOT NULL DEFAULT 0 CHECK (advance_deducted_minor >= 0),
  net_payable_minor bigint NOT NULL DEFAULT 0 CHECK (net_payable_minor >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  UNIQUE(payroll_run_id, employee_id)
);
CREATE INDEX IF NOT EXISTS biz_payroll_items_run_idx ON biz_payroll_items(payroll_run_id);

-- 9. Business Budgets
CREATE TABLE IF NOT EXISTS biz_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  period_type text NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
  period varchar(7) NOT NULL, -- '2026-10' or '2026'
  category_account_id uuid REFERENCES biz_accounts(id) ON DELETE SET NULL,
  target_amount_minor bigint NOT NULL CHECK (target_amount_minor > 0),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_budgets_biz_period_idx ON biz_budgets(business_id, period);

-- 10. In-App Notifications
CREATE TABLE IF NOT EXISTS biz_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('low_stock', 'expiry', 'payment_overdue', 'supplier_due', 'shift_discrepancy', 'budget_exceeded', 'system')),
  title text NOT NULL,
  message text NOT NULL,
  link text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_notifications_biz_user_unread_idx ON biz_notifications(business_id, is_read, created_at DESC);
