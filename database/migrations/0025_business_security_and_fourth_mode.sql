-- 0025_business_security_and_fourth_mode.sql
-- HisabKi Kitab: Production Hardening, Demo Write Protection,
-- General Ledger Immutability, Idempotency Table, and 4th Mode Registration.

-- ============================================================================
-- 1. FOURTH OPERATIONAL FINANCE MODE REGISTRATION
-- ============================================================================
-- Expand users.finance_mode check constraint to include 'business' alongside
-- 'student', 'householder', and 'shared_living'.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_finance_mode_check;
ALTER TABLE users ADD CONSTRAINT users_finance_mode_check
  CHECK (finance_mode IN ('student', 'householder', 'shared_living', 'business'));

-- ============================================================================
-- 2. BUSINESS IDEMPOTENCY PERSISTENCE
-- ============================================================================
-- Scoped to business_id and request_id to prevent double-posting,
-- record request fingerprints, and safely replay authoritative mutation results.
CREATE TABLE IF NOT EXISTS biz_financial_requests (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  action text NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, request_id)
);
CREATE INDEX IF NOT EXISTS biz_financial_requests_user_idx ON biz_financial_requests(user_id);

-- ============================================================================
-- 3. GENERAL LEDGER IMMUTABILITY & AUDIT PROTECTION
-- ============================================================================
-- Double-entry accounting invariants: Posted general ledger journal entries
-- and their line items must NEVER be deleted. Financial corrections must be
-- executed strictly through reversing entries or adjustment journals.
CREATE OR REPLACE FUNCTION hkk_protect_journal_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'General ledger entries and lines are immutable and cannot be deleted. Use a reversing entry.'
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'biz_journal_lines' THEN
      IF (OLD.account_id <> NEW.account_id OR OLD.debit_minor <> NEW.debit_minor OR OLD.credit_minor <> NEW.credit_minor) THEN
        RAISE EXCEPTION 'Journal line amounts and accounts are immutable.' USING ERRCODE = '42501';
      END IF;
    ELSIF TG_TABLE_NAME = 'biz_journal_entries' THEN
      IF (OLD.business_id <> NEW.business_id OR OLD.date <> NEW.date OR OLD.entry_type <> NEW.entry_type OR OLD.entry_number <> NEW.entry_number) THEN
        RAISE EXCEPTION 'Journal entry core financial fields are immutable.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS biz_journal_entries_immutability ON biz_journal_entries;
CREATE TRIGGER biz_journal_entries_immutability
  BEFORE UPDATE OR DELETE ON biz_journal_entries
  FOR EACH ROW EXECUTE FUNCTION hkk_protect_journal_immutability();

DROP TRIGGER IF EXISTS biz_journal_lines_immutability ON biz_journal_lines;
CREATE TRIGGER biz_journal_lines_immutability
  BEFORE UPDATE OR DELETE ON biz_journal_lines
  FOR EACH ROW EXECUTE FUNCTION hkk_protect_journal_immutability();

-- Enforce partial unique source document posting constraints
CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_journal_sale ON biz_journal_entries (business_id, reference_id) WHERE reference_type = 'sale';
CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_journal_purchase ON biz_journal_entries (business_id, reference_id) WHERE reference_type = 'purchase';
CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_journal_sales_return ON biz_journal_entries (business_id, reference_id) WHERE reference_type = 'sales_return';
CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_journal_expense ON biz_journal_entries (business_id, reference_id) WHERE reference_type = 'expense';
CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_journal_payment ON biz_journal_entries (business_id, reference_id) WHERE reference_type = 'payment';
CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_journal_payroll ON biz_journal_entries (business_id, reference_id) WHERE reference_type = 'payroll';

-- ============================================================================
-- 4. DEMO ACCOUNT WRITE PROTECTION (DEFENSE IN DEPTH)
-- ============================================================================
-- A demo user identity is read-only. API middleware rejects demo writes, and
-- these triggers enforce that no repository, worker or direct SQL write touches
-- a demo-owned business or demo-linked financial record.

-- 4.1 Trigger function for tables with direct business_id foreign key
CREATE OR REPLACE FUNCTION hkk_reject_demo_business_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_biz uuid;
  new_biz uuid;
BEGIN
  old_biz := CASE WHEN TG_OP = 'INSERT' THEN NULL
    ELSE NULLIF(to_jsonb(OLD) ->> 'business_id', '')::uuid END;
  new_biz := CASE WHEN TG_OP = 'DELETE' THEN NULL
    ELSE NULLIF(to_jsonb(NEW) ->> 'business_id', '')::uuid END;
  IF EXISTS (
    SELECT 1 FROM businesses b JOIN users u ON u.id = b.owner_id
    WHERE b.id IN (old_biz, new_biz) AND u.is_demo
  ) THEN
    RAISE EXCEPTION 'Demo Mode is read-only' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- 4.2 Helper function for child tables referencing parent without direct business_id
CREATE OR REPLACE FUNCTION hkk_reject_demo_business_child_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_col text := TG_ARGV[0];
  parent_tab text := TG_ARGV[1];
  old_pid uuid;
  new_pid uuid;
  biz_id uuid;
BEGIN
  old_pid := CASE WHEN TG_OP = 'INSERT' THEN NULL
    ELSE NULLIF(to_jsonb(OLD) ->> parent_col, '')::uuid END;
  new_pid := CASE WHEN TG_OP = 'DELETE' THEN NULL
    ELSE NULLIF(to_jsonb(NEW) ->> parent_col, '')::uuid END;

  IF new_pid IS NOT NULL THEN
    EXECUTE format('SELECT business_id FROM %I WHERE id = $1', parent_tab) INTO biz_id USING new_pid;
  ELSIF old_pid IS NOT NULL THEN
    EXECUTE format('SELECT business_id FROM %I WHERE id = $1', parent_tab) INTO biz_id USING old_pid;
  END IF;

  IF biz_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM businesses b JOIN users u ON u.id = b.owner_id
    WHERE b.id = biz_id AND u.is_demo
  ) THEN
    RAISE EXCEPTION 'Demo Mode is read-only' USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- 4.3 Attach demo triggers to businesses & business_members
DROP TRIGGER IF EXISTS businesses_demo_read_only ON businesses;
CREATE TRIGGER businesses_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON businesses
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_user_write('owner_id');

DROP TRIGGER IF EXISTS business_members_user_demo_read_only ON business_members;
CREATE TRIGGER business_members_user_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON business_members
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_user_write('user_id');

DROP TRIGGER IF EXISTS business_members_biz_demo_read_only ON business_members;
CREATE TRIGGER business_members_biz_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON business_members
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_write();

-- 4.4 Attach demo triggers to core tables carrying business_id
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'business_settings', 'business_branches', 'biz_accounts', 'biz_journal_entries',
    'biz_customers', 'biz_suppliers', 'biz_product_categories', 'biz_products',
    'biz_stock_movements', 'biz_sales', 'biz_purchases', 'biz_expenses',
    'biz_payments', 'biz_employees', 'biz_payroll_runs', 'biz_audit_logs',
    'biz_warehouses', 'biz_product_variants', 'biz_stock_transfers',
    'biz_stock_counts', 'biz_sales_returns', 'biz_pos_shifts',
    'biz_employee_attendance', 'biz_budgets', 'biz_notifications',
    'biz_financial_requests'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tab || '_demo_read_only', tab);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_write()',
      tab || '_demo_read_only', tab
    );
  END LOOP;
END $$;

-- 4.5 Attach demo triggers to child item tables
DROP TRIGGER IF EXISTS biz_journal_lines_demo_read_only ON biz_journal_lines;
CREATE TRIGGER biz_journal_lines_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON biz_journal_lines
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('journal_entry_id', 'biz_journal_entries');

DROP TRIGGER IF EXISTS biz_sale_items_demo_read_only ON biz_sale_items;
CREATE TRIGGER biz_sale_items_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON biz_sale_items
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('sale_id', 'biz_sales');

DROP TRIGGER IF EXISTS biz_purchase_items_demo_read_only ON biz_purchase_items;
CREATE TRIGGER biz_purchase_items_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON biz_purchase_items
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('purchase_id', 'biz_purchases');

DROP TRIGGER IF EXISTS biz_stock_transfer_items_demo_read_only ON biz_stock_transfer_items;
CREATE TRIGGER biz_stock_transfer_items_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON biz_stock_transfer_items
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('transfer_id', 'biz_stock_transfers');

DROP TRIGGER IF EXISTS biz_stock_count_items_demo_read_only ON biz_stock_count_items;
CREATE TRIGGER biz_stock_count_items_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON biz_stock_count_items
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('stock_count_id', 'biz_stock_counts');

DROP TRIGGER IF EXISTS biz_sales_return_items_demo_read_only ON biz_sales_return_items;
CREATE TRIGGER biz_sales_return_items_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON biz_sales_return_items
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('return_id', 'biz_sales_returns');

DROP TRIGGER IF EXISTS biz_payroll_items_demo_read_only ON biz_payroll_items;
CREATE TRIGGER biz_payroll_items_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON biz_payroll_items
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('payroll_run_id', 'biz_payroll_runs');
