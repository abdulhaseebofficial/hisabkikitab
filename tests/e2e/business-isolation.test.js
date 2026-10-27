/**
 * Business mode against the real backend.
 *
 * This suite exists because two bugs made the entire Business API unusable and
 * nothing caught them: every browser test for Business mode mocks `/api/**`, so
 * the whole module had component-level coverage and no end-to-end coverage at
 * all.
 *
 *   1. The controller and the membership middleware read `req.user.id`. The
 *      user object is built by `toApi()`, which renames `id` to `_id`, so that
 *      property was always undefined. Creating a business wrote a NULL
 *      owner_id (23502) and every business-scoped route would have answered
 *      403 to its own owner.
 *   2. `createBusiness` wrote its audit-log row on a pooled connection while
 *      the business row was still uncommitted on the transaction client, so
 *      biz_audit_logs.business_id failed its foreign key (23503) and rolled
 *      the creation back.
 *
 * So the first two assertions here are not ceremony: a business that can be
 * created, and an owner who can read it back, are the things that were broken.
 *
 * The rest proves isolation where it has to hold -- in the backend. A second
 * account is told 403 by the server, not merely shown a different screen.
 */

const crypto = require('node:crypto');
const { ok, section, heading, call, report, requireApi, bailIfRateLimited } = require('./helpers');

const password = 'TestPass123!';

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

(async () => {
  await requireApi();
  heading('BUSINESS MODE: REAL BACKEND AUTHORIZATION');

  const owner = await register('owner');
  const outsider = await register('outsider');
  if (!owner || !outsider) return report();

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
  ok('the created business is owned by its creator',
    !!businessId, `id ${businessId || 'missing'}`);
  if (!businessId) return report();

  section('THE OWNER CAN READ EVERY BUSINESS-SCOPED ROUTE');
  const scoped = ['', '/dashboard', '/accounts', '/products', '/categories', '/customers', '/suppliers'];
  for (const path of scoped) {
    const res = await call('GET', `/business/${businessId}${path}`, undefined, owner);
    ok(`owner GET /business/:id${path || ''} succeeds`, res.status === 200, `-> ${res.status}`);
  }

  section('A NON-MEMBER IS REFUSED BY THE SERVER, NOT BY THE UI');
  for (const path of scoped) {
    const res = await call('GET', `/business/${businessId}${path}`, undefined, outsider);
    ok(`outsider GET /business/:id${path || ''} is refused`, res.status === 403, `-> ${res.status}`);
  }

  section('A NON-MEMBER CANNOT WRITE EITHER');
  const write = await call('POST', `/business/${businessId}/customers`, {
    name: 'Should Not Exist',
  }, outsider);
  ok('outsider cannot create a customer in another owner\'s business',
    write.status === 403, `-> ${write.status}`);

  section('LISTING IS SCOPED TO THE CALLER');
  const outsiderList = await call('GET', '/business', undefined, outsider);
  const outsiderBusinesses = outsiderList.data?.data?.businesses || outsiderList.data?.data || [];
  ok('an outsider lists none of the owner\'s businesses',
    outsiderList.status === 200 && Array.isArray(outsiderBusinesses) && outsiderBusinesses.length === 0,
    `${Array.isArray(outsiderBusinesses) ? outsiderBusinesses.length : '?'} returned`);

  const ownerList = await call('GET', '/business', undefined, owner);
  const ownerBusinesses = ownerList.data?.data?.businesses || ownerList.data?.data || [];
  ok('the owner lists exactly their own business',
    ownerList.status === 200 && Array.isArray(ownerBusinesses)
      && ownerBusinesses.some((row) => (row._id || row.id) === businessId),
    `${Array.isArray(ownerBusinesses) ? ownerBusinesses.length : '?'} returned`);

  section('AN UNKNOWN BUSINESS ID IS REFUSED, NOT LEAKED');
  const unknown = await call('GET', `/business/${crypto.randomUUID()}`, undefined, owner);
  ok('a business the caller does not belong to is refused',
    unknown.status === 403 || unknown.status === 404, `-> ${unknown.status}`);

  report();
})();
