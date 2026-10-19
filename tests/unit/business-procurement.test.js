const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const BusinessService = require('../../apps/api/src/modules/business/business.service');
const BusinessRepository = require('../../apps/api/src/modules/business/business.repository');
const AccountingEngine = require('../../apps/api/src/modules/business/accounting.engine');
const { runBusinessIdempotent } = require('../../apps/api/src/modules/business/business.idempotency');
const {
  PURCHASE_REQUEST_STATUSES,
  PURCHASE_ORDER_STATUSES,
  STANDARD_BUSINESS_ACCOUNTS,
} = require('../../packages/contracts/business');

// =============================================================================
// Helper: Mock In-Memory Database for Advanced Procurement Tests
// =============================================================================

function createMockProcurementDb() {
  const db = {
    financialRequests: new Map(),
    purchaseRequests: new Map(),
    purchaseRequestItems: new Map(),
    purchaseOrders: new Map(),
    purchaseOrderItems: new Map(),
    grns: new Map(),
    grnItems: new Map(),
    supplierBills: new Map(),
    supplierBillItems: new Map(),
    payments: new Map(),
    paymentAllocations: [],
    purchaseReturns: new Map(),
    purchaseReturnItems: new Map(),
    stockMovements: [],
    auditLogs: [],
    journalEntries: [],
    journalLines: [],
    suppliers: new Map([
      ['sup_001', { id: 'sup_001', name: 'Al-Madina Wholesalers', company_name: 'Al-Madina Ltd', phone: '+923001112233', current_balance_minor: '0' }]
    ]),
    products: new Map([
      ['prod_101', {
        id: 'prod_101',
        name: 'Basmati Rice 5kg',
        sku: 'RICE-5KG',
        unit: 'bag',
        current_stock: 50,
        purchase_price_minor: '40000', // Rs 400.00
        inventory_valuation_minor: '2000000', // Rs 20,000.00 (50 * 400.00)
        selling_price_minor: '60000'
      }],
      ['prod_102', {
        id: 'prod_102',
        name: 'Cooking Oil 1L',
        sku: 'OIL-1L',
        unit: 'bottle',
        current_stock: 20,
        purchase_price_minor: '35000', // Rs 350.00
        inventory_valuation_minor: '700000', // Rs 7,000.00 (20 * 350.00)
        selling_price_minor: '45000'
      }]
    ]),
    accounts: new Map([
      ['1010', { id: 'acc_cash', code: '1010', name: 'Cash in Hand', type: 'asset', subtype: 'cash', balance_minor: 10000000n }],
      ['1020', { id: 'acc_bank', code: '1020', name: 'Business Bank Account', type: 'asset', subtype: 'bank', balance_minor: 50000000n }],
      ['1200', { id: 'acc_inv', code: '1200', name: 'Merchandise Inventory', type: 'asset', subtype: 'inventory', balance_minor: 2700000n }],
      ['2010', { id: 'acc_ap', code: '2010', name: 'Accounts Payable', type: 'liability', subtype: 'payable', balance_minor: 0n }],
      ['2040', { id: 'acc_grni', code: '2040', name: 'Goods Received Not Invoiced (GRNI)', type: 'liability', subtype: 'payable', balance_minor: 0n }],
    ])
  };

  const createMockClient = () => {
    return {
      query: async (text, params = []) => {
        const sql = text.trim();

        if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
          return { rows: [] };
        }

        // Idempotency: biz_financial_requests
        if (sql.includes('INSERT INTO biz_financial_requests')) {
          const [bId, uId, reqId, action, reqHash] = params;
          const mapKey = `${bId}:${reqId}`;
          if (db.financialRequests.has(mapKey)) {
            return { rows: [] };
          }
          const rec = { business_id: bId, user_id: uId, request_id: reqId, action, request_hash: reqHash, status: 'processing', result: null };
          db.financialRequests.set(mapKey, rec);
          return { rows: [{ request_id: reqId }] };
        }

        if (sql.includes('FROM biz_financial_requests')) {
          const [bId, reqId] = params;
          const mapKey = `${bId}:${reqId}`;
          const rec = db.financialRequests.get(mapKey);
          return { rows: rec ? [rec] : [] };
        }

        if (sql.includes('UPDATE biz_financial_requests')) {
          const [resJson, bId, reqId] = params;
          const mapKey = `${bId}:${reqId}`;
          const rec = db.financialRequests.get(mapKey);
          if (rec) {
            rec.status = 'completed';
            rec.result = JSON.parse(resJson);
          }
          return { rows: [] };
        }

        // Sequence numbers count
        if (sql.includes('SELECT count(*)::int AS count FROM')) {
          if (sql.includes('biz_purchase_requests')) {
            return { rows: [{ count: db.purchaseRequests.size }] };
          }
          if (sql.includes('biz_purchase_orders')) {
            return { rows: [{ count: db.purchaseOrders.size }] };
          }
          if (sql.includes('biz_grns')) {
            return { rows: [{ count: db.grns.size }] };
          }
          if (sql.includes('biz_supplier_bills')) {
            return { rows: [{ count: db.supplierBills.size }] };
          }
          if (sql.includes('biz_purchase_returns')) {
            return { rows: [{ count: db.purchaseReturns.size }] };
          }
          return { rows: [{ count: 0 }] };
        }

        // 1. Purchase Requests
        if (sql.includes('INSERT INTO biz_purchase_requests')) {
          const id = 'pr_' + crypto.randomUUID().slice(0, 8);
          const pr = {
            id,
            business_id: params[0],
            branch_id: params[1],
            request_number: params[2],
            requested_by: params[3],
            department: params[4],
            required_by_date: params[5],
            priority: params[6],
            status: 'draft',
            notes: params[7],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          db.purchaseRequests.set(id, pr);
          return { rows: [pr] };
        }

        if (sql.includes('INSERT INTO biz_purchase_request_items')) {
          const id = 'pri_' + crypto.randomUUID().slice(0, 8);
          const item = {
            id,
            request_id: params[0],
            product_id: params[1],
            product_name: params[2],
            quantity: params[3],
            estimated_cost_minor: params[4],
            notes: params[5]
          };
          db.purchaseRequestItems.set(id, item);
          return { rows: [item] };
        }

        if (sql.includes('UPDATE biz_purchase_requests')) {
          const [status, approvedBy, rejectionReason, requestId, businessId] = params;
          const pr = db.purchaseRequests.get(requestId);
          if (pr) {
            pr.status = status;
            pr.approved_by = approvedBy;
            pr.rejection_reason = rejectionReason;
            pr.updated_at = new Date().toISOString();
          }
          return { rows: pr ? [pr] : [] };
        }

        // 2. Purchase Orders
        if (sql.includes('INSERT INTO biz_purchase_orders')) {
          const id = 'po_' + crypto.randomUUID().slice(0, 8);
          const po = {
            id,
            business_id: params[0],
            branch_id: params[1],
            supplier_id: params[2],
            purchase_request_id: params[3],
            po_number: params[4],
            date: params[5],
            expected_delivery_date: params[6],
            payment_terms: params[7],
            subtotal_minor: params[8],
            tax_minor: params[9],
            discount_minor: params[10],
            total_amount_minor: params[11],
            status: 'draft',
            notes: params[12],
            created_by: params[13],
            items: []
          };
          db.purchaseOrders.set(id, po);
          return { rows: [po] };
        }

        if (sql.includes('INSERT INTO biz_purchase_order_items')) {
          const id = 'poi_' + crypto.randomUUID().slice(0, 8);
          const item = {
            id,
            po_id: params[0],
            product_id: params[1],
            product_name: params[2],
            quantity_ordered: params[3],
            quantity_received: 0,
            quantity_billed: 0,
            unit_price_minor: params[4],
            tax_minor: params[5],
            discount_minor: params[6],
            line_total_minor: params[7]
          };
          db.purchaseOrderItems.set(id, item);
          const po = db.purchaseOrders.get(params[0]);
          if (po) po.items.push(item);
          return { rows: [item] };
        }

        if (sql.includes('UPDATE biz_purchase_orders')) {
          const [status, approvedBy, rejectionReason, poId, businessId] = params;
          const po = db.purchaseOrders.get(poId);
          if (po) {
            po.status = status;
            po.approved_by = approvedBy;
            po.rejection_reason = rejectionReason;
            po.updated_at = new Date().toISOString();
          }
          return { rows: po ? [po] : [] };
        }

        if (sql.includes('UPDATE biz_purchase_order_items') && sql.includes('quantity_received = quantity_received + $1')) {
          const [addRcv, poiId] = params;
          const item = db.purchaseOrderItems.get(poiId);
          if (item) {
            item.quantity_received = Number(item.quantity_received) + Number(addRcv);
          }
          return { rows: [] };
        }

        if (sql.includes('UPDATE biz_purchase_order_items') && sql.includes('quantity_billed = quantity_billed + $1')) {
          const [addBilled, poiId] = params;
          const item = db.purchaseOrderItems.get(poiId);
          if (item) {
            item.quantity_billed = Number(item.quantity_billed) + Number(addBilled);
          }
          return { rows: [] };
        }

        // Product queries
        if (sql.includes('FROM biz_products') && sql.includes('FOR UPDATE')) {
          const [prodId] = params;
          const prod = db.products.get(prodId);
          return { rows: prod ? [{ ...prod }] : [] };
        }

        if (sql.includes('FROM biz_products') && sql.includes('WHERE id = $1')) {
          const [prodId] = params;
          const prod = db.products.get(prodId);
          return { rows: prod ? [{ ...prod }] : [] };
        }

        if (sql.includes('UPDATE biz_products') && sql.includes('current_stock = $1')) {
          if (sql.includes('purchase_price_minor = $2')) {
            // createGrn: [newStock, newUnitCost, newVal, prodId, businessId]
            const [newStock, newUnitCost, newVal, prodId] = params;
            const prod = db.products.get(prodId);
            if (prod) {
              prod.current_stock = newStock;
              prod.purchase_price_minor = String(newUnitCost);
              prod.inventory_valuation_minor = String(newVal);
            }
          } else {
            // createPurchaseReturn: [newStock, newVal, prodId, businessId]
            const [newStock, newVal, prodId] = params;
            const prod = db.products.get(prodId);
            if (prod) {
              prod.current_stock = newStock;
              prod.inventory_valuation_minor = String(newVal);
            }
          }
          return { rows: [] };
        }

        // Stock movement
        if (sql.includes('INSERT INTO biz_stock_movements')) {
          db.stockMovements.push({
            id: 'sm_' + db.stockMovements.length,
            branch_id: params[1],
            product_id: params[2],
            movement_type: sql.includes("'return_out'") ? 'return_out' : 'purchase',
            quantity: params[3],
            unit_cost_minor: params[4],
            total_cost_minor: params[5],
            reference_type: sql.includes("'purchase_return'") ? 'purchase_return' : 'grn',
          });
          return { rows: [] };
        }

        // 3. GRN
        if (sql.includes('INSERT INTO biz_grns')) {
          const id = 'grn_' + crypto.randomUUID().slice(0, 8);
          const grn = {
            id,
            business_id: params[0],
            branch_id: params[1],
            warehouse_id: params[2],
            po_id: params[3],
            supplier_id: params[4],
            grn_number: params[5],
            receive_date: params[6],
            delivery_challan_number: params[7],
            total_received_value_minor: params[8],
            status: 'received',
            notes: params[9],
            received_by: params[10],
            items: []
          };
          db.grns.set(id, grn);
          return { rows: [grn] };
        }

        if (sql.includes('INSERT INTO biz_grn_items')) {
          const id = 'gi_' + crypto.randomUUID().slice(0, 8);
          const item = {
            id,
            grn_id: params[0],
            po_item_id: params[1],
            product_id: params[2],
            quantity_received: params[3],
            unit_cost_minor: params[4],
            total_cost_minor: params[5],
            batch_number: params[6],
            expiry_date: params[7]
          };
          db.grnItems.set(id, item);
          const grn = db.grns.get(params[0]);
          if (grn) grn.items.push(item);
          return { rows: [item] };
        }

        // 4. Supplier Bills
        if (sql.includes('INSERT INTO biz_supplier_bills')) {
          const id = 'bill_' + crypto.randomUUID().slice(0, 8);
          const bill = {
            id,
            business_id: params[0],
            supplier_id: params[1],
            po_id: params[2],
            grn_id: params[3],
            bill_number: params[4],
            supplier_invoice_number: params[5],
            bill_date: params[6],
            due_date: params[7],
            subtotal_minor: params[8],
            tax_minor: params[9],
            discount_minor: params[10],
            total_amount_minor: params[11],
            amount_paid_minor: params[12],
            balance_due_minor: params[13],
            status: params[14],
            notes: params[15],
            created_by: params[16],
            items: []
          };
          db.supplierBills.set(id, bill);
          return { rows: [bill] };
        }

        if (sql.includes('INSERT INTO biz_supplier_bill_items')) {
          const id = 'sbi_' + crypto.randomUUID().slice(0, 8);
          const item = {
            id,
            bill_id: params[0],
            product_id: params[1],
            po_item_id: params[2],
            description: params[3],
            quantity: params[4],
            unit_price_minor: params[5],
            tax_minor: params[6],
            line_total_minor: params[7]
          };
          db.supplierBillItems.set(id, item);
          const bill = db.supplierBills.get(params[0]);
          if (bill) bill.items.push(item);
          return { rows: [item] };
        }

        if (sql.includes('UPDATE biz_supplier_bills') && sql.includes('amount_paid_minor = amount_paid_minor + $1')) {
          const [payAmount, billId, businessId] = params;
          const bill = db.supplierBills.get(billId);
          if (bill) {
            bill.amount_paid_minor = String(BigInt(bill.amount_paid_minor) + BigInt(payAmount));
            const newBal = BigInt(bill.balance_due_minor) - BigInt(payAmount);
            bill.balance_due_minor = String(newBal > 0n ? newBal : 0n);
            bill.status = newBal <= 0n ? 'paid' : 'partially_paid';
          }
          return { rows: bill ? [bill] : [] };
        }

        // Supplier queries & balance updates
        if (sql.includes('UPDATE biz_suppliers') && sql.includes('current_balance_minor = current_balance_minor + $1')) {
          const [addBal, supId] = params;
          const sup = db.suppliers.get(supId);
          if (sup) {
            sup.current_balance_minor = String(BigInt(sup.current_balance_minor) + BigInt(addBal));
          }
          return { rows: [] };
        }

        if (sql.includes('UPDATE biz_suppliers') && sql.includes('current_balance_minor = current_balance_minor - $1')) {
          const [subBal, supId] = params;
          const sup = db.suppliers.get(supId);
          if (sup) {
            sup.current_balance_minor = String(BigInt(sup.current_balance_minor) - BigInt(subBal));
          }
          return { rows: [] };
        }

        // 5. Payments
        if (sql.includes('INSERT INTO biz_payments')) {
          const id = 'pay_' + crypto.randomUUID().slice(0, 8);
          const p = {
            id,
            business_id: params[0],
            payment_type: 'supplier_payment',
            date: params[1],
            amount_minor: params[2],
            supplier_id: params[3],
            payment_method: params[4],
            payment_account_id: params[5],
            reference: params[6],
            notes: params[7],
            created_by: params[8]
          };
          db.payments.set(id, p);
          return { rows: [p] };
        }

        if (sql.includes('INSERT INTO biz_supplier_payment_allocations')) {
          const alloc = {
            id: 'alloc_' + db.paymentAllocations.length,
            payment_id: params[0],
            bill_id: params[1],
            allocated_amount_minor: params[2]
          };
          db.paymentAllocations.push(alloc);
          return { rows: [alloc] };
        }

        // 6. Purchase Returns
        if (sql.includes('INSERT INTO biz_purchase_returns')) {
          const id = 'prn_' + crypto.randomUUID().slice(0, 8);
          const prn = {
            id,
            business_id: params[0],
            branch_id: params[1],
            supplier_id: params[2],
            po_id: params[3],
            bill_id: params[4],
            return_number: params[5],
            return_date: params[6],
            total_amount_minor: params[7],
            refund_method: params[8],
            refund_account_id: params[9],
            reason: params[10],
            notes: params[11],
            created_by: params[12],
            items: []
          };
          db.purchaseReturns.set(id, prn);
          return { rows: [prn] };
        }

        if (sql.includes('INSERT INTO biz_purchase_return_items')) {
          const id = 'pri_' + crypto.randomUUID().slice(0, 8);
          const item = {
            id,
            return_id: params[0],
            product_id: params[1],
            quantity: params[2],
            unit_cost_minor: params[3],
            line_total_minor: params[4]
          };
          db.purchaseReturnItems.set(id, item);
          const prn = db.purchaseReturns.get(params[0]);
          if (prn) prn.items.push(item);
          return { rows: [item] };
        }

        // Journal Entries & Lines
        if (sql.includes('INSERT INTO biz_journal_entries')) {
          const refType = params[5];
          const refId = params[6];
          const duplicate = db.journalEntries.find(j => j.reference_type === refType && j.reference_id === refId);
          if (duplicate) {
            const err = new Error(`duplicate key value violates unique constraint "uq_biz_journal_${refType}"`);
            err.code = '23505';
            throw err;
          }
          const id = 'je_' + crypto.randomUUID().slice(0, 8);
          const je = {
            id,
            business_id: params[0],
            branch_id: params[1],
            entry_number: params[2],
            date: params[3],
            entry_type: params[4],
            reference_type: refType,
            reference_id: refId,
            narration: params[7]
          };
          db.journalEntries.push(je);
          return { rows: [je] };
        }

        if (sql.includes('INSERT INTO biz_journal_lines')) {
          const jl = {
            id: 'jl_' + db.journalLines.length,
            journal_entry_id: params[0],
            account_id: params[1],
            debit_minor: String(params[2] || '0'),
            credit_minor: String(params[3] || '0'),
            description: params[4]
          };
          db.journalLines.push(jl);
          return { rows: [jl] };
        }

        // Accounts query in AccountingEngine
        if (sql.includes('FROM biz_accounts')) {
          const [accId] = params;
          for (const acc of db.accounts.values()) {
            if (acc.id === accId) return { rows: [{ id: acc.id, type: acc.type }] };
          }
          return { rows: [] };
        }

        if (sql.includes('UPDATE biz_accounts')) {
          return { rows: [] };
        }

        return { rows: [] };
      },
      release: () => {}
    };
  };

  return { db, createMockClient };
}

// Hook repository methods to point to mock db
function bindProcurementRepositoryMocks(db, createMockClient) {
  const originalFns = {
    getPurchaseRequestById: BusinessRepository.getPurchaseRequestById,
    getPurchaseOrderById: BusinessRepository.getPurchaseOrderById,
    getGrnById: BusinessRepository.getGrnById,
    getSupplierBillById: BusinessRepository.getSupplierBillById,
    getSupplierById: BusinessRepository.getSupplierById,
    getAccountByCode: BusinessRepository.getAccountByCode,
    getAccountBySubtype: BusinessRepository.getAccountBySubtype,
    logAction: BusinessRepository.logAction
  };

  BusinessRepository.getPurchaseRequestById = async (bId, reqId) => {
    const pr = db.purchaseRequests.get(reqId);
    if (!pr) return null;
    const items = [];
    for (const it of db.purchaseRequestItems.values()) {
      if (it.request_id === reqId) items.push(it);
    }
    return { ...pr, items };
  };

  BusinessRepository.getPurchaseOrderById = async (bId, poId) => {
    const po = db.purchaseOrders.get(poId);
    if (!po) return null;
    const items = [];
    for (const it of db.purchaseOrderItems.values()) {
      if (it.po_id === poId) items.push(it);
    }
    return { ...po, items };
  };

  BusinessRepository.getGrnById = async (bId, grnId) => {
    const grn = db.grns.get(grnId);
    if (!grn) return null;
    const items = [];
    for (const it of db.grnItems.values()) {
      if (it.grn_id === grnId) items.push(it);
    }
    return { ...grn, items };
  };

  BusinessRepository.getSupplierBillById = async (bId, billId) => {
    const bill = db.supplierBills.get(billId);
    if (!bill) return null;
    const items = [];
    for (const it of db.supplierBillItems.values()) {
      if (it.bill_id === billId) items.push(it);
    }
    return { ...bill, items };
  };

  BusinessRepository.getSupplierById = async (bId, supId) => {
    return db.suppliers.get(supId) || null;
  };

  BusinessRepository.getAccountByCode = async (client, bId, code) => {
    return db.accounts.get(code) || null;
  };

  BusinessRepository.getAccountBySubtype = async (client, bId, subtype) => {
    for (const acc of db.accounts.values()) {
      if (acc.subtype === subtype) return acc;
    }
    return null;
  };

  BusinessRepository.logAction = async (bId, uId, act, ent, entId, meta) => {
    db.auditLogs.push({ bId, uId, act, ent, entId, meta });
  };

  return () => {
    Object.assign(BusinessRepository, originalFns);
  };
}

// =============================================================================
// TEST SUITES
// =============================================================================

test('Purchase Request: Full approval workflow and state transitions', async () => {
  const { db, createMockClient } = createMockProcurementDb();
  const unbind = bindProcurementRepositoryMocks(db, createMockClient);

  try {
    const client = createMockClient();
    const businessId = 'biz_test_001';
    const userId = 'usr_employee_01';
    const managerId = 'usr_manager_01';

    // 1. Create PR in Draft status
    const prNumber = await BusinessRepository.getNextSequenceNumber(client, businessId, 'biz_purchase_requests', 'request_number', 'PR-');
    assert.equal(prNumber, 'PR-00001');

    const pr = await BusinessRepository.createPurchaseRequest(client, businessId, {
      branchId: null,
      requestNumber: prNumber,
      requestedBy: userId,
      department: 'Kitchen',
      requiredByDate: '2026-11-01',
      priority: 'high',
      notes: 'Need urgently for next month catering',
      items: [
        { productId: 'prod_101', productName: 'Basmati Rice 5kg', quantity: 20, estimatedCostMinor: 800000 },
        { productId: 'prod_102', productName: 'Cooking Oil 1L', quantity: 30, estimatedCostMinor: 1050000 }
      ]
    });

    assert.equal(pr.status, 'draft');
    assert.equal(pr.items.length, 2);
    assert.equal(db.purchaseRequests.get(pr.id).status, 'draft');

    // 2. Submit PR -> pending_approval
    const prFetched = await BusinessRepository.getPurchaseRequestById(businessId, pr.id);
    assert.equal(prFetched.status, 'draft');

    const submittedPr = await BusinessRepository.updatePurchaseRequestStatus(client, businessId, pr.id, 'pending_approval');
    assert.equal(submittedPr.status, 'pending_approval');

    // 3. Approve PR -> approved
    const approvedPr = await BusinessRepository.updatePurchaseRequestStatus(client, businessId, pr.id, 'approved', { approvedBy: managerId });
    assert.equal(approvedPr.status, 'approved');
    assert.equal(approvedPr.approved_by, managerId);

    // 4. Create PO referencing PR -> converted_to_po
    await BusinessRepository.updatePurchaseRequestStatus(client, businessId, pr.id, 'converted_to_po');
    const finalPr = await BusinessRepository.getPurchaseRequestById(businessId, pr.id);
    assert.equal(finalPr.status, 'converted_to_po');

    // 5. Verify Reject Flow on another PR
    const pr2Number = await BusinessRepository.getNextSequenceNumber(client, businessId, 'biz_purchase_requests', 'request_number', 'PR-');
    assert.equal(pr2Number, 'PR-00002');

    const pr2 = await BusinessRepository.createPurchaseRequest(client, businessId, {
      requestNumber: pr2Number,
      requestedBy: userId,
      items: [{ productName: 'Excessive item', quantity: 500, estimatedCostMinor: 50000000 }]
    });

    await BusinessRepository.updatePurchaseRequestStatus(client, businessId, pr2.id, 'pending_approval');
    const rejectedPr = await BusinessRepository.updatePurchaseRequestStatus(client, businessId, pr2.id, 'rejected', {
      approvedBy: managerId,
      rejectionReason: 'Exceeds monthly department budget'
    });
    assert.equal(rejectedPr.status, 'rejected');
    assert.equal(rejectedPr.rejection_reason, 'Exceeds monthly department budget');
  } finally {
    unbind();
  }
});

test('Purchase Order: Invariant check - PO creation alone does NOT create journal entries', async () => {
  const { db, createMockClient } = createMockProcurementDb();
  const unbind = bindProcurementRepositoryMocks(db, createMockClient);

  try {
    const client = createMockClient();
    const businessId = 'biz_test_001';
    const userId = 'usr_procurement_officer';

    const poNumber = await BusinessRepository.getNextSequenceNumber(client, businessId, 'biz_purchase_orders', 'po_number', 'PO-');
    assert.equal(poNumber, 'PO-00001');

    // Build PO with 2 items
    const poPayload = {
      branchId: null,
      supplierId: 'sup_001',
      items: [
        { productId: 'prod_101', quantityOrdered: 100, unitPriceMinor: '45000', taxMinor: '0', discountMinor: '0' }, // 100 * 450 = 45,000.00
        { productId: 'prod_102', quantityOrdered: 50, unitPriceMinor: '36000', taxMinor: '0', discountMinor: '0' }    // 50 * 360 = 18,000.00
      ]
    };

    // Subtotal: (100 * 45000) + (50 * 36000) = 4,500,000 + 1,800,000 = 6,300,000 minor (Rs 63,000.00)
    let subtotal = 0n;
    const verifiedItems = [];
    for (const item of poPayload.items) {
      const prod = db.products.get(item.productId);
      const qty = Number(item.quantityOrdered);
      const unitPrice = BigInt(item.unitPriceMinor);
      const lineTotal = unitPrice * BigInt(qty);
      subtotal += lineTotal;
      verifiedItems.push({
        productId: prod.id,
        productName: prod.name,
        quantityOrdered: qty,
        unitPriceMinor: unitPrice,
        taxMinor: 0n,
        discountMinor: 0n,
        lineTotalMinor: lineTotal
      });
    }

    const po = await BusinessRepository.createPurchaseOrder(client, businessId, {
      supplierId: poPayload.supplierId,
      poNumber,
      date: '2026-10-19',
      paymentTerms: 'net_30',
      subtotalMinor: subtotal,
      taxMinor: 0n,
      discountMinor: 0n,
      totalAmountMinor: subtotal,
      createdBy: userId,
      items: verifiedItems
    });

    assert.equal(po.status, 'draft');
    assert.equal(po.total_amount_minor, '6300000');
    assert.equal(po.items.length, 2);

    // CRITICAL ACCOUNTING INVARIANT:
    // A Purchase Order is a commitment / procurement document, NOT an accounting transaction.
    // It must NOT post any general ledger journal entries until physical goods (GRN) or invoice (Bill) arrive.
    assert.equal(db.journalEntries.length, 0, 'PO creation must post zero journal entries');
    assert.equal(db.journalLines.length, 0, 'PO creation must post zero journal lines');

    // PO Status Transitions: draft -> pending_approval -> approved -> sent_to_supplier
    await BusinessRepository.updatePurchaseOrderStatus(client, businessId, po.id, 'pending_approval');
    assert.equal(db.purchaseOrders.get(po.id).status, 'pending_approval');

    await BusinessRepository.updatePurchaseOrderStatus(client, businessId, po.id, 'approved', { approvedBy: 'usr_approver' });
    assert.equal(db.purchaseOrders.get(po.id).status, 'approved');

    await BusinessRepository.updatePurchaseOrderStatus(client, businessId, po.id, 'sent_to_supplier');
    assert.equal(db.purchaseOrders.get(po.id).status, 'sent_to_supplier');

    // Still zero journal entries after sending to supplier
    assert.equal(db.journalEntries.length, 0);
  } finally {
    unbind();
  }
});

test('Goods Received Note (GRN): Partial receipts, weighted-average costing, and GRNI clearing accounting', async () => {
  const { db, createMockClient } = createMockProcurementDb();
  const unbind = bindProcurementRepositoryMocks(db, createMockClient);

  try {
    const client = createMockClient();
    const businessId = 'biz_test_001';
    const userId = 'usr_warehouse_manager';

    // 1. Existing product state:
    // Prod 101: 50 units @ Rs 400 (purchase_price_minor: 40000, valuation: 2,000,000 minor)
    const initialProd = db.products.get('prod_101');
    assert.equal(initialProd.current_stock, 50);
    assert.equal(initialProd.purchase_price_minor, '40000');
    assert.equal(initialProd.inventory_valuation_minor, '2000000');

    // 2. Setup an approved PO for 100 units of Prod 101 @ Rs 450 (45000 minor)
    const poNumber = 'PO-00001';
    const po = await BusinessRepository.createPurchaseOrder(client, businessId, {
      supplierId: 'sup_001',
      poNumber,
      date: '2026-10-19',
      paymentTerms: 'net_30',
      subtotalMinor: 4500000n,
      taxMinor: 0n,
      discountMinor: 0n,
      totalAmountMinor: 4500000n,
      createdBy: userId,
      items: [{
        productId: 'prod_101',
        productName: 'Basmati Rice 5kg',
        quantityOrdered: 100,
        unitPriceMinor: 45000n,
        taxMinor: 0n,
        discountMinor: 0n,
        lineTotalMinor: 4500000n
      }]
    });
    po.status = 'sent_to_supplier';
    db.purchaseOrders.get(po.id).status = 'sent_to_supplier';
    const poItem = po.items[0];

    // 3. FIRST PARTIAL RECEIPT (GRN 1): Receive 40 units @ Rs 450
    const grnPayload1 = {
      poId: po.id,
      receiveDate: '2026-10-20',
      items: [{ poItemId: poItem.id, quantityReceived: 40, unitCostMinor: 45000n }]
    };

    const grn1 = await BusinessService.createGrn(businessId, userId, grnPayload1, client);
    assert.ok(grn1.id);
    assert.equal(grn1.status, 'received');

    // Verify PO received quantity and partial status
    assert.equal(poItem.quantity_received, 40);
    assert.equal(db.purchaseOrders.get(po.id).status, 'partially_received');

    // Verify Weighted-Average Costing on Product:
    // Old stock = 50, Old valuation = 2,000,000
    // Received = 40 @ 45,000 = 1,800,000
    // New stock = 90
    // New total valuation = 2,000,000 + 1,800,000 = 3,800,000 minor (Rs 38,000.00)
    // New weighted-average unit cost = 3,800,000 / 90 = 42,222 minor (Rs 422.22)
    const prodAfterGrn1 = db.products.get('prod_101');
    assert.equal(prodAfterGrn1.current_stock, 90);
    assert.equal(prodAfterGrn1.inventory_valuation_minor, '3800000');
    assert.equal(prodAfterGrn1.purchase_price_minor, '42222');

    // Verify Stock Movement recorded
    assert.equal(db.stockMovements.length, 1);
    assert.equal(db.stockMovements[0].quantity, 40);
    assert.equal(db.stockMovements[0].movement_type, 'purchase');
    assert.equal(db.stockMovements[0].reference_type, 'grn');

    // Verify Double-Entry Journal Entry for GRN 1:
    // Dr 1200 Merchandise Inventory (1,800,000 minor)
    // Cr 2040 Goods Received Not Invoiced / Accrued Purchases (1,800,000 minor)
    assert.equal(db.journalEntries.length, 1);
    const je1 = db.journalEntries[0];
    assert.equal(je1.reference_type, 'grn');
    assert.equal(je1.reference_id, grn1.id);

    const jeLines1 = db.journalLines.filter(l => l.journal_entry_id === je1.id);
    assert.equal(jeLines1.length, 2);

    const drInvLine1 = jeLines1.find(l => l.account_id === 'acc_inv');
    const crGrniLine1 = jeLines1.find(l => l.account_id === 'acc_grni');
    assert.ok(drInvLine1 && crGrniLine1);
    assert.equal(drInvLine1.debit_minor, '1800000');
    assert.equal(BigInt(drInvLine1.credit_minor), 0n);
    assert.equal(BigInt(crGrniLine1.debit_minor), 0n);
    assert.equal(crGrniLine1.credit_minor, '1800000');

    // Strict Double-Entry Balance Check: Sum(Debits) === Sum(Credits)
    assert.equal(BigInt(drInvLine1.debit_minor), BigInt(crGrniLine1.credit_minor));

    // 4. SECOND PARTIAL RECEIPT (GRN 2): Receive remaining 60 units @ Rs 450
    const grnPayload2 = {
      poId: po.id,
      receiveDate: '2026-10-21',
      items: [{ poItemId: poItem.id, quantityReceived: 60, unitCostMinor: 45000n }]
    };

    const grn2 = await BusinessService.createGrn(businessId, userId, grnPayload2, client);
    assert.ok(grn2.id);

    // Verify PO item is now fully received (40 + 60 = 100)
    assert.equal(poItem.quantity_received, 100);
    assert.equal(db.purchaseOrders.get(po.id).status, 'fully_received');

    // Verify Weighted-Average Costing after GRN 2:
    // Old stock = 90, Old valuation = 3,800,000
    // Received = 60 @ 45,000 = 2,700,000
    // New stock = 150
    // New total valuation = 3,800,000 + 2,700,000 = 6,500,000 minor
    // New weighted-average unit cost = 6,500,000 / 150 = 43,333 minor (Rs 433.33)
    const prodAfterGrn2 = db.products.get('prod_101');
    assert.equal(prodAfterGrn2.current_stock, 150);
    assert.equal(prodAfterGrn2.inventory_valuation_minor, '6500000');
    assert.equal(prodAfterGrn2.purchase_price_minor, '43333');

    // Verify Journal Entry for GRN 2
    assert.equal(db.journalEntries.length, 2);
    const je2 = db.journalEntries[1];
    const jeLines2 = db.journalLines.filter(l => l.journal_entry_id === je2.id);
    const drInvLine2 = jeLines2.find(l => l.account_id === 'acc_inv');
    const crGrniLine2 = jeLines2.find(l => l.account_id === 'acc_grni');
    assert.equal(drInvLine2.debit_minor, '2700000');
    assert.equal(crGrniLine2.credit_minor, '2700000');

    // 5. Attempting to receive when PO is in 'fully_received' status MUST FAIL
    await assert.rejects(
      BusinessService.createGrn(businessId, userId, {
        poId: po.id,
        items: [{ poItemId: poItem.id, quantityReceived: 5 }]
      }, client),
      /Cannot receive goods for purchase order in 'fully_received' status/
    );
  } finally {
    unbind();
  }
});

test('Supplier Bill & Accounts Payable (Supplier Khata) Two-Stage Clearing Integration', async () => {
  const { db, createMockClient } = createMockProcurementDb();
  const unbind = bindProcurementRepositoryMocks(db, createMockClient);

  try {
    const client = createMockClient();
    const businessId = 'biz_test_001';
    const userId = 'usr_accountant_01';

    // 1. Simulate GRN already received for Rs 45,000.00 (4,500,000 minor)
    // GRN posted: Dr 1200 Merchandise Inventory 4,500,000 | Cr 2040 GRNI 4,500,000
    const grnId = 'grn_mock_001';
    const poId = 'po_mock_001';
    const poiId = 'poi_mock_001';

    db.purchaseOrders.set(poId, {
      id: poId,
      business_id: businessId,
      po_number: 'PO-00001',
      status: 'fully_received',
      items: [{
        id: poiId,
        product_id: 'prod_101',
        quantity_ordered: 100,
        quantity_received: 100,
        quantity_billed: 0,
        unit_price_minor: '45000'
      }]
    });

    const supplierInitial = db.suppliers.get('sup_001');
    assert.equal(supplierInitial.current_balance_minor, '0');

    // 2. Record Supplier Invoice / Bill against the GRN
    const billPayload = {
      supplierId: 'sup_001',
      poId,
      grnId,
      supplierInvoiceNumber: 'INV-ALM-9988',
      billDate: '2026-10-22',
      dueDate: '2026-11-22',
      discountMinor: 0,
      amountPaidMinor: 0,
      items: [
        {
          productId: 'prod_101',
          poItemId: poiId,
          description: 'Basmati Rice 5kg - 100 bags',
          quantity: 100,
          unitPriceMinor: 45000,
          taxMinor: 0
        }
      ]
    };

    const bill = await BusinessService.createSupplierBill(businessId, userId, billPayload, client);
    assert.ok(bill.id);
    assert.equal(bill.status, 'unpaid');
    assert.equal(bill.total_amount_minor, '4500000');
    assert.equal(bill.balance_due_minor, '4500000');

    // 3. Verify Supplier Khata (Accounts Payable) balance is increased
    const supplierAfterBill = db.suppliers.get('sup_001');
    assert.equal(supplierAfterBill.current_balance_minor, '4500000', 'Supplier khata must reflect balance due');

    // 4. Verify PO status is updated to 'billed'
    const poAfterBill = db.purchaseOrders.get(poId);
    assert.equal(poAfterBill.status, 'billed');

    // 5. Verify Two-Stage Clearing Accounting Posting:
    // Goods arrived earlier: Dr 1200 Inventory | Cr 2040 GRNI
    // Bill arrives now:      Dr 2040 GRNI      | Cr 2010 Accounts Payable (Supplier Khata)
    // Net result:            Dr 1200 Inventory | Cr 2010 Accounts Payable
    // ZERO DOUBLE COUNTING: Inventory was NOT debited a second time!
    assert.equal(db.journalEntries.length, 1);
    const billJe = db.journalEntries[0];
    assert.equal(billJe.reference_type, 'supplier_bill');
    assert.equal(billJe.reference_id, bill.id);

    const jeLines = db.journalLines.filter(l => l.journal_entry_id === billJe.id);
    assert.equal(jeLines.length, 2);

    const drGrniLine = jeLines.find(l => l.account_id === 'acc_grni');
    const crApLine = jeLines.find(l => l.account_id === 'acc_ap');
    assert.ok(drGrniLine && crApLine, 'Must debit GRNI clearing account and credit AP');

    assert.equal(drGrniLine.debit_minor, '4500000');
    assert.equal(BigInt(drGrniLine.credit_minor), 0n);
    assert.equal(BigInt(crApLine.debit_minor), 0n);
    assert.equal(crApLine.credit_minor, '4500000');
    assert.equal(BigInt(drGrniLine.debit_minor), BigInt(crApLine.credit_minor));

    // 6. Direct Supplier Bill (without GRN, e.g. direct expense or immediate purchase)
    const directBillPayload = {
      supplierId: 'sup_001',
      billDate: '2026-10-23',
      dueDate: '2026-10-30',
      items: [
        {
          productId: 'prod_102',
          description: 'Direct procurement of cooking oil',
          quantity: 10,
          unitPriceMinor: 35000,
          taxMinor: 0
        }
      ]
    };

    const directBill = await BusinessService.createSupplierBill(businessId, userId, directBillPayload, client);
    assert.ok(directBill.id);

    // Direct bill should debit Merchandise Inventory (1200) and credit AP (2010)
    assert.equal(db.journalEntries.length, 2);
    const directJe = db.journalEntries[1];
    const directLines = db.journalLines.filter(l => l.journal_entry_id === directJe.id);
    const drInvLine = directLines.find(l => l.account_id === 'acc_inv');
    const crDirectApLine = directLines.find(l => l.account_id === 'acc_ap');
    assert.ok(drInvLine && crDirectApLine);
    assert.equal(drInvLine.debit_minor, '350000');
    assert.equal(crDirectApLine.credit_minor, '350000');
  } finally {
    unbind();
  }
});

test('Supplier Payment: Bill allocation, khata reduction, and double-entry disbursement', async () => {
  const { db, createMockClient } = createMockProcurementDb();
  const unbind = bindProcurementRepositoryMocks(db, createMockClient);

  try {
    const client = createMockClient();
    const businessId = 'biz_test_001';
    const userId = 'usr_accountant_01';

    // 1. Initial State:
    // Supplier owes Rs 50,000.00 (5,000,000 minor)
    const supplier = db.suppliers.get('sup_001');
    supplier.current_balance_minor = '5000000';

    // Outstanding Bill of Rs 50,000.00
    const billId = 'bill_test_50k';
    db.supplierBills.set(billId, {
      id: billId,
      business_id: businessId,
      supplier_id: 'sup_001',
      bill_number: 'BILL-00001',
      total_amount_minor: '5000000',
      amount_paid_minor: '0',
      balance_due_minor: '5000000',
      status: 'unpaid',
      items: []
    });

    // 2. Make Partial Payment of Rs 30,000.00 (3,000,000 minor) via Bank
    const paymentPayload = {
      supplierId: 'sup_001',
      billId,
      amountMinor: 3000000,
      paymentMethod: 'bank',
      reference: 'IBFT-TXN-778899',
      notes: 'Partial payment against invoice'
    };

    const payment = await BusinessService.createSupplierPayment(businessId, userId, paymentPayload, client);
    assert.ok(payment.id);

    // 3. Verify Payment Allocation against the Bill
    assert.equal(db.paymentAllocations.length, 1);
    assert.equal(db.paymentAllocations[0].payment_id, payment.id);
    assert.equal(db.paymentAllocations[0].bill_id, billId);
    assert.equal(db.paymentAllocations[0].allocated_amount_minor, '3000000');

    // 4. Verify Bill balance due & status updated
    const updatedBill = db.supplierBills.get(billId);
    assert.equal(updatedBill.amount_paid_minor, '3000000');
    assert.equal(updatedBill.balance_due_minor, '2000000');
    assert.equal(updatedBill.status, 'partially_paid');

    // 5. Verify Supplier Khata balance reduced by payment amount
    // 5,000,000 - 3,000,000 = 2,000,000 minor
    assert.equal(supplier.current_balance_minor, '2000000');

    // 6. Verify Double-Entry Accounting Posting:
    // Dr Accounts Payable (2010 - Supplier Khata) Rs 30,000.00
    // Cr Bank Account (1020) Rs 30,000.00
    assert.equal(db.journalEntries.length, 1);
    const payJe = db.journalEntries[0];
    assert.equal(payJe.entry_type, 'payment');
    assert.equal(payJe.reference_type, 'payment');
    assert.equal(payJe.reference_id, payment.id);

    const jeLines = db.journalLines.filter(l => l.journal_entry_id === payJe.id);
    assert.equal(jeLines.length, 2);

    const drAp = jeLines.find(l => l.account_id === 'acc_ap');
    const crBank = jeLines.find(l => l.account_id === 'acc_bank');
    assert.ok(drAp && crBank);
    assert.equal(drAp.debit_minor, '3000000');
    assert.equal(BigInt(drAp.credit_minor), 0n);
    assert.equal(BigInt(crBank.debit_minor), 0n);
    assert.equal(crBank.credit_minor, '3000000');
    assert.equal(BigInt(drAp.debit_minor), BigInt(crBank.credit_minor));

    // 7. Make Second Payment of remaining Rs 20,000.00 (2,000,000 minor) via Cash
    const payment2Payload = {
      supplierId: 'sup_001',
      billId,
      amountMinor: 2000000,
      paymentMethod: 'cash',
      reference: 'CASH-RCPT-01'
    };

    const payment2 = await BusinessService.createSupplierPayment(businessId, userId, payment2Payload, client);
    assert.ok(payment2.id);

    // Bill is now fully paid
    const fullyPaidBill = db.supplierBills.get(billId);
    assert.equal(fullyPaidBill.amount_paid_minor, '5000000');
    assert.equal(fullyPaidBill.balance_due_minor, '0');
    assert.equal(fullyPaidBill.status, 'paid');

    // Supplier Khata is now zero
    assert.equal(supplier.current_balance_minor, '0');
  } finally {
    unbind();
  }
});

test('Purchase Return (Debit Note): Stock deduction, supplier liability reduction, and journal entry', async () => {
  const { db, createMockClient } = createMockProcurementDb();
  const unbind = bindProcurementRepositoryMocks(db, createMockClient);

  try {
    const client = createMockClient();
    const businessId = 'biz_test_001';
    const userId = 'usr_warehouse_manager';

    // 1. Initial State:
    // Prod 101: 50 units @ Rs 400 (purchase_price_minor: 40000, valuation: 2,000,000 minor)
    const prod = db.products.get('prod_101');
    assert.equal(prod.current_stock, 50);

    // Supplier Khata has Rs 100,000 payable (10,000,000 minor)
    const supplier = db.suppliers.get('sup_001');
    supplier.current_balance_minor = '10000000';

    // Outstanding bill
    const billId = 'bill_ret_test';
    db.supplierBills.set(billId, {
      id: billId,
      business_id: businessId,
      supplier_id: 'sup_001',
      total_amount_minor: '10000000',
      amount_paid_minor: '0',
      balance_due_minor: '10000000',
      status: 'unpaid',
      items: []
    });

    // 2. Return 10 damaged bags @ Rs 400 (unitCostMinor: 40000, lineTotal: 400,000 minor)
    const returnPayload = {
      supplierId: 'sup_001',
      billId,
      refundMethod: 'credit_note',
      reason: 'Damaged packaging during transit',
      items: [
        { productId: 'prod_101', quantity: 10, unitCostMinor: 40000 }
      ]
    };

    const prn = await BusinessService.createPurchaseReturn(businessId, userId, returnPayload, client);
    assert.ok(prn.id);
    assert.equal(prn.total_amount_minor, '400000');

    // 3. Verify Stock is deducted in biz_products: 50 - 10 = 40
    assert.equal(prod.current_stock, 40);
    assert.equal(prod.inventory_valuation_minor, '1600000'); // 40 * 40000

    // 4. Verify Stock Movement outward return entry
    assert.equal(db.stockMovements.length, 1);
    assert.equal(db.stockMovements[0].movement_type, 'return_out');
    assert.equal(db.stockMovements[0].quantity, 10);
    assert.equal(db.stockMovements[0].reference_type, 'purchase_return');

    // 5. Verify Supplier Khata is reduced by the Debit Note:
    // 10,000,000 - 400,000 = 9,600,000 minor
    assert.equal(supplier.current_balance_minor, '9600000');

    // 6. Verify Bill balance due is reduced: 10,000,000 - 400,000 = 9,600,000
    const billAfterReturn = db.supplierBills.get(billId);
    assert.equal(billAfterReturn.balance_due_minor, '9600000');

    // 7. Verify Double-Entry Accounting Posting:
    // Dr Accounts Payable (2010 - Supplier Khata) Rs 4,000.00 (400,000 minor)
    // Cr Merchandise Inventory (1200)             Rs 4,000.00 (400,000 minor)
    assert.equal(db.journalEntries.length, 1);
    const retJe = db.journalEntries[0];
    assert.equal(retJe.reference_type, 'purchase_return');
    assert.equal(retJe.reference_id, prn.id);

    const jeLines = db.journalLines.filter(l => l.journal_entry_id === retJe.id);
    assert.equal(jeLines.length, 2);

    const drApLine = jeLines.find(l => l.account_id === 'acc_ap');
    const crInvLine = jeLines.find(l => l.account_id === 'acc_inv');
    assert.ok(drApLine && crInvLine);
    assert.equal(drApLine.debit_minor, '400000');
    assert.equal(BigInt(drApLine.credit_minor), 0n);
    assert.equal(BigInt(crInvLine.debit_minor), 0n);
    assert.equal(crInvLine.credit_minor, '400000');
    assert.equal(BigInt(drApLine.debit_minor), BigInt(crInvLine.credit_minor));
  } finally {
    unbind();
  }
});

test('Procurement Idempotency: Duplicate requests replay cached response and prevent double financial impact', async () => {
  const { db, createMockClient } = createMockProcurementDb();
  const unbind = bindProcurementRepositoryMocks(db, createMockClient);

  try {
    const businessId = 'biz_test_001';
    const userId = 'usr_procurement_officer';
    const idempotencyKey = crypto.randomUUID();

    // 1. Initial State for Supplier & Product
    const sup = db.suppliers.get('sup_001');
    sup.current_balance_minor = '1000000'; // Rs 10,000

    const paymentPayload = {
      supplierId: 'sup_001',
      amountMinor: 500000, // Rs 5,000
      paymentMethod: 'cash',
      reference: 'IDEMP-TEST-001'
    };

    // First Call: executes and creates payment & journal entry
    const client1 = createMockClient();
    const result1 = await runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_supplier_payment',
      key: idempotencyKey,
      payload: paymentPayload,
      perform: (c) => BusinessService.createSupplierPayment(businessId, userId, paymentPayload, c),
      existingClient: client1
    });

    assert.ok(result1.value.id);
    assert.equal(result1.replayed, false);
    assert.equal(db.payments.size, 1);
    assert.equal(db.journalEntries.length, 1);
    assert.equal(sup.current_balance_minor, '500000'); // Reduced by 5,000

    // Second Call with IDENTICAL idempotency key and payload:
    // MUST REPLAY without creating duplicate payment, duplicate journal entry, or double-reducing khata!
    const client2 = createMockClient();
    const result2 = await runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_supplier_payment',
      key: idempotencyKey,
      payload: paymentPayload,
      perform: (c) => BusinessService.createSupplierPayment(businessId, userId, paymentPayload, c),
      existingClient: client2
    });

    assert.equal(result2.value.id, result1.value.id);
    assert.equal(result2.replayed, true);
    assert.equal(db.payments.size, 1, 'Must NOT insert a second payment');
    assert.equal(db.journalEntries.length, 1, 'Must NOT post a second journal entry');
    assert.equal(sup.current_balance_minor, '500000', 'Supplier balance must NOT be deducted again');

    // Third Call with SAME key but DIFFERENT payload:
    // MUST REJECT with 409 Conflict
    const conflictingPayload = { ...paymentPayload, amountMinor: 999000 };
    const client3 = createMockClient();
    await assert.rejects(
      runBusinessIdempotent({
        businessId,
        userId,
        action: 'create_supplier_payment',
        key: idempotencyKey,
        payload: conflictingPayload,
        perform: (c) => BusinessService.createSupplierPayment(businessId, userId, conflictingPayload, c),
        existingClient: client3
      }),
      (err) => {
        const code = err.statusCode || err.status;
        assert.equal(code, 409);
        assert.match(err.message, /Idempotency key was already used for a different request/);
        return true;
      }
    );
  } finally {
    unbind();
  }
});
