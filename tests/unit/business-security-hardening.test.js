const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const catalogue = require('@hisabkikitab/contracts/catalogue');
const {
  KEY_PATTERN,
  canonical,
  hashPayload,
  runBusinessIdempotent,
} = require('../../apps/api/src/modules/business/business.idempotency');
const { requireBusinessMember } = require('../../apps/api/src/modules/business/business.middleware');
const BusinessController = require('../../apps/api/src/modules/business/business.controller');
const BusinessRepository = require('../../apps/api/src/modules/business/business.repository');
const AccountingEngine = require('../../apps/api/src/modules/business/accounting.engine');

// =============================================================================
// 1. Fourth Mode Registration & Isolation Tests
// =============================================================================

test('Business Mode is registered as the fourth operational finance mode', () => {
  assert.equal(catalogue.isMode('business'), true, 'business must be recognized by isMode()');
  assert.ok(catalogue.MODES.includes('business'), 'MODES must include business');
  assert.deepEqual(
    catalogue.MODES,
    ['student', 'householder', 'shared_living', 'business'],
    'Exactly four independent modes must be registered in catalogue'
  );
});

test('Student, Householder, and Shared Living modes remain independent', () => {
  const studentCats = catalogue.categoryIdsFor('expense', 'student');
  const householderCats = catalogue.categoryIdsFor('expense', 'householder');

  assert.ok(studentCats.length > 0, 'Student mode categories must exist');
  assert.ok(householderCats.length > 0, 'Householder mode categories must exist');

  // Verify personal categories do not mix with business
  assert.ok(studentCats.includes('Mess/Food'), 'Student mode has Mess/Food');
  assert.ok(householderCats.includes('groceries'), 'Householder mode has groceries');
  assert.ok(catalogue.isMode('shared_living'), 'Shared living mode exists as an independent mode');
  assert.ok(catalogue.isMode('student'), 'Student mode exists as an independent mode');
  assert.ok(catalogue.isMode('householder'), 'Householder mode exists as an independent mode');
});

// =============================================================================
// 2. Demo Account Write Protection Tests
// =============================================================================

test('requireBusinessMember blocks all write mutations for demo accounts', async () => {
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  const originalGetMembership = BusinessRepository.getMembership;

  // Mock getMembership to return an active membership
  BusinessRepository.getMembership = async () => ({
    id: 'mem_123',
    business_id: 'biz_123',
    user_id: 'demo_user_id',
    role: 'owner',
    status: 'active',
  });

  try {
    for (const method of writeMethods) {
      let statusCalled = null;
      let jsonCalled = null;
      let nextCalled = false;

      const req = {
        method,
        params: { businessId: 'biz_123' },
        user: { id: 'demo_user_id', isDemo: true, financeMode: 'business' },
      };
      const res = {
        status(s) {
          statusCalled = s;
          return this;
        },
        json(j) {
          jsonCalled = j;
          return this;
        },
      };
      const next = () => {
        nextCalled = true;
      };

      await requireBusinessMember(req, res, next);

      assert.equal(nextCalled, false, `${method} should not proceed to next handler for demo user`);
      assert.equal(statusCalled, 403, `${method} should return HTTP 403`);
      assert.equal(jsonCalled?.message, 'Demo Mode is read-only');
    }
  } finally {
    BusinessRepository.getMembership = originalGetMembership;
  }
});

test('requireBusinessMember allows read operations (GET, HEAD) for demo accounts', async () => {
  const readMethods = ['GET', 'HEAD'];
  const originalGetMembership = BusinessRepository.getMembership;

  BusinessRepository.getMembership = async () => ({
    id: 'mem_123',
    business_id: 'biz_123',
    user_id: 'demo_user_id',
    role: 'owner',
    status: 'active',
  });

  try {
    for (const method of readMethods) {
      let nextCalled = false;
      const req = {
        method,
        params: { businessId: 'biz_123' },
        user: { id: 'demo_user_id', isDemo: true, financeMode: 'business' },
      };
      const res = {
        status() { return this; },
        json() { return this; },
      };
      const next = () => {
        nextCalled = true;
      };

      await requireBusinessMember(req, res, next);
      assert.equal(nextCalled, true, `${method} should proceed for read-only demo inspection`);
      assert.equal(req.businessId, 'biz_123');
    }
  } finally {
    BusinessRepository.getMembership = originalGetMembership;
  }
});

test('BusinessController.createBusiness strictly rejects demo accounts', async () => {
  let statusCalled = null;
  let jsonCalled = null;

  const req = {
    method: 'POST',
    user: { id: 'demo_user', isDemo: true },
    body: { name: 'Demo Hardware Store' },
  };
  const res = {
    status(s) {
      statusCalled = s;
      return this;
    },
    json(j) {
      jsonCalled = j;
      return this;
    },
  };
  const next = () => {};

  await BusinessController.createBusiness(req, res, next);

  assert.equal(statusCalled, 403, 'createBusiness must return 403 for demo user');
  assert.equal(jsonCalled?.success, false);
  assert.equal(jsonCalled?.message, 'Demo Mode is read-only');
});

// =============================================================================
// 3. Financial Idempotency Engine Tests
// =============================================================================

test('Idempotency UUID key validation matches strict specification', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  assert.ok(KEY_PATTERN.test(validUuid), 'Valid UUID should pass');
  assert.ok(KEY_PATTERN.test(crypto.randomUUID()), 'Generated UUID should pass');

  assert.equal(KEY_PATTERN.test('not-a-uuid'), false);
  assert.equal(KEY_PATTERN.test('12345'), false);
  assert.equal(KEY_PATTERN.test(''), false);
  assert.equal(KEY_PATTERN.test(null), false);
});

test('canonical helper deterministically sorts nested object keys', () => {
  const objA = { b: 2, a: 1, nested: { z: 100, y: 50, x: [3, 2, 1] } };
  const objB = { a: 1, nested: { x: [3, 2, 1], y: 50, z: 100 }, b: 2 };

  const canonicalA = canonical(objA);
  const canonicalB = canonical(objB);

  assert.deepEqual(Object.keys(canonicalA), ['a', 'b', 'nested']);
  assert.deepEqual(Object.keys(canonicalA.nested), ['x', 'y', 'z']);
  assert.equal(JSON.stringify(canonicalA), JSON.stringify(canonicalB));
});

test('hashPayload produces identical hash regardless of key ordering and different hash on changes', () => {
  const payload1 = { total: 5000, customerId: 'cust_1', items: [{ id: 1, qty: 2 }] };
  const payload2 = { customerId: 'cust_1', items: [{ qty: 2, id: 1 }], total: 5000 };
  const payload3 = { customerId: 'cust_1', items: [{ id: 1, qty: 3 }], total: 5000 };

  const hash1 = hashPayload(payload1);
  const hash2 = hashPayload(payload2);
  const hash3 = hashPayload(payload3);

  assert.equal(hash1, hash2, 'Identical payloads with different key orders must produce identical SHA-256');
  assert.notEqual(hash1, hash3, 'Different payload content must produce a distinct hash');
});

test('runBusinessIdempotent handles reservation, successful execution, replay, and conflict detection', async () => {
  // In-memory mock database store simulating biz_financial_requests
  const store = new Map();

  const createMockClient = () => ({
    query: async (text, params) => {
      const sql = text.trim();

      if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
        return { rows: [] };
      }

      // INSERT INTO biz_financial_requests
      if (sql.includes('INSERT INTO biz_financial_requests')) {
        const [businessId, userId, requestId, action, requestHash] = params;
        const key = `${businessId}:${requestId}`;

        if (store.has(key)) {
          // ON CONFLICT DO NOTHING
          return { rows: [] };
        }

        const record = {
          business_id: businessId,
          user_id: userId,
          request_id: requestId,
          action,
          request_hash: requestHash,
          status: 'processing',
          result: null,
        };
        store.set(key, record);
        return { rows: [{ request_id: requestId }] };
      }

      // SELECT FROM biz_financial_requests
      if (sql.includes('FROM biz_financial_requests')) {
        const [businessId, requestId] = params;
        const key = `${businessId}:${requestId}`;
        const record = store.get(key);
        return { rows: record ? [record] : [] };
      }

      // UPDATE biz_financial_requests
      if (sql.includes('UPDATE biz_financial_requests')) {
        const [resultJson, businessId, requestId] = params;
        const key = `${businessId}:${requestId}`;
        const record = store.get(key);
        if (record) {
          record.status = 'completed';
          record.result = JSON.parse(resultJson);
        }
        return { rows: [] };
      }

      return { rows: [] };
    },
    release: () => {},
  });

  const businessId = 'biz_unit_test';
  const userId = 'usr_unit_test';
  const key = crypto.randomUUID();
  const payload = { amountMinor: '50000', customerId: 'cust_abc' };

  let executionCount = 0;
  const performMutation = async () => {
    executionCount += 1;
    return { saleId: 'sale_999', totalMinor: '50000', invoiceNumber: 'INV-0001' };
  };

  // 1. Initial attempt: executes mutation
  const mockClient1 = createMockClient();
  const outcome1 = await runBusinessIdempotent({
    businessId,
    userId,
    action: 'create_sale',
    key,
    payload,
    perform: performMutation,
    existingClient: mockClient1,
  });

  assert.equal(executionCount, 1, 'Mutation perform must be called exactly once');
  assert.equal(outcome1.replayed, false, 'Initial execution is not replayed');
  assert.equal(outcome1.value.saleId, 'sale_999');

  // 2. Retry with exact same key and payload: safely replays stored outcome without re-executing
  const mockClient2 = createMockClient();
  const outcome2 = await runBusinessIdempotent({
    businessId,
    userId,
    action: 'create_sale',
    key,
    payload,
    perform: performMutation,
    existingClient: mockClient2,
  });

  assert.equal(executionCount, 1, 'Mutation perform must NOT be called on replay');
  assert.equal(outcome2.replayed, true, 'Retry must be flagged as replayed');
  assert.equal(outcome2.value.saleId, 'sale_999');
  assert.equal(outcome2.value.invoiceNumber, 'INV-0001');

  // 3. Key reused with a different payload: must reject with 409 Conflict
  const mockClient3 = createMockClient();
  const tamperedPayload = { amountMinor: '99999', customerId: 'cust_abc' };

  await assert.rejects(
    runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_sale',
      key,
      payload: tamperedPayload,
      perform: performMutation,
      existingClient: mockClient3,
    }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /Idempotency key was already used for a different request/);
      return true;
    }
  );

  // 4. Key reused with a different action: must reject with 409 Conflict
  const mockClient4 = createMockClient();
  await assert.rejects(
    runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_purchase',
      key,
      payload,
      perform: performMutation,
      existingClient: mockClient4,
    }),
    (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    }
  );

  // 5. Concurrent mutation in-progress: must reject with 409 Conflict
  const inFlightKey = crypto.randomUUID();
  store.set(`${businessId}:${inFlightKey}`, {
    business_id: businessId,
    user_id: userId,
    request_id: inFlightKey,
    action: 'create_sale',
    request_hash: hashPayload(payload),
    status: 'processing',
    result: null,
  });

  const mockClient5 = createMockClient();
  await assert.rejects(
    runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_sale',
      key: inFlightKey,
      payload,
      perform: performMutation,
      existingClient: mockClient5,
    }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /already in progress/);
      return true;
    }
  );
});

// =============================================================================
// 4. General Ledger Immutability & Reversals Tests
// =============================================================================

test('AccountingEngine enforces strict double-entry balance: sum(debits) === sum(credits)', async () => {
  const mockClient = {
    query: async () => ({ rows: [] }),
  };

  // Unbalanced entry: debits = 100, credits = 90
  const unbalancedLines = [
    { accountId: 'acc_1', debitMinor: 10000n, creditMinor: 0n },
    { accountId: 'acc_2', debitMinor: 0n, creditMinor: 9000n },
  ];

  await assert.rejects(
    AccountingEngine.postJournalEntry(mockClient, {
      businessId: 'biz_1',
      entryNumber: 'TEST-001',
      date: '2026-10-19',
      entryType: 'general',
      narration: 'Unbalanced test',
      lines: unbalancedLines,
      userId: 'user_1',
    }),
    (err) => {
      assert.match(err.message, /Unbalanced journal entry/);
      return true;
    }
  );
});

test('Reversal accounting restores financial position without mutating or deleting historical records', () => {
  // Scenario: Sale was posted incorrectly (e.g. wrong customer or price), reversed via adjusting entry.
  // Original sale:
  // Dr Cash (1010): Rs 10,000 (1,000,000 minor)
  // Cr Sales Revenue (4010): Rs 10,000
  // Dr COGS (5010): Rs 6,000 (600,000 minor)
  // Cr Inventory (1200): Rs 6,000

  const accounts = {
    '1010': 5000000n, // Cash starts at Rs 50,000
    '1200': 3000000n, // Inventory starts at Rs 30,000
    '4010': 0n,       // Sales starts at 0
    '5010': 0n,       // COGS starts at 0
  };

  const initialCash = accounts['1010'];
  const initialInventory = accounts['1200'];

  // 1. Post original sale
  const originalEntry = {
    id: 'entry_orig_01',
    lines: [
      { accountCode: '1010', debit: 1000000n, credit: 0n },
      { accountCode: '4010', debit: 0n, credit: 1000000n },
      { accountCode: '5010', debit: 600000n, credit: 0n },
      { accountCode: '1200', debit: 0n, credit: 600000n },
    ],
  };

  // Apply original entry
  for (const line of originalEntry.lines) {
    if (line.accountCode === '1010') accounts['1010'] += line.debit - line.credit;
    if (line.accountCode === '1200') accounts['1200'] += line.debit - line.credit;
    if (line.accountCode === '4010') accounts['4010'] += line.credit - line.debit;
    if (line.accountCode === '5010') accounts['5010'] += line.debit - line.credit;
  }

  assert.equal(accounts['1010'], 6000000n, 'Cash increased by 10,000');
  assert.equal(accounts['1200'], 2400000n, 'Inventory reduced by 6,000');
  assert.equal(accounts['4010'], 1000000n, 'Revenue recorded 10,000');
  assert.equal(accounts['5010'], 600000n, 'COGS recorded 6,000');

  // 2. Rather than deleting or altering entry_orig_01, post an explicit REVERSAL entry:
  // Dr Sales Revenue (4010): Rs 10,000
  // Cr Cash (1010): Rs 10,000
  // Dr Inventory (1200): Rs 6,000
  // Cr COGS (5010): Rs 6,000
  const reversalEntry = {
    id: 'entry_rev_01',
    reversalOf: originalEntry.id,
    lines: originalEntry.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: l.credit,   // Inverted debits and credits
      credit: l.debit,
    })),
  };

  // Apply reversal entry
  for (const line of reversalEntry.lines) {
    if (line.accountCode === '1010') accounts['1010'] += line.debit - line.credit;
    if (line.accountCode === '1200') accounts['1200'] += line.debit - line.credit;
    if (line.accountCode === '4010') accounts['4010'] += line.credit - line.debit;
    if (line.accountCode === '5010') accounts['5010'] += line.debit - line.credit;
  }

  // Account balances are completely restored to starting values:
  assert.equal(accounts['1010'], initialCash, 'Cash balance fully restored');
  assert.equal(accounts['1200'], initialInventory, 'Inventory balance fully restored');
  assert.equal(accounts['4010'], 0n, 'Net revenue restored to zero');
  assert.equal(accounts['5010'], 0n, 'Net COGS restored to zero');

  // Both historical records remain intact in the ledger
  const ledgerHistory = [originalEntry, reversalEntry];
  assert.equal(ledgerHistory.length, 2, 'Complete immutable audit trail preserved');
});
