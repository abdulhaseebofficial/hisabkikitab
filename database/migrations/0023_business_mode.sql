-- 0023_business_mode.sql
-- Complete, production-grade Small Business Management Mode for HisabKi Kitab.
-- Supports multi-business, multi-branch, double-entry accounting engine,
-- inventory valuation, customer & supplier khata, POS sales, purchases, and payroll.

-- 1. Businesses
CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 150),
  category text NOT NULL DEFAULT 'general',
  business_type text NOT NULL DEFAULT 'retail',
  description text NOT NULL DEFAULT '',
  currency varchar(3) NOT NULL DEFAULT 'PKR' CHECK (currency IN ('PKR', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR')),
  contact_number text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'PK',
  tax_id text NOT NULL DEFAULT '',
  financial_year_start varchar(5) NOT NULL DEFAULT '07-01',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS businesses_owner_idx ON businesses(owner_id);

-- 2. Business Settings
CREATE TABLE IF NOT EXISTS business_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enable_inventory boolean NOT NULL DEFAULT true,
  enable_pos boolean NOT NULL DEFAULT true,
  enable_purchases boolean NOT NULL DEFAULT true,
  enable_customer_khata boolean NOT NULL DEFAULT true,
  enable_supplier_khata boolean NOT NULL DEFAULT true,
  enable_payroll boolean NOT NULL DEFAULT true,
  enable_tax boolean NOT NULL DEFAULT false,
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100),
  invoice_prefix text NOT NULL DEFAULT 'INV-',
  invoice_next_number integer NOT NULL DEFAULT 1 CHECK (invoice_next_number >= 1),
  invoice_footer_note text NOT NULL DEFAULT 'Thank you for your business!',
  costing_method text NOT NULL DEFAULT 'weighted_average' CHECK (costing_method IN ('weighted_average', 'fifo')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Business Members & Roles
CREATE TABLE IF NOT EXISTS business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'accountant', 'cashier', 'inventory_manager', 'employee')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, user_id)
);
CREATE INDEX IF NOT EXISTS business_members_user_idx ON business_members(user_id);
CREATE INDEX IF NOT EXISTS business_members_biz_idx ON business_members(business_id);

-- 4. Business Branches
CREATE TABLE IF NOT EXISTS business_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  code text NOT NULL DEFAULT 'MAIN',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_branches_biz_idx ON business_branches(business_id);

-- 5. Chart of Accounts & Financial Accounts (Assets, Liabilities, Equity, Revenue, Expense)
CREATE TABLE IF NOT EXISTS biz_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  subtype text NOT NULL, -- 'cash', 'bank', 'wallet', 'receivable', 'payable', 'inventory', 'cogs', 'operating_expense', 'owner_equity', 'owner_drawing', 'tax_payable', 'sales_revenue'
  currency varchar(3) NOT NULL DEFAULT 'PKR',
  balance_minor bigint NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, code)
);
CREATE INDEX IF NOT EXISTS biz_accounts_biz_type_idx ON biz_accounts(business_id, type);

-- 6. General Ledger: Journal Entries & Lines (Double-Entry Engine)
CREATE TABLE IF NOT EXISTS biz_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  entry_number text NOT NULL,
  date date NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('sale', 'purchase', 'expense', 'payment', 'transfer', 'adjustment', 'opening', 'payroll', 'return')),
  reference_type text, -- 'sale', 'purchase', 'expense', 'payment', etc.
  reference_id uuid,
  narration text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_journal_entries_biz_date_idx ON biz_journal_entries(business_id, date DESC);

CREATE TABLE IF NOT EXISTS biz_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES biz_journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES biz_accounts(id) ON DELETE RESTRICT,
  debit_minor bigint NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor bigint NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  description text NOT NULL DEFAULT '',
  CHECK (debit_minor > 0 OR credit_minor > 0)
);
CREATE INDEX IF NOT EXISTS biz_journal_lines_entry_idx ON biz_journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS biz_journal_lines_account_idx ON biz_journal_lines(account_id);

-- 7. Customers (Accounts Receivable Khata)
CREATE TABLE IF NOT EXISTS biz_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 150),
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  credit_limit_minor bigint NOT NULL DEFAULT 0 CHECK (credit_limit_minor >= 0),
  opening_balance_minor bigint NOT NULL DEFAULT 0,
  current_balance_minor bigint NOT NULL DEFAULT 0, -- positive = customer owes us money (receivable)
  notes text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_customers_biz_idx ON biz_customers(business_id, is_active);

-- 8. Suppliers (Accounts Payable Khata)
CREATE TABLE IF NOT EXISTS biz_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 150),
  company_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  opening_balance_minor bigint NOT NULL DEFAULT 0,
  current_balance_minor bigint NOT NULL DEFAULT 0, -- positive = we owe supplier money (payable)
  notes text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_suppliers_biz_idx ON biz_suppliers(business_id, is_active);

-- 9. Product Categories & Products (Inventory)
CREATE TABLE IF NOT EXISTS biz_product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, name)
);

CREATE TABLE IF NOT EXISTS biz_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id uuid REFERENCES biz_product_categories(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  sku text NOT NULL DEFAULT '',
  barcode text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'pcs',
  purchase_price_minor bigint NOT NULL DEFAULT 0 CHECK (purchase_price_minor >= 0),
  selling_price_minor bigint NOT NULL DEFAULT 0 CHECK (selling_price_minor >= 0),
  wholesale_price_minor bigint NOT NULL DEFAULT 0 CHECK (wholesale_price_minor >= 0),
  current_stock numeric(12,3) NOT NULL DEFAULT 0,
  min_stock_alert numeric(12,3) NOT NULL DEFAULT 5,
  inventory_valuation_minor bigint NOT NULL DEFAULT 0 CHECK (inventory_valuation_minor >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_products_biz_active_idx ON biz_products(business_id, is_active);
CREATE INDEX IF NOT EXISTS biz_products_barcode_idx ON biz_products(business_id, barcode) WHERE barcode <> '';

-- 10. Stock Movements (Inventory Ledger)
CREATE TABLE IF NOT EXISTS biz_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES biz_products(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('opening', 'sale', 'purchase', 'return_in', 'return_out', 'adjustment_add', 'adjustment_sub', 'damage')),
  quantity numeric(12,3) NOT NULL,
  unit_cost_minor bigint NOT NULL DEFAULT 0,
  total_cost_minor bigint NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_stock_movements_product_idx ON biz_stock_movements(product_id, created_at DESC);

-- 11. Sales & POS
CREATE TABLE IF NOT EXISTS biz_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  sale_number text NOT NULL,
  customer_id uuid REFERENCES biz_customers(id) ON DELETE SET NULL,
  date date NOT NULL,
  subtotal_minor bigint NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_amount_minor bigint NOT NULL DEFAULT 0 CHECK (total_amount_minor >= 0),
  amount_paid_minor bigint NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  balance_due_minor bigint NOT NULL DEFAULT 0 CHECK (balance_due_minor >= 0),
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank', 'wallet', 'credit', 'split')),
  payment_account_id uuid REFERENCES biz_accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'held', 'completed', 'cancelled', 'returned')),
  is_pos boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, sale_number)
);
CREATE INDEX IF NOT EXISTS biz_sales_biz_date_idx ON biz_sales(business_id, date DESC);

CREATE TABLE IF NOT EXISTS biz_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES biz_sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES biz_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  unit_cost_minor bigint NOT NULL DEFAULT 0 CHECK (unit_cost_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0)
);
CREATE INDEX IF NOT EXISTS biz_sale_items_sale_idx ON biz_sale_items(sale_id);

-- 12. Purchases & Procurement
CREATE TABLE IF NOT EXISTS biz_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  purchase_number text NOT NULL,
  supplier_id uuid REFERENCES biz_suppliers(id) ON DELETE SET NULL,
  date date NOT NULL,
  total_amount_minor bigint NOT NULL DEFAULT 0 CHECK (total_amount_minor >= 0),
  amount_paid_minor bigint NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  balance_due_minor bigint NOT NULL DEFAULT 0 CHECK (balance_due_minor >= 0),
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank', 'wallet', 'credit')),
  payment_account_id uuid REFERENCES biz_accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('order', 'received', 'completed', 'cancelled')),
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, purchase_number)
);
CREATE INDEX IF NOT EXISTS biz_purchases_biz_date_idx ON biz_purchases(business_id, date DESC);

CREATE TABLE IF NOT EXISTS biz_purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES biz_purchases(id) ON DELETE CASCADE,
  product_id uuid REFERENCES biz_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0)
);
CREATE INDEX IF NOT EXISTS biz_purchase_items_purchase_idx ON biz_purchase_items(purchase_id);

-- 13. Business Expenses
CREATE TABLE IF NOT EXISTS biz_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  category_account_id uuid REFERENCES biz_accounts(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  category text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  date date NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank', 'wallet', 'unpaid')),
  payment_account_id uuid REFERENCES biz_accounts(id) ON DELETE SET NULL,
  paid_amount_minor bigint NOT NULL DEFAULT 0 CHECK (paid_amount_minor >= 0),
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'unpaid', 'partial')),
  vendor text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_expenses_biz_date_idx ON biz_expenses(business_id, date DESC);

-- 14. Business Payments (Khata Settlements, Transfers, Owner Equity & Drawings)
CREATE TABLE IF NOT EXISTS biz_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  payment_type text NOT NULL CHECK (payment_type IN ('customer_payment', 'supplier_payment', 'account_transfer', 'owner_contribution', 'owner_drawing')),
  date date NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  customer_id uuid REFERENCES biz_customers(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES biz_suppliers(id) ON DELETE SET NULL,
  from_account_id uuid REFERENCES biz_accounts(id) ON DELETE RESTRICT,
  to_account_id uuid REFERENCES biz_accounts(id) ON DELETE RESTRICT,
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_payments_biz_date_idx ON biz_payments(business_id, date DESC);

-- 15. Employees & Payroll
CREATE TABLE IF NOT EXISTS biz_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 150),
  phone text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT '',
  salary_minor bigint NOT NULL DEFAULT 0 CHECK (salary_minor >= 0),
  joining_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_employees_biz_idx ON biz_employees(business_id, status);

CREATE TABLE IF NOT EXISTS biz_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  month varchar(7) NOT NULL, -- e.g. '2026-10'
  total_salary_minor bigint NOT NULL DEFAULT 0 CHECK (total_salary_minor >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  paid_from_account_id uuid REFERENCES biz_accounts(id) ON DELETE SET NULL,
  payment_date date,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, month)
);

-- 16. Business Audit Logs
CREATE TABLE IF NOT EXISTS biz_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_audit_logs_biz_idx ON biz_audit_logs(business_id, created_at DESC);
