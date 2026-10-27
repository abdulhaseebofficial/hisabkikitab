require('../../scripts/require-test-database');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const API = path.join(__dirname, '..', '..', 'apps', 'api');
const { query, queryOne, getPool, closePool } = require(path.join(API, 'src/infrastructure/database/pool'));
const BusinessService = require(path.join(API, 'src/modules/business/business.service'));

/**
 * An audit log that can outlive the thing it describes is worse than no audit
 * log, because it is believed.
 *
 * Twenty-one audit writes in the business service ran on a pooled connection
 * while the financial work they described was still open on a transaction
 * client. That connection commits independently, so a rolled-back purchase,
 * expense, payment, GRN, supplier bill or return still left a row asserting it
 * had happened. These tests pin the fix behaviourally rather than by reading
 * the source, and one static test catches any new call site that reintroduces
 * the pattern.
 */

let owner;
let businessId;

test.before(async () => {
  owner = await queryOne(
    `INSERT INTO users (name, email, password, finance_mode)
       VALUES ('Audit atomicity owner', $1, 'test-hash', 'business') RETURNING id`,
    [`audit-atomicity-${crypto.randomUUID()}@test.local`]
  );
  const business = await BusinessService.createBusiness(owner.id, {
    name: 'Atomicity Test Traders',
    category: 'retail',
    businessType: 'retail',
    currency: 'PKR',
  });
  businessId = business.id;
});

test.after(async () => {
  // This fixture deliberately cannot be fully cleaned up, and that is correct.
  // Posting an expense writes general ledger entries, and a trigger makes those
  // immutable -- 'use a reversing entry' -- so the business cannot be deleted,
  // and businesses.owner_id is ON DELETE RESTRICT, so neither can the owner.
  // Both guarantees are worth more than tidy test data, so the rows are left
  // behind rather than the invariants weakened to remove them. Every count in
  // this suite is scoped to this business id, so the residue affects nothing.
  await closePool();
});

const auditCount = async () => {
  const row = await queryOne(
    'SELECT count(*)::int AS n FROM biz_audit_logs WHERE business_id = $1', [businessId]);
  return row.n;
};

const expenseCount = async () => {
  const row = await queryOne(
    'SELECT count(*)::int AS n FROM biz_expenses WHERE business_id = $1', [businessId]);
  return row.n;
};

const payload = (title) => ({
  title,
  amountMinor: '250000',
  category: 'Utilities',
  paymentMethod: 'cash',
});

test('a rolled-back expense leaves no audit row behind', async () => {
  const auditBefore = await auditCount();
  const expensesBefore = await expenseCount();

  // Drive the transaction from the test, exactly as an outer caller would, and
  // then abandon it. Everything the service wrote must disappear together.
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const expense = await BusinessService.createExpense(
      businessId, owner.id, payload('Rolled back electricity bill'), client);
    assert.ok(expense, 'the expense should be created inside the transaction');

    // Visible inside the transaction...
    const inside = await client.query(
      'SELECT count(*)::int AS n FROM biz_audit_logs WHERE business_id = $1', [businessId]);
    assert.equal(inside.rows[0].n, auditBefore + 1,
      'the audit row must be written on the same connection');

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }

  // ...and gone afterwards, together with the expense itself.
  assert.equal(await auditCount(), auditBefore,
    'the audit row must not survive the rollback');
  assert.equal(await expenseCount(), expensesBefore,
    'and neither must the expense');
});

test('a committed expense keeps exactly one audit row', async () => {
  const auditBefore = await auditCount();

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await BusinessService.createExpense(
      businessId, owner.id, payload('Committed water bill'), client);
    await client.query('COMMIT');
  } finally {
    client.release();
  }

  assert.equal(await auditCount(), auditBefore + 1,
    'a successful operation records exactly one audit row');
});

test('retrying after a rollback records one audit row, not two', async () => {
  const auditBefore = await auditCount();

  // First attempt fails.
  const first = await getPool().connect();
  try {
    await first.query('BEGIN');
    await BusinessService.createExpense(
      businessId, owner.id, payload('Retried internet bill'), first);
    await first.query('ROLLBACK');
  } finally {
    first.release();
  }
  assert.equal(await auditCount(), auditBefore, 'the failed attempt leaves nothing');

  // The retry succeeds.
  const second = await getPool().connect();
  try {
    await second.query('BEGIN');
    await BusinessService.createExpense(
      businessId, owner.id, payload('Retried internet bill'), second);
    await second.query('COMMIT');
  } finally {
    second.release();
  }

  assert.equal(await auditCount(), auditBefore + 1,
    'only the successful attempt is recorded');
});

test('concurrent expenses on separate transactions each record their own audit row', async () => {
  const auditBefore = await auditCount();

  const run = async (title) => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await BusinessService.createExpense(businessId, owner.id, payload(title), client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  };

  await Promise.all([run('Concurrent A'), run('Concurrent B'), run('Concurrent C')]);

  assert.equal(await auditCount(), auditBefore + 3,
    'three concurrent commits record three audit rows, no more and no fewer');
});

test('one failing transaction among concurrent ones records only the survivors', async () => {
  const auditBefore = await auditCount();

  const succeed = async (title) => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await BusinessService.createExpense(businessId, owner.id, payload(title), client);
      await client.query('COMMIT');
    } finally { client.release(); }
  };

  const abandon = async (title) => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await BusinessService.createExpense(businessId, owner.id, payload(title), client);
      await client.query('ROLLBACK');
    } finally { client.release(); }
  };

  await Promise.all([succeed('Survivor one'), abandon('Casualty'), succeed('Survivor two')]);

  assert.equal(await auditCount(), auditBefore + 2,
    'only the two committed operations leave audit rows');
});

test('no audit write inside a transaction is left on a pooled connection', () => {
  // A behavioural test can only cover the paths it exercises. This one covers
  // every call site at once, so a newly added logAction that forgets the client
  // fails here rather than silently reintroducing the defect.
  const source = fs.readFileSync(
    path.join(API, 'src/modules/business/business.service.js'), 'utf8');
  const lines = source.split(/\r?\n/);

  const offenders = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/BusinessRepository\.logAction\(/.test(lines[i])) continue;

    let depth = (lines[i].match(/\(/g) || []).length - (lines[i].match(/\)/g) || []).length;
    let end = i;
    while (depth > 0 && end + 1 < lines.length) {
      end += 1;
      depth += (lines[end].match(/\(/g) || []).length - (lines[end].match(/\)/g) || []).length;
    }
    const whole = lines.slice(i, end + 1).join('\n');
    if (/,\s*client\s*\)\s*;?\s*$/.test(whole)) continue;

    // Only a call inside a method that actually holds a client is a defect.
    let holdsClient = false;
    for (let k = i; k >= 0; k -= 1) {
      if (/^\s{2}async\s+[A-Za-z0-9_]+\s*\(/.test(lines[k])) break;
      if (/const client = (?:[A-Za-z0-9_]+ \|\| )?\(?await getPool\(\)\.connect\(\)/.test(lines[k])) {
        holdsClient = true;
      }
    }
    if (holdsClient) offenders.push(i + 1);
  }

  assert.deepEqual(offenders, [],
    `audit writes inside a transaction must pass the client; offending line(s): ${offenders.join(', ')}`);
});
