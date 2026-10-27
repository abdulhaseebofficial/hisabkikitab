-- 0026_v3_advanced_procurement.sql
-- HisabKi Kitab Business Mode V3: Advanced Procurement Subsystem
-- Purchase Requests, Purchase Orders, Approval Workflows, Goods Received Notes (GRN),
-- Partial Goods Receipts, Supplier Bills, Accounts Payable Integration,
-- Supplier Payments, Purchase Returns, Weighted-Average Costing,
-- Double-Entry Clearing Accounts (GRNI / Accrued Purchases), and Demo Write Protection.

-- ============================================================================
-- 1. STANDARD CHART OF ACCOUNTS ENHANCEMENT FOR PROCUREMENT
-- ============================================================================
-- 2040: Goods Received Not Invoiced (GRNI) / Accrued Purchases Clearing Account.
-- When goods are received via GRN before supplier invoice arrives:
--   Dr Merchandise Inventory (1200)
--   Cr GRNI / Accrued Purchases (2040)
-- When supplier invoice is recorded:
--   Dr GRNI / Accrued Purchases (2040)
--   Cr Accounts Payable (2010)
-- This strictly prevents double-counting inventory or accounts payable.

-- 1150: Input Tax / VAT / GST Receivable
-- 5020: Purchase Price Variance (for standard vs actual cost differences)

-- ============================================================================
-- 2. PURCHASE REQUESTS (REQUISITIONS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS biz_purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  request_number text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  department text NOT NULL DEFAULT '',
  required_by_date date,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'converted_to_po', 'cancelled')),
  notes text NOT NULL DEFAULT '',
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, request_number)
);
CREATE INDEX IF NOT EXISTS biz_purchase_requests_biz_idx ON biz_purchase_requests(business_id, status);
CREATE INDEX IF NOT EXISTS biz_purchase_requests_date_idx ON biz_purchase_requests(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS biz_purchase_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES biz_purchase_requests(id) ON DELETE CASCADE,
  product_id uuid REFERENCES biz_products(id) ON DELETE SET NULL,
  product_name text NOT NULL CHECK (length(trim(product_name)) > 0),
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  estimated_cost_minor bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_minor >= 0),
  notes text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS biz_purchase_request_items_req_idx ON biz_purchase_request_items(request_id);

-- ============================================================================
-- 3. PURCHASE ORDERS & ITEMS (APPROVAL WORKFLOW)
-- ============================================================================
-- PO creation alone DOES NOT create journal entries.
CREATE TABLE IF NOT EXISTS biz_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL REFERENCES biz_suppliers(id) ON DELETE RESTRICT,
  purchase_request_id uuid REFERENCES biz_purchase_requests(id) ON DELETE SET NULL,
  po_number text NOT NULL,
  date date NOT NULL,
  expected_delivery_date date,
  payment_terms text NOT NULL DEFAULT 'net_30' CHECK (payment_terms IN ('immediate', 'net_7', 'net_15', 'net_30', 'net_60', 'custom')),
  subtotal_minor bigint NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_amount_minor bigint NOT NULL DEFAULT 0 CHECK (total_amount_minor >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'sent_to_supplier', 'partially_received', 'fully_received', 'billed', 'closed', 'cancelled')),
  notes text NOT NULL DEFAULT '',
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, po_number)
);
CREATE INDEX IF NOT EXISTS biz_purchase_orders_biz_idx ON biz_purchase_orders(business_id, status);
CREATE INDEX IF NOT EXISTS biz_purchase_orders_supplier_idx ON biz_purchase_orders(business_id, supplier_id);
CREATE INDEX IF NOT EXISTS biz_purchase_orders_date_idx ON biz_purchase_orders(business_id, date DESC);

CREATE TABLE IF NOT EXISTS biz_purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES biz_purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES biz_products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  quantity_ordered numeric(12,3) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric(12,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  quantity_billed numeric(12,3) NOT NULL DEFAULT 0 CHECK (quantity_billed >= 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0)
);
CREATE INDEX IF NOT EXISTS biz_purchase_order_items_po_idx ON biz_purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS biz_purchase_order_items_prod_idx ON biz_purchase_order_items(product_id);

-- ============================================================================
-- 4. GOODS RECEIVED NOTES (GRN) & PARTIAL GOODS RECEIPTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS biz_grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES biz_warehouses(id) ON DELETE SET NULL,
  po_id uuid NOT NULL REFERENCES biz_purchase_orders(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES biz_suppliers(id) ON DELETE RESTRICT,
  grn_number text NOT NULL,
  receive_date date NOT NULL,
  delivery_challan_number text NOT NULL DEFAULT '',
  total_received_value_minor bigint NOT NULL DEFAULT 0 CHECK (total_received_value_minor >= 0),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'inspected', 'cancelled')),
  notes text NOT NULL DEFAULT '',
  received_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, grn_number)
);
CREATE INDEX IF NOT EXISTS biz_grns_biz_idx ON biz_grns(business_id, receive_date DESC);
CREATE INDEX IF NOT EXISTS biz_grns_po_idx ON biz_grns(po_id);
CREATE INDEX IF NOT EXISTS biz_grns_supplier_idx ON biz_grns(supplier_id);

CREATE TABLE IF NOT EXISTS biz_grn_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid NOT NULL REFERENCES biz_grns(id) ON DELETE CASCADE,
  po_item_id uuid NOT NULL REFERENCES biz_purchase_order_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES biz_products(id) ON DELETE RESTRICT,
  quantity_received numeric(12,3) NOT NULL CHECK (quantity_received > 0),
  unit_cost_minor bigint NOT NULL CHECK (unit_cost_minor >= 0),
  total_cost_minor bigint NOT NULL CHECK (total_cost_minor >= 0),
  batch_number text NOT NULL DEFAULT '',
  expiry_date date
);
CREATE INDEX IF NOT EXISTS biz_grn_items_grn_idx ON biz_grn_items(grn_id);
CREATE INDEX IF NOT EXISTS biz_grn_items_prod_idx ON biz_grn_items(product_id);

-- ============================================================================
-- 5. SUPPLIER BILLS (INVOICES) & ACCOUNTS PAYABLE INTEGRATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS biz_supplier_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES biz_suppliers(id) ON DELETE RESTRICT,
  po_id uuid REFERENCES biz_purchase_orders(id) ON DELETE SET NULL,
  grn_id uuid REFERENCES biz_grns(id) ON DELETE SET NULL,
  bill_number text NOT NULL,
  supplier_invoice_number text NOT NULL DEFAULT '',
  bill_date date NOT NULL,
  due_date date NOT NULL,
  subtotal_minor bigint NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_amount_minor bigint NOT NULL DEFAULT 0 CHECK (total_amount_minor >= 0),
  amount_paid_minor bigint NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  balance_due_minor bigint NOT NULL DEFAULT 0 CHECK (balance_due_minor >= 0),
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'cancelled')),
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, bill_number)
);
CREATE INDEX IF NOT EXISTS biz_supplier_bills_biz_idx ON biz_supplier_bills(business_id, bill_date DESC);
CREATE INDEX IF NOT EXISTS biz_supplier_bills_supplier_idx ON biz_supplier_bills(business_id, supplier_id, status);
CREATE INDEX IF NOT EXISTS biz_supplier_bills_po_idx ON biz_supplier_bills(po_id);

CREATE TABLE IF NOT EXISTS biz_supplier_bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES biz_supplier_bills(id) ON DELETE CASCADE,
  product_id uuid REFERENCES biz_products(id) ON DELETE SET NULL,
  po_item_id uuid REFERENCES biz_purchase_order_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0)
);
CREATE INDEX IF NOT EXISTS biz_supplier_bill_items_bill_idx ON biz_supplier_bill_items(bill_id);

-- ============================================================================
-- 6. SUPPLIER PAYMENTS & ALLOCATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS biz_supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES biz_payments(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES biz_supplier_bills(id) ON DELETE RESTRICT,
  allocated_amount_minor bigint NOT NULL CHECK (allocated_amount_minor > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_supplier_payment_allocations_pay_idx ON biz_supplier_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS biz_supplier_payment_allocations_bill_idx ON biz_supplier_payment_allocations(bill_id);

-- ============================================================================
-- 7. PURCHASE RETURNS (DEBIT NOTES)
-- ============================================================================
CREATE TABLE IF NOT EXISTS biz_purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES business_branches(id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL REFERENCES biz_suppliers(id) ON DELETE RESTRICT,
  po_id uuid REFERENCES biz_purchase_orders(id) ON DELETE SET NULL,
  bill_id uuid REFERENCES biz_supplier_bills(id) ON DELETE SET NULL,
  return_number text NOT NULL,
  return_date date NOT NULL,
  total_amount_minor bigint NOT NULL DEFAULT 0 CHECK (total_amount_minor >= 0),
  refund_method text NOT NULL DEFAULT 'credit_note' CHECK (refund_method IN ('credit_note', 'cash', 'bank')),
  refund_account_id uuid REFERENCES biz_accounts(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, return_number)
);
CREATE INDEX IF NOT EXISTS biz_purchase_returns_biz_idx ON biz_purchase_returns(business_id, return_date DESC);
CREATE INDEX IF NOT EXISTS biz_purchase_returns_supplier_idx ON biz_purchase_returns(supplier_id);

CREATE TABLE IF NOT EXISTS biz_purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES biz_purchase_returns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES biz_products(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost_minor bigint NOT NULL CHECK (unit_cost_minor >= 0),
  line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0)
);
CREATE INDEX IF NOT EXISTS biz_purchase_return_items_ret_idx ON biz_purchase_return_items(return_id);

-- ============================================================================
-- 8. DOUBLE-ENTRY JOURNAL CONSTRAINTS (PARTIAL UNIQUE INDEXES)
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_journal_grn ON biz_journal_entries (business_id, reference_id) WHERE reference_type = 'grn';
CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_journal_supplier_bill ON biz_journal_entries (business_id, reference_id) WHERE reference_type = 'supplier_bill';
CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_journal_purchase_return ON biz_journal_entries (business_id, reference_id) WHERE reference_type = 'purchase_return';

-- ============================================================================
-- 9. DEMO WRITE PROTECTION TRIGGERS ON ALL NEW PROCUREMENT TABLES
-- ============================================================================
DROP TRIGGER IF EXISTS biz_purchase_requests_demo_guard ON biz_purchase_requests;
CREATE TRIGGER biz_purchase_requests_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_purchase_requests
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_write();

DROP TRIGGER IF EXISTS biz_purchase_request_items_demo_guard ON biz_purchase_request_items;
CREATE TRIGGER biz_purchase_request_items_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_purchase_request_items
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('request_id', 'biz_purchase_requests');

DROP TRIGGER IF EXISTS biz_purchase_orders_demo_guard ON biz_purchase_orders;
CREATE TRIGGER biz_purchase_orders_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_write();

DROP TRIGGER IF EXISTS biz_purchase_order_items_demo_guard ON biz_purchase_order_items;
CREATE TRIGGER biz_purchase_order_items_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('po_id', 'biz_purchase_orders');

DROP TRIGGER IF EXISTS biz_grns_demo_guard ON biz_grns;
CREATE TRIGGER biz_grns_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_grns
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_write();

DROP TRIGGER IF EXISTS biz_grn_items_demo_guard ON biz_grn_items;
CREATE TRIGGER biz_grn_items_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_grn_items
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('grn_id', 'biz_grns');

DROP TRIGGER IF EXISTS biz_supplier_bills_demo_guard ON biz_supplier_bills;
CREATE TRIGGER biz_supplier_bills_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_supplier_bills
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_write();

DROP TRIGGER IF EXISTS biz_supplier_bill_items_demo_guard ON biz_supplier_bill_items;
CREATE TRIGGER biz_supplier_bill_items_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_supplier_bill_items
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('bill_id', 'biz_supplier_bills');

DROP TRIGGER IF EXISTS biz_purchase_returns_demo_guard ON biz_purchase_returns;
CREATE TRIGGER biz_purchase_returns_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_purchase_returns
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_write();

DROP TRIGGER IF EXISTS biz_purchase_return_items_demo_guard ON biz_purchase_return_items;
CREATE TRIGGER biz_purchase_return_items_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_purchase_return_items
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_child_write('return_id', 'biz_purchase_returns');
