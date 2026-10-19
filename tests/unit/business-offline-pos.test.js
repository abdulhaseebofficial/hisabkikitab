const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const BusinessService = require('../../apps/api/src/modules/business/business.service');

// =============================================================================
// Unit Tests: HisabKi Kitab Business Mode V3 - Offline POS Subsystem
// =============================================================================

function setupMockDatabase() {
  const db = {
    financialRequests: new Map(),
    sales: [],
    saleItems: [],
    stockMovements: [],
    syncLogs: new Map(),
    products: new Map([
      ['prod_milk', { id: 'prod_milk', name: 'Fresh Milk 1L', is_active: true, current_stock: 10, purchase_price_minor: '15000', selling_price_minor: '25000' }],
      ['prod_flour', { id: 'prod_flour', name: 'Flour 5kg', is_active: true, current_stock: 2, purchase_price_minor: '40000', selling_price_minor: '60000' }],
      ['prod_inactive', { id: 'prod_inactive', name: 'Old Biscuits', is_active: false, current_stock: 50, purchase_price_minor: '5000', selling_price_minor: '10000' }],
    ]),
    customers: new Map([
      ['cust_ali', { id: 'cust_ali', name: 'Ali Khan', is_active: true, current_balance_minor: '10000', credit_limit_minor: '50000' }],
      ['cust_maxed', { id: 'cust_maxed', name: 'Maxed Customer', is_active: true, current_balance_minor: '48000', credit_limit_minor: '50000' }],
    ]),
    accounts: new Map([
      ['1010', { id: 'acc_cash', code: '1010', name: 'Cash', type: 'asset', subtype: 'cash', balance_minor: 0n }],
      ['1100', { id: 'acc_rec', code: '1100', name: 'Receivables', type: 'asset', subtype: 'receivable', balance_minor: 0n }],
      ['4010', { id: 'acc_sales', code: '4010', name: 'Sales Revenue', type: 'revenue', subtype: 'sales_revenue', balance_minor: 0n }],
      ['1200', { id: 'acc_inv', code: '1200', name: 'Inventory Asset', type: 'asset', subtype: 'inventory', balance_minor: 5000000n }],
      ['5010', { id: 'acc_cogs', code: '5010', name: 'COGS', type: 'expense', subtype: 'cogs', balance_minor: 0n }],
    ]),
    journalEntries: [],
    journalLines: [],
    auditLogs: [],
    nextInvoiceNum: 100,
  };

  const createMockClient = () => {
    return {
      query: async (text, params = []) => {
        const sql = text.trim();

        if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
          return { rows: [] };
        }

        // 0. Membership check
        if (sql.includes('FROM business_members')) {
          const [businessId, memberUserId] = params;
          if (db.revokedUsers && db.revokedUsers.has(memberUserId)) {
            return { rows: [] };
          }
          return { rows: [{ business_id: businessId, user_id: memberUserId, role: 'cashier', is_active: true }] };
        }

        // 1. biz_financial_requests
        if (sql.includes('INSERT INTO biz_financial_requests')) {
          const [businessId, userId, requestId, action, requestHash] = params;
          const key = `${businessId}:${requestId}`;
          if (db.financialRequests.has(key)) {
            return { rows: [] }; // Conflict
          }
          const record = { business_id: businessId, user_id: userId, request_id: requestId, action, request_hash: requestHash, status: 'processing', result: null };
          db.financialRequests.set(key, record);
          return { rows: [{ request_id: requestId }] };
        }

        if (sql.includes('FROM biz_financial_requests') && sql.includes('FOR UPDATE')) {
          const [businessId, requestId] = params;
          const key = `${businessId}:${requestId}`;
          const existing = db.financialRequests.get(key);
          return { rows: existing ? [existing] : [] };
        }

        if (sql.includes('UPDATE biz_financial_requests')) {
          const [resultJson, businessId, requestId] = params;
          const key = `${businessId}:${requestId}`;
          const rec = db.financialRequests.get(key);
          if (rec) {
            rec.status = 'completed';
            rec.result = JSON.parse(resultJson);
          }
          return { rows: [] };
        }

        // 2. Invoice settings
        if (sql.includes('SELECT invoice_prefix, invoice_next_number FROM business_settings')) {
          return { rows: [{ invoice_prefix: 'POS-', invoice_next_number: db.nextInvoiceNum }] };
        }
        if (sql.includes('UPDATE business_settings SET invoice_next_number')) {
          db.nextInvoiceNum++;
          return { rows: [] };
        }

        // 3. Products
        if (sql.includes('SELECT * FROM biz_products WHERE id = $1')) {
          const prod = db.products.get(params[0]);
          return { rows: prod ? [{ ...prod }] : [] };
        }
        if (sql.includes('UPDATE biz_products') && sql.includes('current_stock = $1')) {
          const [newStock, , prodId] = params;
          const prod = db.products.get(prodId);
          if (prod) prod.current_stock = Number(newStock);
          return { rows: [] };
        }

        // 4. Customers
        if (sql.includes('SELECT * FROM biz_customers WHERE id = $1')) {
          const cust = db.customers.get(params[0]);
          return { rows: cust ? [{ ...cust }] : [] };
        }
        if (sql.includes('UPDATE biz_customers SET current_balance_minor = current_balance_minor + $1')) {
          const [addBal, custId] = params;
          const cust = db.customers.get(custId);
          if (cust) cust.current_balance_minor = (BigInt(cust.current_balance_minor) + BigInt(addBal)).toString();
          return { rows: [] };
        }

        // 5. Accounts
        if (sql.includes('FROM biz_accounts') && sql.includes('code = $2')) {
          const acc = db.accounts.get(params[1]);
          return { rows: acc ? [acc] : [] };
        }
        if (sql.includes('FROM biz_accounts') && sql.includes('subtype = $2')) {
          const acc = Array.from(db.accounts.values()).find((a) => a.subtype === params[1]);
          return { rows: acc ? [acc] : [] };
        }
        if (sql.includes('FROM biz_accounts') && sql.includes('id = $1')) {
          for (const acc of db.accounts.values()) {
            if (acc.id === params[0]) return { rows: [{ id: acc.id, type: acc.type }] };
          }
          return { rows: [] };
        }
        if (sql.includes('UPDATE biz_accounts')) {
          return { rows: [] };
        }

        // 6. Sales
        if (sql.includes('INSERT INTO biz_sales')) {
          const sale = {
            id: `sale_${db.sales.length + 1}`,
            business_id: params[0],
            sale_number: params[1],
            customer_id: params[2],
            date: params[3],
            subtotal_minor: params[4],
            discount_minor: params[5],
            tax_minor: params[6],
            total_amount_minor: params[7],
            amount_paid_minor: params[8],
            balance_due_minor: params[9],
            payment_method: params[10],
            is_pos: params[12],
            notes: params[13],
            created_by: params[14],
            client_tx_id: params[15],
          };
          db.sales.push(sale);
          return { rows: [sale] };
        }

        if (sql.includes('INSERT INTO biz_sale_items')) {
          db.saleItems.push(params);
          return { rows: [] };
        }

        if (sql.includes('INSERT INTO biz_stock_movements')) {
          db.stockMovements.push(params);
          return { rows: [] };
        }

        // 7. General Ledger
        if (sql.includes('INSERT INTO biz_journal_entries')) {
          const entry = { id: `je_${db.journalEntries.length + 1}`, reference_id: params[5] };
          db.journalEntries.push(entry);
          return { rows: [entry] };
        }
        if (sql.includes('INSERT INTO biz_journal_lines')) {
          db.journalLines.push(params);
          return { rows: [] };
        }

        // 8. Offline Sync Log
        if (sql.includes('INSERT INTO biz_offline_sync_log')) {
          const [businessId, userId, clientTxId, saleId, status, conflictCode, conflictReason, reqJson, resJson, deviceFingerprint, offlineCreatedAt] = params;
          const key = `${businessId}:${clientTxId}`;
          const logEntry = {
            business_id: businessId,
            user_id: userId,
            client_tx_id: clientTxId,
            sale_id: saleId,
            status,
            conflict_code: conflictCode,
            conflict_reason: conflictReason,
            request_payload: JSON.parse(reqJson || '{}'),
            response_payload: JSON.parse(resJson || '{}'),
            device_fingerprint: deviceFingerprint,
            offline_created_at: offlineCreatedAt,
          };
          db.syncLogs.set(key, logEntry);
          return { rows: [logEntry] };
        }

        if (sql.includes('SELECT * FROM biz_offline_sync_log WHERE business_id = $1 AND client_tx_id = $2')) {
          const key = `${params[0]}:${params[1]}`;
          const entry = db.syncLogs.get(key);
          return { rows: entry ? [entry] : [] };
        }

        if (sql.includes('SELECT s.*, c.name AS customer_name FROM biz_sales s')) {
          const sale = db.sales.find((s) => s.business_id === params[0] && s.client_tx_id === params[1]);
          return { rows: sale ? [sale] : [] };
        }

        if (sql.includes('INSERT INTO biz_audit_logs')) {
          db.auditLogs.push(params);
          return { rows: [] };
        }

        return { rows: [] };
      },
      release: () => {},
    };
  };

  return { db, createMockClient };
}

// -----------------------------------------------------------------------------
// Test 1: Successful Offline Sale Synchronization & Idempotency
// -----------------------------------------------------------------------------
test('syncOfflineSale: posts sale, deducts stock, creates balanced GL, and replays idempotently', async () => {
  const { db, createMockClient } = setupMockDatabase();
  const businessId = 'biz_test_1';
  const userId = 'usr_cashier_1';
  const clientTxId = crypto.randomUUID();
  const client = createMockClient();

  const payload = {
    clientTxId,
    offlineCreatedAt: new Date().toISOString(),
    customerId: null,
    paymentMethod: 'cash',
    items: [
      { productId: 'prod_milk', quantity: 2, unitPriceMinor: '25000' },
    ],
    discountMinor: 0,
    notes: 'Offline sale test',
  };

  // First attempt: Syncs successfully
  const result = await BusinessService.syncOfflineSale(businessId, userId, payload, client);

  assert.equal(result.status, 'synced');
  assert.equal(db.sales.length, 1);
  assert.equal(db.sales[0].client_tx_id, clientTxId);
  assert.equal(db.sales[0].sale_number, 'POS-00100');

  // Stock deducted: 10 - 2 = 8
  assert.equal(db.products.get('prod_milk').current_stock, 8);
  assert.equal(db.stockMovements.length, 1);

  // Journal Entry and Balanced Lines created
  assert.equal(db.journalEntries.length, 1);
  assert.ok(db.journalLines.length >= 2, 'Should create debit and credit lines');

  // Sync log recorded
  assert.equal(db.syncLogs.size, 1);
  assert.equal(db.syncLogs.get(`${businessId}:${clientTxId}`).status, 'synced');

  // Second attempt: Network retry with the exact same clientTxId
  const retryResult = await BusinessService.syncOfflineSale(businessId, userId, payload, client);

  assert.equal(retryResult.status, 'synced');
  assert.equal(retryResult.saleNumber, 'POS-00100');
  assert.equal(db.sales.length, 1, 'Must NOT create duplicate sales');
  assert.equal(db.products.get('prod_milk').current_stock, 8, 'Must NOT deduct stock twice');
  assert.equal(db.journalEntries.length, 1, 'Must NOT post duplicate GL entries');
});

// -----------------------------------------------------------------------------
// Test 2: Negative Stock Prevention & Insufficient Stock Conflict
// -----------------------------------------------------------------------------
test('syncOfflineSale: strictly catches insufficient stock and rejects with conflict', async () => {
  const { db, createMockClient } = setupMockDatabase();
  const businessId = 'biz_test_1';
  const userId = 'usr_cashier_1';
  const clientTxId = crypto.randomUUID();
  const client = createMockClient();

  // Product 'prod_flour' has current_stock = 2, cashier requests 5
  const payload = {
    clientTxId,
    offlineCreatedAt: new Date().toISOString(),
    paymentMethod: 'cash',
    items: [
      { productId: 'prod_flour', quantity: 5, unitPriceMinor: '60000' },
    ],
  };

  const result = await BusinessService.syncOfflineSale(businessId, userId, payload, client);

  assert.equal(result.status, 'conflict');
  assert.equal(result.conflictCode, 'INSUFFICIENT_STOCK');
  assert.ok(result.conflictReason.includes('Insufficient stock'));
  assert.equal(db.sales.length, 0, 'No sale should be posted on conflict');
  assert.equal(db.products.get('prod_flour').current_stock, 2, 'Stock must remain unchanged');
  assert.equal(db.syncLogs.get(`${businessId}:${clientTxId}`).status, 'conflict');

  // Verify that forceConflictResolution CANNOT bypass negative stock (inviolable accounting invariant)
  const overrideTxId = crypto.randomUUID();
  const forceResult = await BusinessService.syncOfflineSale(businessId, userId, {
    ...payload,
    clientTxId: overrideTxId,
    forceConflictResolution: true,
  }, client);

  assert.equal(forceResult.status, 'conflict', 'Negative stock cannot be bypassed by force resolution');
  assert.equal(db.sales.length, 0);

  // Resolution workflow: adjust quantity to available stock (2) and re-sync
  const retryTxId = crypto.randomUUID();
  const retryResult = await BusinessService.syncOfflineSale(businessId, userId, {
    ...payload,
    clientTxId: retryTxId,
    items: [
      { productId: 'prod_flour', quantity: 2, unitPriceMinor: '60000' },
    ],
  }, client);

  assert.equal(retryResult.status, 'synced');
  assert.equal(db.sales.length, 1, 'Sale posted after adjusting quantity to available stock');
  assert.equal(db.products.get('prod_flour').current_stock, 0, 'Stock reduced to 0');
});

// -----------------------------------------------------------------------------
// Test 3: Deactivated or Missing Product Conflict
// -----------------------------------------------------------------------------
test('syncOfflineSale: detects deactivated or missing products as conflicts', async () => {
  const { db, createMockClient } = setupMockDatabase();
  const businessId = 'biz_test_1';
  const userId = 'usr_cashier_1';
  const clientTxId = crypto.randomUUID();
  const client = createMockClient();

  const payload = {
    clientTxId,
    offlineCreatedAt: new Date().toISOString(),
    items: [
      { productId: 'prod_inactive', quantity: 1, unitPriceMinor: '10000' },
    ],
  };

  const result = await BusinessService.syncOfflineSale(businessId, userId, payload, client);

  assert.equal(result.status, 'conflict');
  assert.equal(result.conflictCode, 'PRODUCT_INACTIVE');
  assert.equal(db.sales.length, 0);
});

// -----------------------------------------------------------------------------
// Test 4: Customer Credit Limit Violation Conflict
// -----------------------------------------------------------------------------
test('syncOfflineSale: detects customer credit limit violations on offline Udhaar', async () => {
  const { db, createMockClient } = setupMockDatabase();
  const businessId = 'biz_test_1';
  const userId = 'usr_cashier_1';
  const clientTxId = crypto.randomUUID();
  const client = createMockClient();

  // 'cust_maxed' has current balance 48,000, credit limit 50,000.
  // Sale of 1 milk pack (25,000) pushes projected balance to 73,000 > 50,000!
  const payload = {
    clientTxId,
    offlineCreatedAt: new Date().toISOString(),
    customerId: 'cust_maxed',
    paymentMethod: 'credit',
    items: [
      { productId: 'prod_milk', quantity: 1, unitPriceMinor: '25000' },
    ],
  };

  const result = await BusinessService.syncOfflineSale(businessId, userId, payload, client);

  assert.equal(result.status, 'conflict');
  assert.equal(result.conflictCode, 'CREDIT_LIMIT_EXCEEDED');
  assert.equal(db.sales.length, 0);
  assert.equal(db.customers.get('cust_maxed').current_balance_minor, '48000', 'Balance must not change');
});

// -----------------------------------------------------------------------------
// Test 5: Price Concurrency Mismatch
// -----------------------------------------------------------------------------
test('syncOfflineSale: flags PRICE_CHANGED conflict when catalog price was modified', async () => {
  const { db, createMockClient } = setupMockDatabase();
  const businessId = 'biz_test_1';
  const userId = 'usr_cashier_1';
  const clientTxId = crypto.randomUUID();
  const client = createMockClient();

  // In catalog, prod_milk is 25000. Offline cached price was 20000.
  const payload = {
    clientTxId,
    offlineCreatedAt: new Date().toISOString(),
    enforceCatalogPrice: true,
    items: [
      { productId: 'prod_milk', quantity: 1, unitPriceMinor: '20000' },
    ],
  };

  const result = await BusinessService.syncOfflineSale(businessId, userId, payload, client);

  assert.equal(result.status, 'conflict');
  assert.equal(result.conflictCode, 'PRICE_CHANGED');
  assert.equal(db.sales.length, 0);
});

// -----------------------------------------------------------------------------
// Test 6: Revoked or Inactive Cashier Authorization Rejection
// -----------------------------------------------------------------------------
test('syncOfflineSale: strictly rejects synchronization when cashier membership is revoked', async () => {
  const { db, createMockClient } = setupMockDatabase();
  const businessId = 'biz_test_1';
  const userId = 'usr_revoked_cashier';
  const clientTxId = crypto.randomUUID();
  const client = createMockClient();

  db.revokedUsers = new Set(['usr_revoked_cashier']);

  const payload = {
    clientTxId,
    offlineCreatedAt: new Date().toISOString(),
    items: [
      { productId: 'prod_milk', quantity: 1, unitPriceMinor: '25000' },
    ],
  };

  await assert.rejects(
    async () => {
      await BusinessService.syncOfflineSale(businessId, userId, payload, client);
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /Cashier authorization is invalid or has been revoked/);
      return true;
    }
  );

  assert.equal(db.sales.length, 0);
});

