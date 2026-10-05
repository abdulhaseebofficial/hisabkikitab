const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
require('../../scripts/require-test-database');
const BASE = process.env.HW_API || 'http://localhost:5000/api';
const password = 'SharedTest123!';

test('Shared Living journey through the running application', { timeout: 600000 }, async (t) => {
  const accounts = [];
  const request = async (method, path, body, who = 0) => {
    if (method === 'POST' && /\/months\/[^/]+\/(expenses|bills|payments)$/.test(path) && body)
      body = { request_id: crypto.randomUUID(), ...body };
    const response = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json',
        ...((path === '/profile/onboarding' ||
          (method === 'POST' && /^\/(expenses|income|debts|goals)$/.test(path)))
          ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
        ...(accounts[who]?.token ? { Authorization: `Bearer ${accounts[who].token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() };
  };
  const call = async (method, path, body, who = 0, status = 200) => {
    const result = await request(method, path, body, who);
    assert.equal(result.status, status, `${method} ${path}: ${result.body.message}`);
    return result.body.data;
  };
  let space, base, period, members, categories, code;
  await t.test('registration, onboarding, group creation and creator role', async () => {
    for (const name of ['Owner', 'Viewer', 'Outsider']) {
      const email = `sl-${crypto.randomUUID()}@example.test`;
      const r = await call('POST', '/auth/register', { name, email, password, confirmPassword: password, acceptTerms: true }, -1, 201);
      accounts.push({ email, token: r.accessToken });
      await call('POST', '/profile/onboarding', { financeMode: 'shared_living', language: 'en', monthlyIncome: 0, currency: 'PKR' }, accounts.length - 1);
    }
    space = await call('POST', '/shared-living/spaces', { name: 'Journey Flat', residents: 2, month: '2024-02', budget: '1000', food_budget: '500', currency: 'PKR', role: 'viewer' });
    assert.equal(space.role, 'admin');
    code = space.invite.code;
    assert.match(code, /^[A-HJ-NP-Z2-9]{7}$/);
    base = `/shared-living/spaces/${space.id}`;
    period = `${base}/months/2024-02`;
    categories = (await call('GET', period)).categories;
  });
  if (!space) throw new Error('Journey fixture setup failed');
  await t.test('concurrent joins yield one viewer membership and reveal no invite secrets', async () => {
    await Promise.all(Array.from({ length: 3 }, () => call('POST', '/shared-living/join', { code, role: 'admin' }, 1)));
    const spaces = await call('GET', '/shared-living/spaces', undefined, 1);
    assert.equal(spaces.length, 1);
    assert.equal(spaces[0].role, 'viewer');
    const dashboard = await call('GET', period, undefined, 1);
    assert.ok(!JSON.stringify(dashboard).includes(code));
    assert.ok(!JSON.stringify(dashboard).includes('code_hash'));
  });
  await t.test('invalid, malformed, regenerated and disabled codes fail safely', async () => {
    for (const invalid of ['', null, {}, ['bad'], 'x'.repeat(42), 'x'.repeat(43), '<script>']) {
      const r = await request('POST', '/shared-living/join', { code: invalid }, 2);
      assert.equal(r.status, 400);
      assert.equal(r.body.message, 'shared.invalidCode');
    }
    const next = await call('POST', `${base}/invite`, {});
    assert.notEqual(next.code, code);
    assert.equal((await request('POST', '/shared-living/join', { code }, 2)).status, 400);
    await call('POST', `${base}/invite`, { disabled: true });
    assert.equal((await request('POST', '/shared-living/join', { code: next.code }, 2)).status, 400);
  });
  await t.test('admin adds and edits residents; group boundaries are enforced', async () => {
    members = [];
    for (const name of ['Ali', 'Bilal']) members.push(await call('POST', `${base}/members`, { name, joined_on: '2024-02-01', weight: '1' }));
    await call('PATCH', `${base}/members/${members[1].id}`, { name: 'Bilal', joined_on: '2024-02-01', weight: '2' });
    assert.equal((await request('GET', period, undefined, 2)).status, 404);
    assert.equal((await request('PATCH', `${base}/members/${members[0].id}`, {}, 2)).status, 404);
    const foreign = await call('POST', '/shared-living/spaces', { name: 'Other Flat', residents: 1, month: '2024-02', budget: '100', currency: 'PKR' }, 2);
    assert.notEqual(foreign.invite.code, code);
    const foreignCategory = (await call('GET', `/shared-living/spaces/${foreign.id}/months/2024-02`, undefined, 2)).categories[0];
    assert.equal((await request('POST', `${period}/expenses`, { category_id: foreignCategory.id, date: '2024-02-01', amount: '1' })).status, 400);
  });
  await t.test('viewer cannot mutate any group endpoint, including splits and paid state', async () => {
    const id = members[0].id;
    const paths = [['PATCH', base], ['POST', `${base}/invite`], ['PUT', period], ['POST', `${base}/members`], ['PATCH', `${base}/members/${id}`], ['DELETE', `${base}/members/${id}`], ['POST', `${base}/categories`], ['PATCH', `${base}/categories/${id}`], ['POST', `${period}/copy-bills`], ['POST', `${period}/preview`]];
    for (const kind of ['expenses', 'bills', 'payments']) for (const method of ['POST', 'PATCH', 'DELETE']) paths.push([method, `${period}/${kind}${method === 'POST' ? '' : `/${id}`}`]);
    for (const [method, path] of paths) assert.equal((await request(method, path, { role: 'admin', paid: true }, 1)).status, 403, `${method} ${path}`);
    // Receipt uploads were intentionally removed; no actor can call this route.
    assert.equal((await request('PUT', `${period}/bills/${id}/receipt`, {}, 1)).status, 404);
  });
  await t.test('concurrent and retried financial creates are idempotent; changed payload conflicts', async () => {
    const food = categories.find((c) => c.kind === 'food');
    const rent = categories.find((c) => c.stable_key === 'rent');
    for (const [kind, body] of [
      ['expenses', { category_id: food.id, date: '2024-02-10', amount: '10.01', method: 'equal' }],
      ['bills', { category_id: rent.id, name: 'Rent', date: '2024-02-10', due_date: '2024-02-20', amount: '20.00', paid: false }],
      ['payments', { member_id: members[0].id, date: '2024-02-10', amount: '50.00', method: 'cash' }],
    ]) {
      const payload = { ...body, request_id: crypto.randomUUID() };
      const rows = await Promise.all([call('POST', `${period}/${kind}`, payload), call('POST', `${period}/${kind}`, payload)]);
      assert.equal(rows[0].id, rows[1].id, `${kind} duplicated`);
      assert.equal((await call('POST', `${period}/${kind}`, payload)).id, rows[0].id);
      assert.equal((await request('POST', `${period}/${kind}`, { ...payload, amount: '99' })).status, 409);
    }
  });
  await t.test('unequal contributions and direct member-paid bills produce exact balances', async () => {
    await call('POST', `${period}/payments`, { member_id: members[1].id, date: '2024-02-10', amount: '25.00', method: 'bank' });
    const utility = categories.find((c) => c.stable_key === 'electricity');
    await call('POST', `${period}/bills`, { category_id: utility.id, name: 'Electricity', date: '2024-02-10', due_date: '2024-02-10', amount: '10.00', paid: true, paid_by: members[1].id, method: 'custom', values: { [members[0].id]: '3.00', [members[1].id]: '7.00' } });
    const dash = await call('GET', period);
    assert.equal(dash.summary.collected, '75.00');
    assert.equal(dash.summary.spent, '40.01');
    assert.equal(dash.summary.cash, '64.99');
    assert.equal(dash.summary.remainingBudget, '959.99');
    assert.equal(dash.summary.daily[9].amount, '10.01');
    const bilal = dash.summary.members.find((m) => m.id === members[1].id);
    assert.equal(bilal.paidDirect, '10.00');
    assert.equal(Math.round(Number(bilal.balance) * 100), 3500 - Math.round(Number(bilal.assigned) * 100));
  });
  await t.test('month changes, closure and archived residents preserve historical records', async () => {
    const before = await call('GET', period);
    await call('DELETE', `${base}/members/${members[0].id}`, { left_on: '2024-02-20' });
    await call('PUT', `${base}/months/2024-03`, { budget: '1000' });
    const march = await call('GET', `${base}/months/2024-03`);
    assert.equal(march.summary.spent, '0.00');
    assert.equal(march.summary.collected, '0.00');
    const after = await call('GET', period);
    assert.deepEqual(after.shares, before.shares);
    assert.deepEqual(after.payments, before.payments);
    await call('PUT', period, { closed: true });
    assert.equal((await request('POST', `${period}/payments`, {})).status, 409);
    await call('PUT', period, { closed: false });
  });
  await t.test('bill copy uses source identity across concurrent requests and retains manual lookalikes', async () => {
    const rent = categories.find((category) => category.stable_key === 'rent');
    const sourceBody = {
      category_id: rent.id, name: 'Same rent', date: '2024-02-10',
      due_date: '2024-02-12', amount: '10.00', recurring: true,
    };
    const sources = [];
    for (let i = 0; i < 2; i++)
      sources.push(await call('POST', `${period}/bills`, sourceBody));
    const marchPath = `${base}/months/2024-03`;
    const manual = await call('POST', `${marchPath}/bills`, {
      ...sourceBody, date: '2024-03-10', due_date: '2024-03-12',
    });
    const attempts = await Promise.all([
      call('POST', `${marchPath}/copy-bills`, { from: '2024-02' }),
      call('POST', `${marchPath}/copy-bills`, { from: '2024-02' }),
    ]);
    assert.deepEqual(attempts.map((rows) => rows.length).sort(), [0, 2]);
    const copied = attempts.flat();
    assert.deepEqual(new Set(copied.map((bill) => bill.recurring_origin_id)),
      new Set(sources.map((bill) => bill.id)));
    assert.equal(copied.some((bill) => sources.some((source) => source.request_id === bill.request_id)), false);
    assert.equal((await call('POST', `${marchPath}/copy-bills`, { from: '2024-02' })).length, 0);
    const march = await call('GET', marchPath);
    assert.equal(march.bills.length, 3);
    assert.ok(march.bills.some((bill) => bill.id === manual.id && bill.recurring_origin_id === null));
    await call('POST', `${base}/months/2024-04/start`, {});
    const april = await call('GET', `${base}/months/2024-04`);
    assert.deepEqual(new Set(april.bills.map((bill) => bill.recurring_origin_id)),
      new Set([...sources.map((bill) => bill.id), manual.id]));
  });
  await t.test('sign-in restores viewer role; Student and Householder records survive switches', async () => {
    const login = await call('POST', '/auth/login', { email: accounts[1].email, password }, -1);
    accounts[1].token = login.accessToken;
    assert.equal((await call('GET', period, undefined, 1)).space.role, 'viewer');
    for (const [mode, category] of [['student', 'Mess/Food'], ['householder', 'groceries']]) {
      await call('PUT', '/profile', { financeMode: mode });
      const created = await call('POST', '/expenses', { amount: 123, category, description: mode, date: new Date().toISOString() }, 0, 201);
      await call('PUT', '/profile', { financeMode: 'shared_living' });
      assert.equal((await request('GET', '/expenses')).status, 403);
      await call('PUT', '/profile', { financeMode: mode });
      assert.ok((await call('GET', '/expenses')).items.some((row) => row._id === created.expense._id && row.amount === 123));
    }
    await call('PUT', '/profile', { financeMode: 'shared_living' });
  });
  // Owner deletion is deliberately restricted by the existing ledger schema.
  // The isolated environment is disposed of as a schema, never by deleting real groups.
});
