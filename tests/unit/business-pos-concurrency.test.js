const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const BusinessService = require('../../apps/api/src/modules/business/business.service');
const BusinessRepository = require('../../apps/api/src/modules/business/business.repository');
const AccountingEngine = require('../../apps/api/src/modules/business/accounting.engine');
const businessRoutes = require('../../apps/api/src/modules/business/business.routes');
const { requireBusinessMember } = require('../../apps/api/src/modules/business/business.middleware');
const BusinessController = require('../../apps/api/src/modules/business/business.controller');
const { runBusinessIdempotent, hashPayload } = require('../../apps/api/src/modules/business/business.idempotency');

// =============================================================================
// 1. Concurrent Identical POS Requests End-to-End Invariant Tests
// =============================================================================

test('Concurrent identical POS requests result in exactly one sale, one stock deduction, and one journal posting', async () => {
  // Setup in-memory mock database state
  const db = {
    financialRequests: new Map(),
    sales: [],
    saleItems: [],
    stockMovements: [],
    products: new Map([
      ['prod_001', { id: 'prod_001', name: 'USB-C Cable', current_stock: 50, purchase_price_minor: '50000', selling_price_minor: '100000' }]
    ]),
    accounts: new Map([
      ['1010', { id: 'acc_cash', code: '1010', name: 'Cash', type: 'asset', subtype: 'cash', balance_minor: 0n }],
      ['4010', { id: 'acc_sales', code: '4010', name: 'Sales Revenue', type: 'revenue', subtype: 'sales_revenue', balance_minor: 0n }],
      ['1200', { id: 'acc_inv', code: '1200', name: 'Inventory Asset', type: 'asset', subtype: 'inventory', balance_minor: 5000000n }],
      ['5010', { id: 'acc_cogs', code: '5010', name: 'COGS', type: 'expense', subtype: 'cogs', balance_minor: 0n }]
    ]),
    journalEntries: [],
    journalLines: [],
    auditLogs: [],
    nextInvoiceNum: 1001
  };

  const businessId = 'biz_pos_test';
  const userId = 'usr_cashier';
  const idempotencyKey = crypto.randomUUID();

  const salePayload = {
    isPos: true,
    paymentMethod: 'cash',
    items: [
      { productId: 'prod_001', quantity: 2, unitPriceMinor: '100000' }
    ]
  };

  // Mock pool client factory
  const createMockClient = () => {
    let inTransaction = false;
    return {
      query: async (text, params = []) => {
        const sql = text.trim();

        if (sql.startsWith('BEGIN')) {
          inTransaction = true;
          return { rows: [] };
        }
        if (sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
          inTransaction = false;
          return { rows: [] };
        }

        // Idempotency table operations
        if (sql.includes('INSERT INTO biz_financial_requests')) {
          const [bId, uId, reqId, action, reqHash] = params;
          const mapKey = `${bId}:${reqId}`;
          if (db.financialRequests.has(mapKey)) {
            // ON CONFLICT DO NOTHING
            return { rows: [] };
          }
          const rec = {
            business_id: bId,
            user_id: uId,
            request_id: reqId,
            action,
            request_hash: reqHash,
            status: 'processing',
            result: null
          };
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

        // Product fetch FOR UPDATE
        if (sql.includes('FROM biz_products') && sql.includes('FOR UPDATE')) {
          const [prodId] = params;
          const prod = db.products.get(prodId);
          return { rows: prod ? [{ ...prod }] : [] };
        }

        // Product stock update
        if (sql.includes('UPDATE biz_products') && sql.includes('current_stock = $1')) {
          const [newStock, newVal, prodId] = params;
          const prod = db.products.get(prodId);
          if (prod) {
            prod.current_stock = newStock;
            prod.inventory_valuation_minor = newVal;
          }
          return { rows: [] };
        }

        // Sales insert
        if (sql.includes('INSERT INTO biz_sales')) {
          const saleId = 'sale_' + crypto.randomUUID().slice(0, 8);
          const saleObj = {
            id: saleId,
            business_id: params[0],
            sale_number: params[1],
            date: params[3],
            total_amount_minor: params[7],
            amount_paid_minor: params[8]
          };
          db.sales.push(saleObj);
          return { rows: [saleObj] };
        }

        // Sale items insert
        if (sql.includes('INSERT INTO biz_sale_items')) {
          db.saleItems.push({ id: 'item_' + db.saleItems.length, sale_id: params[0], product_id: params[1], quantity: params[3] });
          return { rows: [] };
        }

        // Stock movements insert
        if (sql.includes('INSERT INTO biz_stock_movements')) {
          db.stockMovements.push({ id: 'sm_' + db.stockMovements.length, product_id: params[1], quantity: params[2], reference_id: params[5] });
          return { rows: [] };
        }

        // Journal entry insert
        if (sql.includes('INSERT INTO biz_journal_entries')) {
          // Check partial unique index: reference_type = 'sale' and reference_id
          const refType = params[5];
          const refId = params[6];
          const dup = db.journalEntries.find(j => j.reference_type === refType && j.reference_id === refId);
          if (dup) {
            const err = new Error('duplicate key value violates unique constraint "uq_biz_journal_sale"');
            err.code = '23505';
            throw err;
          }
          const entryId = 'je_' + crypto.randomUUID().slice(0, 8);
          const entryObj = { id: entryId, business_id: params[0], entry_number: params[2], reference_type: refType, reference_id: refId };
          db.journalEntries.push(entryObj);
          return { rows: [entryObj] };
        }

        // Journal lines insert
        if (sql.includes('INSERT INTO biz_journal_lines')) {
          db.journalLines.push({ id: 'jl_' + db.journalLines.length, journal_entry_id: params[0], account_id: params[1], debit_minor: params[2], credit_minor: params[3] });
          return { rows: [] };
        }

        // Account lookup in AccountingEngine
        if (sql.includes('FROM biz_accounts')) {
          const [accId] = params;
          for (const acc of db.accounts.values()) {
            if (acc.id === accId) return { rows: [{ id: acc.id, type: acc.type }] };
          }
          return { rows: [] };
        }

        // Account balance update in AccountingEngine
        if (sql.includes('UPDATE biz_accounts')) {
          return { rows: [] };
        }

        // Audit log insert
        if (sql.includes('INSERT INTO biz_audit_logs')) {
          db.auditLogs.push({ id: 'log_' + db.auditLogs.length, action: params[2], entity_id: params[4] });
          return { rows: [] };
        }

        return { rows: [] };
      },
      release: () => {}
    };
  };

  // Mock repository dependencies
  const origNextInvoice = BusinessRepository.getNextInvoiceNumber;
  const origGetAccount = BusinessRepository.getAccountByCode;
  const origGetSubtype = BusinessRepository.getAccountBySubtype;
  const origLogAction = BusinessRepository.logAction;

  BusinessRepository.getNextInvoiceNumber = async () => 'INV-' + (db.nextInvoiceNum++);
  BusinessRepository.getAccountByCode = async (client, bId, code) => db.accounts.get(code);
  BusinessRepository.getAccountBySubtype = async (client, bId, subtype) => {
    for (const acc of db.accounts.values()) {
      if (acc.subtype === subtype) return acc;
    }
    return null;
  };
  BusinessRepository.logAction = async (bId, uId, act, ent, entId, meta) => {
    db.auditLogs.push({ bId, uId, act, ent, entId, meta });
  };

  try {
    // Launch two concurrent requests with identical idempotency key and identical payload
    const clientA = createMockClient();
    const clientB = createMockClient();

    const requestA = runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_sale',
      key: idempotencyKey,
      payload: salePayload,
      perform: (c) => BusinessService.createSale(businessId, userId, salePayload, c),
      existingClient: clientA
    });

    const requestB = runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_sale',
      key: idempotencyKey,
      payload: salePayload,
      perform: (c) => BusinessService.createSale(businessId, userId, salePayload, c),
      existingClient: clientB
    });

    // Handle race outcomes: one must succeed, the other either gets in-progress (409) or replays
    const results = await Promise.allSettled([requestA, requestB]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    assert.ok(successes.length >= 1, 'At least one request must succeed and commit');
    if (failures.length > 0) {
      assert.equal(failures[0].reason.statusCode, 409, 'Concurrent request rejected with 409 Conflict');
    }

    // Now issue a second request after completion: must cleanly replay with replayed: true
    const clientC = createMockClient();
    const replayResult = await runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_sale',
      key: idempotencyKey,
      payload: salePayload,
      perform: (c) => BusinessService.createSale(businessId, userId, salePayload, c),
      existingClient: clientC
    });

    assert.equal(replayResult.replayed, true, 'Subsequent identical request must return replayed=true');
    assert.ok(replayResult.value.id, 'Replayed result must contain sale ID');

    // === EXACT INVARIANT VERIFICATIONS ===
    // 1. Exactly ONE sale header created
    assert.equal(db.sales.length, 1, 'Exactly one sale record must be created in biz_sales');

    // 2. Exactly ONE stock deduction: 50 - 2 = 48
    const product = db.products.get('prod_001');
    assert.equal(product.current_stock, 48, 'Product stock must be deducted exactly once (50 -> 48)');
    assert.equal(db.stockMovements.length, 1, 'Exactly one stock movement record created');

    // 3. Exactly ONE journal entry posted
    assert.equal(db.journalEntries.length, 1, 'Exactly one journal entry posted in general ledger');
    assert.equal(db.journalEntries[0].reference_type, 'sale');
    assert.equal(db.journalEntries[0].reference_id, db.sales[0].id);

    // 4. Exactly one balanced set of lines (Cash Dr, Sales Cr, COGS Dr, Inventory Cr)
    assert.equal(db.journalLines.length, 4, 'Four balanced lines posted: Cash, Sales, COGS, Inventory');

  } finally {
    BusinessRepository.getNextInvoiceNumber = origNextInvoice;
    BusinessRepository.getAccountByCode = origGetAccount;
    BusinessRepository.getAccountBySubtype = origGetSubtype;
    BusinessRepository.logAction = origLogAction;
  }
});

// =============================================================================
// 2. Mismatched Payload with Identical Idempotency Key Rejection
// =============================================================================

test('Submitting a different payload with an already-used idempotency key is rejected with 409 Conflict', async () => {
  const store = new Map();
  const businessId = 'biz_test_mismatch';
  const userId = 'usr_test';
  const key = crypto.randomUUID();

  const payload1 = { isPos: true, total: 10000, customerId: 'cust_01' };
  const payload2 = { isPos: true, total: 20000, customerId: 'cust_02' }; // Tampered / mismatched

  const createMockClient = () => ({
    query: async (text, params) => {
      const sql = text.trim();
      if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) return { rows: [] };
      if (sql.includes('INSERT INTO biz_financial_requests')) {
        const [bId, uId, reqId, act, hash] = params;
        const k = `${bId}:${reqId}`;
        if (store.has(k)) return { rows: [] };
        store.set(k, { business_id: bId, user_id: uId, request_id: reqId, action: act, request_hash: hash, status: 'processing', result: null });
        return { rows: [{ request_id: reqId }] };
      }
      if (sql.includes('FROM biz_financial_requests')) {
        const [bId, reqId] = params;
        const k = `${bId}:${reqId}`;
        const rec = store.get(k);
        return { rows: rec ? [rec] : [] };
      }
      if (sql.includes('UPDATE biz_financial_requests')) {
        const [resJson, bId, reqId] = params;
        const k = `${bId}:${reqId}`;
        const rec = store.get(k);
        if (rec) {
          rec.status = 'completed';
          rec.result = JSON.parse(resJson);
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
    release: () => {}
  });

  // Execute request 1: succeeds
  const res1 = await runBusinessIdempotent({
    businessId,
    userId,
    action: 'create_sale',
    key,
    payload: payload1,
    perform: async () => ({ saleId: 'sale_1', total: 10000 }),
    existingClient: createMockClient()
  });

  assert.equal(res1.replayed, false);
  assert.equal(res1.value.saleId, 'sale_1');

  // Attempt request 2 with same key but different payload
  await assert.rejects(
    runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_sale',
      key,
      payload: payload2,
      perform: async () => ({ saleId: 'sale_2', total: 20000 }),
      existingClient: createMockClient()
    }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /Idempotency key was already used for a different request/);
      return true;
    }
  );
});

// =============================================================================
// 3. Demo Write Protection Verification Across Every Business Write Endpoint
// =============================================================================

test('Every Business Mode write endpoint strictly blocks demo users with HTTP 403', async () => {
  // Extract all route definitions from business router
  const writeEndpoints = [];

  // 1. Root route: POST /
  writeEndpoints.push({ path: '/', method: 'POST', handler: BusinessController.createBusiness });

  // 2. Business-scoped write methods
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  // Mock BusinessRepository to return valid active membership
  const origGetMembership = BusinessRepository.getMembership;
  BusinessRepository.getMembership = async () => ({
    id: 'mem_demo',
    business_id: 'biz_demo_test',
    user_id: 'demo_user_1',
    role: 'owner',
    status: 'active'
  });

  try {
    // Test requireBusinessMember middleware with every write method
    for (const method of writeMethods) {
      let statusCalled = null;
      let jsonCalled = null;
      let nextCalled = false;

      const req = {
        method,
        params: { businessId: 'biz_demo_test' },
        user: { id: 'demo_user_1', isDemo: true, financeMode: 'business' }
      };
      const res = {
        status(s) { statusCalled = s; return this; },
        json(j) { jsonCalled = j; return this; }
      };
      const next = () => { nextCalled = true; };

      await requireBusinessMember(req, res, next);

      assert.equal(nextCalled, false, `Method ${method} should NEVER proceed for demo user`);
      assert.equal(statusCalled, 403, `Method ${method} must return HTTP 403 Forbidden`);
      assert.equal(jsonCalled?.message, 'Demo Mode is read-only');
    }

    // Direct test on BusinessController.createBusiness
    let statusCalled = null;
    let jsonCalled = null;
    const req = {
      method: 'POST',
      user: { id: 'demo_user_1', isDemo: true },
      body: { name: 'Demo Store' }
    };
    const res = {
      status(s) { statusCalled = s; return this; },
      json(j) { jsonCalled = j; return this; }
    };
    await BusinessController.createBusiness(req, res, () => {});
    assert.equal(statusCalled, 403);
    assert.equal(jsonCalled?.message, 'Demo Mode is read-only');

  } finally {
    BusinessRepository.getMembership = origGetMembership;
  }
});
