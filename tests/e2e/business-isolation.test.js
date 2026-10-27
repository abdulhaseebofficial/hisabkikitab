/**
 * Business mode against the real backend, end to end.
 *
 * This suite exists because two defects made the entire Business API unusable
 * and nothing caught them: every browser test for Business mode mocks
 * `/api/**`, so the module had component-level coverage and no end-to-end
 * coverage at all.
 *
 *   1. The controller and the membership middleware read `req.user.id`. The
 *      user object is built by `toApi()`, which renames `id` to `_id`, so that
 *      property was always undefined. Creating a business wrote a NULL
 *      owner_id (23502). Listing businesses matched `bm.user_id = NULL`, which
 *      matches nothing -- so an owner was shown an empty list rather than an
 *      error, as though their businesses had never existed.
 *   2. `createBusiness` wrote its audit-log row on a pooled connection while
 *      the business row was still uncommitted on the transaction client, so
 *      biz_audit_logs.business_id failed its foreign key (23503) and rolled
 *      the creation back.
 *
 * Everything here goes through the real Express stack: a real registration, a
 * real JWT, and the real `protect` middleware building `req.user` from the
 * database. Nothing fabricates a user shape -- a fabricated `{ id }` is exactly
 * what hid defect 1 from the unit tests for so long.
 */

const crypto = require('node:crypto');
const { ok, section, heading, call, report, requireApi, bailIfRateLimited } = require('./helpers');

const password = 'TestPass123!';

/**
 * Every business-scoped route that takes no path parameter.
 *
 * The owner must be able to read all of them and a non-member must be refused
 * all of them. Listing them explicitly rather than probing a couple is the
 * point: defect 1 sat behind `bizScope.use(requireBusinessMember)`, so it
 * affected every one of these at once, and a sample of two would have proved
 * very little about the other thirty-five.
 */
const SCOPED_GETS = [
  ['business', ''],
  ['business', '/dashboard'],
  ['accounts', '/accounts'],
  ['inventory', '/products'],
  ['inventory', '/categories'],
  ['inventory', '/warehouses'],
  ['inventory', '/stock-counts'],
  ['inventory', '/stock-transfers'],
  ['khata', '/customers'],
  ['khata', '/suppliers'],
  ['khata', '/payments'],
  ['sales', '/sales'],
  ['sales', '/sales-returns'],
  ['purchases', '/purchases'],
  ['purchases', '/purchase-returns'],
  ['procurement', '/purchase-requests'],
  ['procurement', '/purchase-orders'],
  ['procurement', '/grns'],
  ['procurement', '/supplier-bills'],
  ['expenses', '/expenses'],
  ['expenses', '/recurring-expenses'],
  ['expenses', '/recurring-expenses/overdue'],
  ['expenses', '/recurring-expenses/upcoming'],
  ['expenses', '/budgets'],
  ['pos', '/shifts'],
  ['pos', '/shifts/active'],
  ['pos', '/pos/sync-history'],
  ['payroll', '/employees'],
  ['payroll', '/payroll'],
  ['payroll', '/attendance'],
  ['reports', '/reports/profit-and-loss'],
  ['reports', '/reports/balance-sheet'],
  ['reports', '/reports/trial-balance'],
  ['reports', '/reports/cash-flow'],
  ['reports', '/reports/aging/customers'],
  ['reports', '/reports/aging/suppliers'],
  ['notifications', '/notifications'],
];

const register = async (label) => {
  const email = `biz-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const res = await call('POST', '/auth/register', {
    name: `Business ${label}`,
    email,
    password,
    financeMode: 'student',
    acceptTerms: true,
  });
  bailIfRateLimited(res);
  const token = res.data?.data?.accessToken || res.data?.data?.token;
  ok(`account ${label} registers`, res.status === 201 && !!token, `-> ${res.status}`);
  return token;
};

const businessOf = (payload) => payload?.data?.business || payload?.data;
const listOf = (payload) => payload?.data?.businesses || payload?.data || [];

(async () => {
  await requireApi();
  heading('BUSINESS MODE: REAL BACKEND, REAL AUTH MIDDLEWARE');

  const owner = await register('owner');
  const outsider = await register('outsider');
  if (!owner || !outsider) return report();

  section('ONBOARDING: AN OWNER WITH NO BUSINESS SEES AN EMPTY LIST');
  const emptyAtFirst = await call('GET', '/business', undefined, owner);
  ok('a new account lists no businesses',
    emptyAtFirst.status === 200 && listOf(emptyAtFirst.data).length === 0,
    `-> ${emptyAtFirst.status}`);

  section('A BUSINESS CAN ACTUALLY BE CREATED');
  const created = await call('POST', '/business', {
    name: 'Isolation Test Shop',
    category: 'retail',
    businessType: 'retail',
    currency: 'PKR',
  }, owner, { idempotencyKey: crypto.randomUUID() });

  const business = businessOf(created.data);
  const businessId = business?._id || business?.id;
  ok('owner creates a business', created.status === 201 && !!businessId,
    `-> ${created.status} ${created.data?.message || ''}`);
  if (!businessId) return report();

  section('OWNER IDENTITY: THE BUSINESS COMES BACK TO ITS CREATOR');
  // This is the assertion defect 1 broke. The owner saw an empty list and no
  // error at all, as though the business had never been created.
  const ownerList = await call('GET', '/business', undefined, owner);
  const ownerBusinesses = listOf(ownerList.data);
  ok('the owner now lists exactly one business',
    ownerList.status === 200 && ownerBusinesses.length === 1,
    `${ownerBusinesses.length} returned`);
  ok('and it is the one just created',
    ownerBusinesses.some((row) => (row._id || row.id) === businessId));
  ok('with the creator recorded as its owner',
    ownerBusinesses[0]?.role === 'owner' || ownerBusinesses[0]?.ownerId || ownerBusinesses[0]?.owner_id,
    JSON.stringify(ownerBusinesses[0]?.role ?? null));

  section(`MEMBERSHIP AUTHORIZATION: OWNER READS ALL ${SCOPED_GETS.length} SCOPED ROUTES`);
  for (const [area, path] of SCOPED_GETS) {
    const res = await call('GET', `/business/${businessId}${path}`, undefined, owner);
    ok(`[${area}] owner GET ${path || '/:id'}`, res.status === 200,
      `-> ${res.status}${res.status !== 200 ? ' ' + (res.data?.message || '') : ''}`);
  }

  section(`A NON-MEMBER IS REFUSED BY THE SERVER ON ALL ${SCOPED_GETS.length}`);
  for (const [area, path] of SCOPED_GETS) {
    const res = await call('GET', `/business/${businessId}${path}`, undefined, outsider);
    ok(`[${area}] outsider GET ${path || '/:id'} refused`, res.status === 403, `-> ${res.status}`);
  }

  section('A NON-MEMBER CANNOT WRITE EITHER');
  for (const [label, path, body] of [
    ['customer', '/customers', { name: 'Should Not Exist' }],
    ['category', '/categories', { name: 'Should Not Exist' }],
    ['supplier', '/suppliers', { name: 'Should Not Exist' }],
  ]) {
    const res = await call('POST', `/business/${businessId}${path}`, body, outsider);
    ok(`outsider cannot create a ${label} in another owner's business`,
      res.status === 403, `-> ${res.status}`);
  }

  section('LISTING IS SCOPED TO THE CALLER');
  const outsiderList = await call('GET', '/business', undefined, outsider);
  const outsiderBusinesses = listOf(outsiderList.data);
  ok('an outsider lists none of the owner\'s businesses',
    outsiderList.status === 200 && outsiderBusinesses.length === 0,
    `${outsiderBusinesses.length} returned`);

  section('AN UNKNOWN BUSINESS ID IS REFUSED, NOT LEAKED');
  const unknown = await call('GET', `/business/${crypto.randomUUID()}`, undefined, owner);
  ok('a business the caller does not belong to is refused',
    unknown.status === 403 || unknown.status === 404, `-> ${unknown.status}`);

  const malformed = await call('GET', '/business/not-a-uuid', undefined, owner);
  ok('a malformed business id is rejected without a server error',
    malformed.status >= 400 && malformed.status < 500, `-> ${malformed.status}`);

  section('THE OTHER THREE MODES ARE UNAFFECTED');
  // The hotfix touches only the business module. These prove the shared auth
  // path still works for a personal account in the same run.
  const dash = await call('GET', '/dashboard/summary', undefined, outsider);
  ok('a personal dashboard still loads for a non-business account',
    dash.status === 200, `-> ${dash.status}`);
  const profile = await call('GET', '/auth/me', undefined, outsider);
  ok('auth/me still returns the account', profile.status === 200
    && !!(profile.data?.data?.user?._id), `-> ${profile.status}`);

  report();
})();
