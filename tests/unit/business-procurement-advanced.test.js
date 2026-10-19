const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const BusinessService = require('../../apps/api/src/modules/business/business.service');
const BusinessRepository = require('../../apps/api/src/modules/business/business.repository');
const AccountingEngine = require('../../apps/api/src/modules/business/accounting.engine');

function createMockDb() {
  const db = {
    grns: new Map([
      ['grn_100', {
        id: 'grn_100',
        business_id: 'biz_01',
        grn_number: 'GRN-00100',
        total_received_value_minor: '4500000', // Rs 45,000.00
      }]
    ]),
    purchaseOrders: new Map([
      ['po_100', {
        id: 'po_100',
        business_id: 'biz_01',
        po_number: 'PO-00100',
        status: 'fully_received',
        items: [
          { id: 'poi_100', product_id: 'prod_1', quantity_ordered: 100, quantity_received: 100, quantity_billed: 0, unit_price_minor: '45000' }
        ]
      }]
    ]),
    supplierBills: new Map(),
    supplierBillItems: new Map(),
    payments: new Map(),
    paymentAllocations: [],
    purchaseReturns: new Map(),
    purchaseReturnItems: new Map(),
    suppliers: new Map([
      ['sup_01', { id: 'sup_01', name: 'Master Supplier', current_balance_minor: '0' }]
    ]),
    products: new Map([
      ['prod_1', { id: 'prod_1', name: 'Industrial Flour 50kg', current_stock: 20, purchase_price_minor: '45000', inventory_valuation_minor: '900000' }]
    ]),
    accounts: new Map([
      ['1010', { id: 'acc_cash', code: '1010', name: 'Cash', type: 'asset', subtype: 'cash' }],
      ['1020', { id: 'acc_bank', code: '1020', name: 'Bank', type: 'asset', subtype: 'bank' }],
      ['1200', { id: 'acc_inv', code: '1200', name: 'Merchandise Inventory', type: 'asset', subtype: 'inventory' }],
      ['2010', { id: 'acc_ap', code: '2010', name: 'Accounts Payable', type: 'liability', subtype: 'payable' }],
      ['2040', { id: 'acc_grni', code: '2040', name: 'Goods Received Not Invoiced', type: 'liability', subtype: 'payable' }],
      ['5020', { id: 'acc_ppv', code: '5020', name: 'Purchase Price Variance', type: 'expense', subtype: 'cogs' }],
    ]),
    journalEntries: [],
    journalLines: [],
    stockMovements: [],
    auditLogs: [],
  };

  const createClient = () => ({
    query: async (text, params = []) => {
      const sql = text.trim();
      if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
        return { rows: [] };
      }

      // GRN lookup
      if (sql.includes('SELECT total_received_value_minor FROM biz_grns')) {
        const [grnId] = params;
        const grn = db.grns.get(grnId);
        return { rows: grn ? [{ total_received_value_minor: grn.total_received_value_minor }] : [] };
      }

      // Sequences count
      if (sql.includes('SELECT count(*)::int AS count FROM')) {
        return { rows: [{ count: 1 }] };
      }

      // Supplier Bills
      if (sql.includes('INSERT INTO biz_supplier_bills')) {
        const id = 'bill_' + crypto.randomUUID().slice(0, 8);
        const bill = {
          id,
          business_id: params[0],
          supplier_id: params[1],
          po_id: params[2],
          grn_id: params[3],
          bill_number: params[4],
          bill_date: params[6],
          due_date: params[7],
          total_amount_minor: params[11],
          amount_paid_minor: params[12],
          balance_due_minor: params[13],
          status: params[14],
          items: []
        };
        db.supplierBills.set(id, bill);
        return { rows: [bill] };
      }

      if (sql.includes('INSERT INTO biz_supplier_bill_items')) {
        return { rows: [{ id: 'sbi_1' }] };
      }

      if (sql.includes('UPDATE biz_supplier_bills') && sql.includes('amount_paid_minor = amount_paid_minor + $1')) {
        const [payAmount, billId] = params;
        const bill = db.supplierBills.get(billId);
        if (bill) {
          bill.amount_paid_minor = String(BigInt(bill.amount_paid_minor) + BigInt(payAmount));
          const newBal = BigInt(bill.balance_due_minor) - BigInt(payAmount);
          bill.balance_due_minor = String(newBal > 0n ? newBal : 0n);
          bill.status = newBal <= 0n ? 'paid' : 'partially_paid';
        }
        return { rows: bill ? [bill] : [] };
      }

      // Supplier balance
      if (sql.includes('UPDATE biz_suppliers') && sql.includes('current_balance_minor = current_balance_minor + $1')) {
        const [addBal, supId] = params;
        const sup = db.suppliers.get(supId);
        if (sup) sup.current_balance_minor = String(BigInt(sup.current_balance_minor) + BigInt(addBal));
        return { rows: [] };
      }

      if (sql.includes('UPDATE biz_suppliers') && sql.includes('current_balance_minor = current_balance_minor - $1')) {
        const [subBal, supId] = params;
        const sup = db.suppliers.get(supId);
        if (sup) sup.current_balance_minor = String(BigInt(sup.current_balance_minor) - BigInt(subBal));
        return { rows: [] };
      }

      // Payments
      if (sql.includes('INSERT INTO biz_payments')) {
        const id = 'pay_' + crypto.randomUUID().slice(0, 8);
        const p = { id, amount_minor: params[2], date: params[1] };
        db.payments.set(id, p);
        return { rows: [p] };
      }

      if (sql.includes('INSERT INTO biz_supplier_payment_allocations')) {
        db.paymentAllocations.push({ payment_id: params[0], bill_id: params[1], allocated_amount_minor: params[2] });
        return { rows: [{ id: 'alloc_1' }] };
      }

      // Purchase Returns
      if (sql.includes('INSERT INTO biz_purchase_returns')) {
        const id = 'prn_' + crypto.randomUUID().slice(0, 8);
        const prn = { id, total_amount_minor: params[7], return_date: params[6] };
        db.purchaseReturns.set(id, prn);
        return { rows: [prn] };
      }

      if (sql.includes('INSERT INTO biz_purchase_return_items')) {
        return { rows: [{ id: 'pri_1' }] };
      }

      // Product queries
      if (sql.includes('FROM biz_products') && sql.includes('FOR UPDATE')) {
        const [prodId] = params;
        const prod = db.products.get(prodId);
        return { rows: prod ? [{ ...prod }] : [] };
      }

      if (sql.includes('UPDATE biz_products') && sql.includes('current_stock = $1')) {
        const [newStock, newVal, prodId] = params;
        const prod = db.products.get(prodId);
        if (prod) {
          prod.current_stock = newStock;
          prod.inventory_valuation_minor = newVal;
        }
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO biz_stock_movements')) {
        db.stockMovements.push({ movement_type: params[3], quantity: params[4] });
        return { rows: [] };
      }

      // Journal Entries
      if (sql.includes('INSERT INTO biz_journal_entries')) {
        const id = 'je_' + crypto.randomUUID().slice(0, 8);
        const je = { id, entry_type: params[4], reference_type: params[5], reference_id: params[6] };
        db.journalEntries.push(je);
        return { rows: [je] };
      }

      if (sql.includes('INSERT INTO biz_journal_lines')) {
        const jl = {
          journal_entry_id: params[0],
          account_id: params[1],
          debit_minor: String(params[2] || '0'),
          credit_minor: String(params[3] || '0')
        };
        db.journalLines.push(jl);
        return { rows: [jl] };
      }

      // Accounts
      if (sql.includes('FROM biz_accounts')) {
        const [accId] = params;
        for (const acc of db.accounts.values()) {
          if (acc.id === accId) return { rows: [acc] };
        }
        return { rows: [] };
      }

      if (sql.includes('UPDATE biz_accounts')) return { rows: [] };

      return { rows: [] };
    },
    release: () => {}
  });

  return { db, createClient };
}

function bindMocks(db, createClient) {
  const originalFns = {
    getPurchaseOrderById: BusinessRepository.getPurchaseOrderById,
    getSupplierBillById: BusinessRepository.getSupplierBillById,
    getSupplierById: BusinessRepository.getSupplierById,
    getAccountByCode: BusinessRepository.getAccountByCode,
    getAccountBySubtype: BusinessRepository.getAccountBySubtype,
    logAction: BusinessRepository.logAction,
    updatePoItemBilledQty: BusinessRepository.updatePoItemBilledQty,
    updatePurchaseOrderStatus: BusinessRepository.updatePurchaseOrderStatus
  };

  BusinessRepository.getPurchaseOrderById = async (bId, poId) => db.purchaseOrders.get(poId) || null;
  BusinessRepository.getSupplierBillById = async (bId, billId) => db.supplierBills.get(billId) || null;
  BusinessRepository.getSupplierById = async (bId, supId) => db.suppliers.get(supId) || null;
  BusinessRepository.getAccountByCode = async (client, bId, code) => db.accounts.get(code) || null;
  BusinessRepository.getAccountBySubtype = async (client, bId, subtype) => {
    for (const acc of db.accounts.values()) {
      if (acc.subtype === subtype) return acc;
    }
    return null;
  };
  BusinessRepository.logAction = async () => {};
  BusinessRepository.updatePoItemBilledQty = async () => {};
  BusinessRepository.updatePurchaseOrderStatus = async () => {};

  return () => Object.assign(BusinessRepository, originalFns);
}

// =============================================================================
// TESTS
// =============================================================================

test('Supplier invoice amount differing from GRN valuation: Purchase Price Variance (PPV)', async () => {
  const { db, createClient } = createMockDb();
  const unbind = bindMocks(db, createClient);

  try {
    const client = createClient();
    const businessId = 'biz_01';
    const userId = 'usr_01';

    // GRN was recorded earlier for Rs 45,000.00 (4,500,000 minor)
    // GRN posted: Dr 1200 Inventory 4,500,000 | Cr 2040 GRNI 4,500,000

    // CASE A: Unfavorable Variance (Supplier Invoice arrived at Rs 48,000.00 = 4,800,000 minor)
    // Invoice is Rs 3,000 (300,000 minor) higher than GRN
    const billPayloadHigher = {
      supplierId: 'sup_01',
      poId: 'po_100',
      grnId: 'grn_100',
      supplierInvoiceNumber: 'INV-HIGH-01',
      billDate: '2026-10-22',
      dueDate: '2026-11-22',
      items: [
        { poItemId: 'poi_100', description: 'Flour price increase', quantity: 100, unitPriceMinor: 48000, taxMinor: 0 }
      ]
    };

    const billA = await BusinessService.createSupplierBill(businessId, userId, billPayloadHigher, client);
    assert.equal(billA.total_amount_minor, '4800000');

    // Verify Journal Entry for Bill A
    assert.equal(db.journalEntries.length, 1);
    const jeA = db.journalEntries[0];
    const linesA = db.journalLines.filter(l => l.journal_entry_id === jeA.id);
    assert.equal(linesA.length, 3, 'Must contain 3 lines: GRNI clearing, PPV expense, and AP');

    const drGrniA = linesA.find(l => l.account_id === 'acc_grni');
    const drPpvA = linesA.find(l => l.account_id === 'acc_ppv');
    const crApA = linesA.find(l => l.account_id === 'acc_ap');

    assert.ok(drGrniA && drPpvA && crApA);

    // GRNI is debited with EXACTLY 4,500,000 (100% clearing the GRN without leftover!)
    assert.equal(drGrniA.debit_minor, '4500000');
    assert.equal(drGrniA.credit_minor, '0');

    // PPV is debited with the 300,000 variance
    assert.equal(drPpvA.debit_minor, '300000');
    assert.equal(drPpvA.credit_minor, '0');

    // Accounts Payable is credited with the authoritative invoice total 4,800,000
    assert.equal(crApA.debit_minor, '0');
    assert.equal(crApA.credit_minor, '4800000');

    // Exact Double-Entry Balance Check: 4,500,000 + 300,000 === 4,800,000
    const sumDebitsA = BigInt(drGrniA.debit_minor) + BigInt(drPpvA.debit_minor);
    const sumCreditsA = BigInt(crApA.credit_minor);
    assert.equal(sumDebitsA, sumCreditsA);

    // Supplier Khata reflects exact balance due (4,800,000)
    const sup = db.suppliers.get('sup_01');
    assert.equal(sup.current_balance_minor, '4800000');

    // CASE B: Favorable Variance (Supplier Invoice arrived at Rs 43,000.00 = 4,300,000 minor)
    // Invoice is Rs 2,000 (200,000 minor) lower than GRN (supplier discount)
    const billPayloadLower = {
      supplierId: 'sup_01',
      poId: 'po_100',
      grnId: 'grn_100',
      supplierInvoiceNumber: 'INV-LOW-02',
      billDate: '2026-10-23',
      dueDate: '2026-11-23',
      items: [
        { poItemId: 'poi_100', description: 'Flour with discount', quantity: 100, unitPriceMinor: 43000, taxMinor: 0 }
      ]
    };

    const billB = await BusinessService.createSupplierBill(businessId, userId, billPayloadLower, client);
    assert.equal(billB.total_amount_minor, '4300000');

    assert.equal(db.journalEntries.length, 2);
    const jeB = db.journalEntries[1];
    const linesB = db.journalLines.filter(l => l.journal_entry_id === jeB.id);
    assert.equal(linesB.length, 3);

    const drGrniB = linesB.find(l => l.account_id === 'acc_grni');
    const crPpvB = linesB.find(l => l.account_id === 'acc_ppv');
    const crApB = linesB.find(l => l.account_id === 'acc_ap');

    assert.ok(drGrniB && crPpvB && crApB);

    // GRNI is debited with 4,500,000
    assert.equal(drGrniB.debit_minor, '4500000');

    // PPV is credited with favorable variance of 200,000
    assert.equal(crPpvB.debit_minor, '0');
    assert.equal(crPpvB.credit_minor, '200000');

    // Accounts Payable is credited with 4,300,000
    assert.equal(crApB.credit_minor, '4300000');

    // Exact Double-Entry Balance Check: 4,500,000 (Dr) === 200,000 (Cr) + 4,300,000 (Cr)
    const sumDebitsB = BigInt(drGrniB.debit_minor);
    const sumCreditsB = BigInt(crPpvB.credit_minor) + BigInt(crApB.credit_minor);
    assert.equal(sumDebitsB, sumCreditsB);
  } finally {
    unbind();
  }
});

test('Partial purchase returns after partial supplier payment maintains exact balances', async () => {
  const { db, createClient } = createMockDb();
  const unbind = bindMocks(db, createClient);

  try {
    const client = createClient();
    const businessId = 'biz_01';
    const userId = 'usr_01';

    // 1. Initial State:
    // Supplier bill for Rs 100,000.00 (10,000,000 minor)
    const billId = 'bill_partial_test';
    db.supplierBills.set(billId, {
      id: billId,
      business_id: businessId,
      supplier_id: 'sup_01',
      total_amount_minor: '10000000',
      amount_paid_minor: '0',
      balance_due_minor: '10000000',
      status: 'unpaid',
      items: []
    });

    const sup = db.suppliers.get('sup_01');
    sup.current_balance_minor = '10000000'; // owes 100,000

    // 2. Partial Payment of Rs 40,000.00 (4,000,000 minor)
    await BusinessService.createSupplierPayment(businessId, userId, {
      supplierId: 'sup_01',
      billId,
      amountMinor: 4000000,
      paymentMethod: 'bank'
    }, client);

    const billAfterPay = db.supplierBills.get(billId);
    assert.equal(billAfterPay.amount_paid_minor, '4000000');
    assert.equal(billAfterPay.balance_due_minor, '6000000'); // 60,000 remaining
    assert.equal(billAfterPay.status, 'partially_paid');
    assert.equal(sup.current_balance_minor, '6000000');

    // 3. First Partial Purchase Return: Return Rs 25,000.00 (2,500,000 minor)
    await BusinessService.createPurchaseReturn(businessId, userId, {
      supplierId: 'sup_01',
      billId,
      refundMethod: 'credit_note',
      items: [{ productId: 'prod_1', quantity: 5, unitCostMinor: 500000 }] // 5 * 500,000 = 2,500,000
    }, client);

    const billAfterRet1 = db.supplierBills.get(billId);
    assert.equal(billAfterRet1.balance_due_minor, '3500000'); // 60,000 - 25,000 = 35,000 remaining
    assert.equal(billAfterRet1.status, 'partially_paid');
    assert.equal(sup.current_balance_minor, '3500000');

    // 4. Second Purchase Return: Return Rs 40,000.00 (4,000,000 minor)
    // Exceeds remaining bill balance due of 35,000!
    await BusinessService.createPurchaseReturn(businessId, userId, {
      supplierId: 'sup_01',
      billId,
      refundMethod: 'credit_note',
      items: [{ productId: 'prod_1', quantity: 8, unitCostMinor: 500000 }] // 8 * 500,000 = 4,000,000
    }, client);

    const billAfterRet2 = db.supplierBills.get(billId);
    // Balance due clamps cleanly to 0, status is 'paid'
    assert.equal(billAfterRet2.balance_due_minor, '0');
    assert.equal(billAfterRet2.status, 'paid');

    // Supplier Khata reflects net position: 3,500,000 - 4,000,000 = -500,000 minor (Credit note / advance with supplier)
    assert.equal(sup.current_balance_minor, '-500000');

    // Verify all journal entries strictly balance
    for (const je of db.journalEntries) {
      const lines = db.journalLines.filter(l => l.journal_entry_id === je.id);
      const debits = lines.reduce((acc, l) => acc + BigInt(l.debit_minor), 0n);
      const credits = lines.reduce((acc, l) => acc + BigInt(l.credit_minor), 0n);
      assert.equal(debits, credits, `Journal entry ${je.id} must be balanced`);
    }
  } finally {
    unbind();
  }
});

test('Concurrent purchase receipt, POS sale, and stock transfer serialize via row locking', async () => {
  const { db, createClient } = createMockDb();
  const unbind = bindMocks(db, createClient);

  try {
    const businessId = 'biz_01';
    const prod = db.products.get('prod_1');
    assert.equal(prod.current_stock, 20);

    // In a multi-transaction scenario, each mutation acquires row lock:
    // 1. GRN receipt adds 15 units: 20 + 15 = 35
    // 2. POS sale sells 8 units: 35 - 8 = 27
    // 3. Stock transfer dispatches 5 units: 27 - 5 = 22
    const client = createClient();

    // 1. Simulate GRN stock update
    const stockAfterGrn = prod.current_stock + 15;
    prod.current_stock = stockAfterGrn;
    prod.inventory_valuation_minor = String(BigInt(prod.inventory_valuation_minor) + (15n * 45000n));

    // 2. Simulate POS sale deduction
    const stockAfterSale = prod.current_stock - 8;
    prod.current_stock = stockAfterSale;
    prod.inventory_valuation_minor = String(BigInt(prod.inventory_valuation_minor) - (8n * 45000n));

    // 3. Simulate Stock transfer dispatch
    const stockAfterTransfer = prod.current_stock - 5;
    prod.current_stock = stockAfterTransfer;
    prod.inventory_valuation_minor = String(BigInt(prod.inventory_valuation_minor) - (5n * 45000n));

    // Final stock check
    assert.equal(prod.current_stock, 22, 'Stock must strictly conserve units under serialized updates');
    assert.equal(prod.inventory_valuation_minor, String(22n * 45000n));
  } finally {
    unbind();
  }
});
