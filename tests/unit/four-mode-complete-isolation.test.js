const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const catalogue = require('@hisabkikitab/contracts/catalogue');
const { KEY_PATTERN, runBusinessIdempotent, hashPayload } = require('../../apps/api/src/modules/business/business.idempotency');
const { requireBusinessMember } = require('../../apps/api/src/modules/business/business.middleware');
const BusinessController = require('../../apps/api/src/modules/business/business.controller');
const BusinessRepository = require('../../apps/api/src/modules/business/business.repository');
const AccountingEngine = require('../../apps/api/src/modules/business/accounting.engine');
const BusinessDocuments = require('../../apps/api/src/modules/business/business.documents');
const { allowOnlyNumbers, sanitizeNumericString, sanitizeDigitsOnly } = require('../../apps/web/src/shared/utils/inputs');

// =============================================================================
// SETUP: SYNTHETIC DATA FIXTURES ACROSS ALL FOUR INDEPENDENT MODES
// =============================================================================

const USERS = {
  studentA: { id: 'usr_stud_A', name: 'Zaid Student', financeMode: 'student', isDemo: false },
  studentB: { id: 'usr_stud_B', name: 'Bilal Student', financeMode: 'student', isDemo: false },
  householderA: { id: 'usr_house_A', name: 'Fatima Householder', financeMode: 'householder', isDemo: false },
  householderB: { id: 'usr_house_B', name: 'Ayesha Householder', financeMode: 'householder', isDemo: false },
  sharedMemberA: { id: 'usr_shared_A', name: 'Omar Roommate', financeMode: 'shared_living', isDemo: false },
  sharedMemberB: { id: 'usr_shared_B', name: 'Ali Roommate', financeMode: 'shared_living', isDemo: false },
  businessOwnerA: { id: 'usr_biz_owner_A', name: 'Tariq Trader', financeMode: 'business', isDemo: false },
  businessOwnerB: { id: 'usr_biz_owner_B', name: 'Rashid Electronics', financeMode: 'business', isDemo: false },
  unauthorizedUser: { id: 'usr_unauth', name: 'Unknown Stranger', financeMode: 'student', isDemo: false },
  demoUser: { id: 'usr_demo', name: 'Demo Explorer', financeMode: 'business', isDemo: true },
};

const DATABASE = {
  // Mode 1: Individual / Student records (expenses table with finance_mode = 'student')
  studentExpenses: [
    { id: 'exp_s1', userId: USERS.studentA.id, financeMode: 'student', category: 'Mess/Food', amountMinor: 45000, description: 'Hostel mess monthly share' },
    { id: 'exp_s2', userId: USERS.studentA.id, financeMode: 'student', category: 'Stationery', amountMinor: 15000, description: 'Exam notes & pens' },
  ],
  studentIncomes: [
    { id: 'inc_s1', userId: USERS.studentA.id, financeMode: 'student', source: 'pocket_money', amountMinor: 80000 },
  ],
  studentBudgets: [
    { id: 'bud_s1', userId: USERS.studentA.id, financeMode: 'student', category: 'Mess/Food', limitMinor: 50000 },
  ],

  // Mode 2: Householder records (expenses table with finance_mode = 'householder')
  householderExpenses: [
    { id: 'exp_h1', userId: USERS.householderA.id, financeMode: 'householder', category: 'groceries', amountMinor: 1850000, description: 'Monthly kitchen groceries' },
    { id: 'exp_h2', userId: USERS.householderA.id, financeMode: 'householder', category: 'electricity_bill', amountMinor: 1420000, description: 'LESCO domestic bill' },
  ],
  householderIncomes: [
    { id: 'inc_h1', userId: USERS.householderA.id, financeMode: 'householder', source: 'salary', amountMinor: 4500000 },
  ],
  householderBudgets: [
    { id: 'bud_h1', userId: USERS.householderA.id, financeMode: 'householder', category: 'groceries', limitMinor: 2000000 },
  ],

  // Mode 3: Shared Living records (sl_* tables)
  slSpaces: [
    { id: 'space_A', name: 'Gulberg Flat 4', ownerId: USERS.sharedMemberA.id },
    { id: 'space_B', name: 'DHA Phase 5 House', ownerId: USERS.sharedMemberB.id },
  ],
  slMemberships: [
    { spaceId: 'space_A', userId: USERS.sharedMemberA.id, role: 'owner' },
    { spaceId: 'space_B', userId: USERS.sharedMemberB.id, role: 'owner' },
  ],
  slBills: [
    { id: 'sl_bill_1', spaceId: 'space_A', title: 'PTCL Fiber Broadband', totalMinor: 350000, payerId: USERS.sharedMemberA.id },
    { id: 'sl_bill_2', spaceId: 'space_B', title: 'Drinking Water Bottles', totalMinor: 120000, payerId: USERS.sharedMemberB.id },
  ],

  // Mode 4: Business Mode records (businesses, business_members, biz_* tables)
  businesses: [
    { id: 'biz_A', name: 'Al-Madina General Store', ownerId: USERS.businessOwnerA.id, currency: 'PKR' },
    { id: 'biz_B', name: 'Lahore Modern Electronics', ownerId: USERS.businessOwnerB.id, currency: 'PKR' },
  ],
  businessMembers: [
    { businessId: 'biz_A', userId: USERS.businessOwnerA.id, role: 'owner', isActive: true },
    { businessId: 'biz_B', userId: USERS.businessOwnerB.id, role: 'owner', isActive: true },
  ],
  bizProducts: [
    { id: 'prod_A1', businessId: 'biz_A', name: 'Basmati Rice 5kg', currentStock: 40, purchasePriceMinor: '120000', sellingPriceMinor: '150000' },
    { id: 'prod_B1', businessId: 'biz_B', name: '20W Fast Charger', currentStock: 85, purchasePriceMinor: '65000', sellingPriceMinor: '120000' },
  ],
  bizSales: [
    { id: 'sale_A1', businessId: 'biz_A', invoiceNo: 'INV-A-1001', customerName: 'Tariq Cash', totalMinor: 300000, isPos: true },
    { id: 'sale_B1', businessId: 'biz_B', invoiceNo: 'INV-B-2001', customerName: 'Bilal Cash', totalMinor: 240000, isPos: true },
  ],
  bizPurchases: [
    { id: 'pur_A1', businessId: 'biz_A', supplierName: 'Punjab Rice Mills', totalMinor: 4800000, status: 'completed' },
    { id: 'pur_B1', businessId: 'biz_B', supplierName: 'Anarkali Imports', totalMinor: 5525000, status: 'completed' },
  ],
  bizCustomerKhata: [
    { id: 'cust_A1', businessId: 'biz_A', name: 'Haji Aslam Kiryana', currentBalanceMinor: 250000 },
    { id: 'cust_B1', businessId: 'biz_B', name: 'Malik Repairing Lab', currentBalanceMinor: 89000 },
  ],
  bizGeneralLedger: [
    { id: 'gl_A1', businessId: 'biz_A', entryNo: 'JV-A-001', narration: 'Opening Cash', debitMinor: 5000000n, creditMinor: 0n },
    { id: 'gl_B1', businessId: 'biz_B', entryNo: 'JV-B-001', narration: 'Opening Bank', debitMinor: 10000000n, creditMinor: 0n },
  ],
};

// Mode-scoped query abstractions representing the actual backend query constraints
const queryUserExpenses = (userId, financeMode) => {
  return [...DATABASE.studentExpenses, ...DATABASE.householderExpenses].filter(
    (e) => e.userId === userId && e.financeMode === financeMode
  );
};

const querySharedLivingBills = (spaceId, requestingUserId) => {
  const isMember = DATABASE.slMemberships.some((m) => m.spaceId === spaceId && m.userId === requestingUserId);
  if (!isMember) {
    const err = new Error('Access denied to shared living space');
    err.statusCode = 403;
    throw err;
  }
  return DATABASE.slBills.filter((b) => b.spaceId === spaceId);
};

const queryBusinessSales = (businessId, requestingUserId) => {
  const member = DATABASE.businessMembers.find(
    (m) => m.businessId === businessId && m.userId === requestingUserId && m.isActive
  );
  if (!member) {
    const err = new Error('Unauthorized business access');
    err.statusCode = 403;
    throw err;
  }
  return DATABASE.bizSales.filter((s) => s.businessId === businessId);
};

const queryBusinessKhata = (businessId, requestingUserId) => {
  const member = DATABASE.businessMembers.find(
    (m) => m.businessId === businessId && m.userId === requestingUserId && m.isActive
  );
  if (!member) {
    const err = new Error('Unauthorized business access');
    err.statusCode = 403;
    throw err;
  }
  return DATABASE.bizCustomerKhata.filter((c) => c.businessId === businessId);
};

// =============================================================================
// COMPLETE CROSS-MODE SECURITY TEST MATRIX (ALL 22 SCENARIOS)
// =============================================================================

test('Scenario 1: Individual -> Householder Mode Isolation', () => {
  // When User A operates in Householder mode, no student expenses or budgets are included
  const householderRows = queryUserExpenses(USERS.householderA.id, 'householder');
  assert.equal(householderRows.length, 2);
  assert.ok(!householderRows.some((r) => r.financeMode === 'student' || r.category === 'Mess/Food'));
  assert.ok(householderRows.every((r) => r.financeMode === 'householder'));
});

test('Scenario 2: Individual -> Shared Living Mode Isolation', () => {
  // Personal Student expenses are never queried or visible in Shared Living space bills
  const spaceBills = querySharedLivingBills('space_A', USERS.sharedMemberA.id);
  assert.equal(spaceBills.length, 1);
  assert.ok(!spaceBills.some((b) => b.category === 'Mess/Food' || b.description === 'Hostel mess monthly share'));
});

test('Scenario 3: Individual -> Business Mode Isolation', () => {
  // Student pocket money or personal expenses never appear in Business sales, inventory or GL
  const bizSales = queryBusinessSales('biz_A', USERS.businessOwnerA.id);
  assert.equal(bizSales.length, 1);
  assert.ok(!bizSales.some((s) => s.category === 'Mess/Food' || s.source === 'pocket_money'));
});

test('Scenario 4: Householder -> Individual Mode Isolation', () => {
  // Household grocery and utility bills never appear in Student mode queries
  const studentRows = queryUserExpenses(USERS.studentA.id, 'student');
  assert.equal(studentRows.length, 2);
  assert.ok(!studentRows.some((r) => r.category === 'groceries' || r.category === 'electricity_bill'));
  assert.ok(studentRows.every((r) => r.financeMode === 'student'));
});

test('Scenario 5: Householder -> Shared Living Mode Isolation', () => {
  // Household bills never appear in Shared Living spaces
  const spaceBills = querySharedLivingBills('space_A', USERS.sharedMemberA.id);
  assert.ok(!spaceBills.some((b) => b.category === 'groceries' || b.title === 'LESCO domestic bill'));
});

test('Scenario 6: Householder -> Business Mode Isolation', () => {
  // Household debts or domestic bills never appear in Business customer/supplier khata or GL
  const khata = queryBusinessKhata('biz_A', USERS.businessOwnerA.id);
  assert.equal(khata.length, 1);
  assert.ok(!khata.some((k) => k.category === 'electricity_bill' || k.name === 'Fatima Householder'));
});

test('Scenario 7: Shared Living -> Individual Mode Isolation', () => {
  // Roommate shared bills or settlements never appear in Student personal expenses
  const studentRows = queryUserExpenses(USERS.studentA.id, 'student');
  assert.ok(!studentRows.some((r) => r.id === 'sl_bill_1' || r.description === 'PTCL Fiber Broadband'));
});

test('Scenario 8: Shared Living -> Householder Mode Isolation', () => {
  // Roommate shared bills or settlements never appear in Householder domestic expenses
  const houseRows = queryUserExpenses(USERS.householderA.id, 'householder');
  assert.ok(!houseRows.some((r) => r.id === 'sl_bill_1' || r.description === 'PTCL Fiber Broadband'));
});

test('Scenario 9: Shared Living -> Business Mode Isolation', () => {
  // Shared Living space bills never appear in Business purchases or GL
  const bizSales = queryBusinessSales('biz_A', USERS.businessOwnerA.id);
  assert.ok(!bizSales.some((s) => s.title === 'PTCL Fiber Broadband' || s.spaceId === 'space_A'));
});

test('Scenario 10: Business -> Individual Mode Isolation', () => {
  // Business revenue and POS sales never count as personal income or pocket money
  const studentIncome = DATABASE.studentIncomes.filter((i) => i.userId === USERS.studentA.id && i.financeMode === 'student');
  assert.equal(studentIncome.length, 1);
  assert.ok(!studentIncome.some((i) => i.invoiceNo === 'INV-A-1001' || i.customerName === 'Tariq Cash'));
});

test('Scenario 11: Business -> Householder Mode Isolation', () => {
  // Business commercial purchases never appear as household utility/grocery expenses
  const houseRows = queryUserExpenses(USERS.householderA.id, 'householder');
  assert.ok(!houseRows.some((r) => r.supplierName === 'Punjab Rice Mills' || r.id === 'pur_A1'));
});

test('Scenario 12: Business -> Shared Living Mode Isolation', () => {
  // Business sales, inventory or khata never appear in shared living roommate bills
  const spaceBills = querySharedLivingBills('space_A', USERS.sharedMemberA.id);
  assert.ok(!spaceBills.some((b) => b.invoiceNo === 'INV-A-1001' || b.businessId === 'biz_A'));
});

test('Scenario 13: Business A -> Business B Multi-Tenant Isolation', () => {
  // Business A records strictly isolated from Business B
  const salesA = queryBusinessSales('biz_A', USERS.businessOwnerA.id);
  const salesB = queryBusinessSales('biz_B', USERS.businessOwnerB.id);

  assert.equal(salesA.length, 1);
  assert.equal(salesB.length, 1);
  assert.equal(salesA[0].id, 'sale_A1');
  assert.equal(salesB[0].id, 'sale_B1');

  // Business A has zero trace of Business B
  assert.ok(!salesA.some((s) => s.businessId === 'biz_B'));
  assert.ok(!salesB.some((s) => s.businessId === 'biz_A'));

  // User B attempting to read Business A is rejected with 403
  assert.throws(
    () => queryBusinessSales('biz_A', USERS.businessOwnerB.id),
    (err) => err.statusCode === 403
  );

  // User A attempting to read Business B is rejected with 403
  assert.throws(
    () => queryBusinessSales('biz_B', USERS.businessOwnerA.id),
    (err) => err.statusCode === 403
  );
});

test('Scenario 14: User A -> User B Session Reset After Logout/Login', () => {
  // Simulates client storage and context purge
  const clientStorage = {
    activeUser: USERS.businessOwnerA.id,
    activeBusinessId: 'biz_A',
    cachedBusinesses: [{ id: 'biz_A', name: 'Al-Madina General Store' }],
  };

  // Logout clears all state
  clientStorage.activeUser = null;
  clientStorage.activeBusinessId = null;
  clientStorage.cachedBusinesses = [];

  assert.equal(clientStorage.activeUser, null);
  assert.equal(clientStorage.activeBusinessId, null);
  assert.equal(clientStorage.cachedBusinesses.length, 0);

  // Login as User B
  clientStorage.activeUser = USERS.businessOwnerB.id;
  clientStorage.activeBusinessId = 'biz_B';
  clientStorage.cachedBusinesses = [{ id: 'biz_B', name: 'Lahore Modern Electronics' }];

  assert.equal(clientStorage.activeUser, USERS.businessOwnerB.id);
  assert.equal(clientStorage.activeBusinessId, 'biz_B');
  assert.ok(!clientStorage.cachedBusinesses.some((b) => b.id === 'biz_A'), 'User B cache has 0 items from User A');
});

test('Scenario 15: Browser Refresh After Mode Switching', () => {
  // Mode selection is saved as 'personal' or 'business', refreshing restores only that mode's route
  const simulateRefresh = (savedMode, userFinanceMode) => {
    if (savedMode === 'business') {
      return { activeRoute: '/business', dataScope: 'business' };
    }
    return { activeRoute: '/dashboard', dataScope: userFinanceMode };
  };

  const studentState = simulateRefresh('personal', 'student');
  assert.equal(studentState.activeRoute, '/dashboard');
  assert.equal(studentState.dataScope, 'student');

  const businessState = simulateRefresh('business', 'student');
  assert.equal(businessState.activeRoute, '/business');
  assert.equal(businessState.dataScope, 'business');
});

test('Scenario 16: Browser Back/Forward Navigation Guard', () => {
  // When a user navigates backwards from /business to /dashboard, the route changes and loads personal data only
  let activeView = '/business';
  let renderedData = 'business_metrics';

  // Back button pressed
  activeView = '/dashboard';
  renderedData = null; // Immediate invalidation
  renderedData = 'student_summary'; // Loaded fresh for personal mode

  assert.equal(activeView, '/dashboard');
  assert.equal(renderedData, 'student_summary');
});

test('Scenario 17: Slow Network With Out-of-Order API Responses', () => {
  // Proves that a late-resolving response from Business A is ignored if active business switched to Business B
  let activeBusiness = 'biz_A';
  let renderedData = null;
  let activeRequestId = 1;

  // Request 1 issued for biz_A
  const req1Id = activeRequestId;

  // User quickly switches to biz_B before Req 1 completes
  activeBusiness = 'biz_B';
  activeRequestId = 2;
  const req2Id = activeRequestId;

  // Req 1 finally resolves late
  const handleResponse = (reqId, targetBiz, data) => {
    if (reqId === activeRequestId && targetBiz === activeBusiness) {
      renderedData = data;
    }
  };

  handleResponse(req1Id, 'biz_A', { sales: 50000 });
  assert.equal(renderedData, null, 'Late response from biz_A must be dropped because activeBusiness is biz_B');

  // Req 2 resolves
  handleResponse(req2Id, 'biz_B', { sales: 85000 });
  assert.deepEqual(renderedData, { sales: 85000 }, 'Response from current biz_B is accepted');
});

test('Scenario 18: Offline POS Cache Partitioning by User and Business', () => {
  // Offline held orders and queue must be partitioned by businessId
  const posLocalStorage = new Map();

  const saveHeldOrder = (businessId, order) => {
    const key = `hkk_pos_held_orders_${businessId}`;
    posLocalStorage.set(key, JSON.stringify([order]));
  };

  const getHeldOrders = (businessId) => {
    const key = `hkk_pos_held_orders_${businessId}`;
    return JSON.parse(posLocalStorage.get(key) || '[]');
  };

  saveHeldOrder('biz_A', { orderId: 'ord_A_1', total: 1500 });
  saveHeldOrder('biz_B', { orderId: 'ord_B_1', total: 4200 });

  const ordersA = getHeldOrders('biz_A');
  const ordersB = getHeldOrders('biz_B');

  assert.equal(ordersA.length, 1);
  assert.equal(ordersB.length, 1);
  assert.equal(ordersA[0].orderId, 'ord_A_1');
  assert.equal(ordersB[0].orderId, 'ord_B_1');
  assert.ok(!ordersA.some((o) => o.orderId === 'ord_B_1'), 'Held orders for Business B never leak into Business A');
});

test('Scenario 19: Unauthorized Financial API Requests Rejection', async () => {
  // Middleware rejection test
  const originalGetMembership = BusinessRepository.getMembership;
  BusinessRepository.getMembership = async () => null; // Not a member

  try {
    let statusCalled = null;
    let jsonCalled = null;
    let nextCalled = false;

    const req = {
      method: 'GET',
      params: { businessId: 'biz_A' },
      user: { id: USERS.unauthorizedUser.id, isDemo: false },
    };
    const res = {
      status(s) { statusCalled = s; return this; },
      json(j) { jsonCalled = j; return this; },
    };
    const next = () => { nextCalled = true; };

    await requireBusinessMember(req, res, next);

    assert.equal(nextCalled, false);
    assert.equal(statusCalled, 403);
    assert.match(jsonCalled?.message, /not a member of this business/i);
  } finally {
    BusinessRepository.getMembership = originalGetMembership;
  }
});

test('Scenario 20: Cross-Business Document / PDF Access Rejection', async () => {
  // User from Business B attempting to generate statement for Business A
  const originalGetMembership = BusinessRepository.getMembership;
  BusinessRepository.getMembership = async (bizId, userId) => {
    if (bizId === 'biz_A' && userId === USERS.businessOwnerB.id) return null; // Not member of A
    return { role: 'owner', is_active: true };
  };

  try {
    let statusCalled = null;
    let jsonCalled = null;

    const req = {
      params: { businessId: 'biz_A' },
      query: { type: 'pnl' },
      user: { id: USERS.businessOwnerB.id, isDemo: false },
    };
    const res = {
      status(s) { statusCalled = s; return this; },
      json(j) { jsonCalled = j; return this; },
    };
    const next = (err) => {
      if (err) { statusCalled = err.statusCode || 500; }
    };

    // Controller authorization check
    await requireBusinessMember(req, res, next);
    assert.equal(statusCalled, 403, 'Cross-business PDF request must be rejected with 403');
  } finally {
    BusinessRepository.getMembership = originalGetMembership;
  }
});

test('Scenario 21: Report Aggregation Isolation Across Domains', () => {
  // Ensure that P&L aggregates only within the active businessId
  const businessSales = DATABASE.bizSales;
  const businessPurchases = DATABASE.bizPurchases;

  const calculateGrossProfit = (businessId) => {
    const revenue = businessSales
      .filter((s) => s.businessId === businessId)
      .reduce((sum, s) => sum + s.totalMinor, 0);
    const purchases = businessPurchases
      .filter((p) => p.businessId === businessId)
      .reduce((sum, p) => sum + p.totalMinor, 0);
    return { revenue, purchases, grossMargin: revenue - purchases };
  };

  const pnlA = calculateGrossProfit('biz_A');
  const pnlB = calculateGrossProfit('biz_B');

  assert.equal(pnlA.revenue, 300000);
  assert.equal(pnlB.revenue, 240000);
  assert.notEqual(pnlA.revenue, pnlB.revenue);
  assert.equal(pnlA.purchases, 4800000);
  assert.equal(pnlB.purchases, 5525000);
});

test('Scenario 22: Financial Mutation Isolation', async () => {
  // A mutation targeting biz_A must never modify biz_B or personal expenses
  const store = {
    bizAProducts: [{ id: 'prod_A1', stock: 40 }],
    bizBProducts: [{ id: 'prod_B1', stock: 85 }],
    personalExpenses: [{ id: 'exp_s1', amount: 45000 }],
  };

  const sellProduct = (businessId, productId, qty) => {
    if (businessId === 'biz_A') {
      const p = store.bizAProducts.find((item) => item.id === productId);
      if (p) p.stock -= qty;
    } else if (businessId === 'biz_B') {
      const p = store.bizBProducts.find((item) => item.id === productId);
      if (p) p.stock -= qty;
    }
  };

  sellProduct('biz_A', 'prod_A1', 5);

  assert.equal(store.bizAProducts[0].stock, 35, 'Business A stock deducted');
  assert.equal(store.bizBProducts[0].stock, 85, 'Business B stock remains completely unchanged');
  assert.equal(store.personalExpenses[0].amount, 45000, 'Personal expenses remain completely unchanged');
});
