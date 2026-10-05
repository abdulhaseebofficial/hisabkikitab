require('../../scripts/require-test-database');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { Client } = require('pg');

const API = path.join(__dirname, '..', '..', 'apps', 'api');
const { query, queryOne, closePool } = require(path.join(API, 'src/infrastructure/database/pool'));
const repo = require(path.join(API, 'src/modules/debts/debts.repository'));
const service = require(path.join(API, 'src/modules/debts/debts.service'));
const localUrl = process.env.TEST_DATABASE_URL;

let owner;
let stranger;
let first;
let second;

test.before(async () => {
  const suffix = crypto.randomUUID();
  owner = await queryOne(`INSERT INTO users (name,email,password)
    VALUES ('Debt contact owner',$1,'test-hash') RETURNING id`, [`f8-owner-${suffix}@test.local`]);
  stranger = await queryOne(`INSERT INTO users (name,email,password)
    VALUES ('Debt contact stranger',$1,'test-hash') RETURNING id`, [`f8-stranger-${suffix}@test.local`]);
});

test.after(async () => {
  if (owner) await query('DELETE FROM users WHERE id=$1', [owner.id]);
  if (stranger) await query('DELETE FROM users WHERE id=$1', [stranger.id]);
  await closePool();
});

const user = () => ({ _id: owner.id, financeMode: 'student' });

test('equal names remain separate until a new debt explicitly reuses a contact ID', async () => {
  const retryKey = crypto.randomUUID();
  first = await service.create(user(), { kind: 'LENT', personName: 'Ali', originalAmount: 10 }, retryKey);
  const replay = await service.create(user(), { kind: 'LENT', personName: 'Ali', originalAmount: 10 }, retryKey);
  assert.equal(replay._id, first._id);
  assert.equal(replay.contactId, first.contactId);
  const contactCount = await queryOne('SELECT count(*)::int AS n FROM debt_contacts WHERE id=$1', [first.contactId]);
  assert.equal(contactCount.n, 1);
  second = await service.create(user(), { kind: 'BORROWED', personName: 'Ali', originalAmount: 20 }, crypto.randomUUID());
  assert.notEqual(first.contactId, second.contactId);
  const reused = await service.create(user(), { kind: 'BORROWED', contactId: first.contactId, originalAmount: 5 }, crypto.randomUUID());
  assert.equal(reused.contactId, first.contactId);
  const people = await repo.people(owner.id, 'student');
  const ali = people.items.filter((item) => item.name === 'Ali');
  assert.equal(ali.length, 2);
  assert.equal(ali.find((item) => item.contactId === first.contactId).recordCount, 2);
  assert.equal((await repo.personRecords(owner.id, 'student', second.contactId)).items.length, 1);
  assert.equal((await repo.personRecords(owner.id, 'student', first.contactId)).items.length, 2);
  await service.addPayment(first._id, user(), { amount: 4 }, crypto.randomUUID());
  assert.equal((await repo.findById(first._id, 'student', owner.id)).remainingAmount, 6);
  assert.equal((await repo.summary(owner.id, 'student')).receivable, 6);
});

test('failed debt insert rolls back its newly created contact and request claim', async () => {
  const key = crypto.randomUUID();
  await assert.rejects(service.create(user(), { kind: 'LENT', personName: 'Rollback Person',
    originalAmount: 0 }, key), (err) => err.code === '23514');
  assert.deepEqual((await repo.contacts(owner.id, 'Rollback Person')).items, []);
  const claim = await queryOne('SELECT count(*)::int AS n FROM financial_requests WHERE user_id=$1 AND request_id=$2',
    [owner.id, key]);
  assert.equal(claim.n, 0);
});

test('rename changes display and search, while legacy names, money, ledger, and export linkage remain', async () => {
  const before = await queryOne('SELECT person_name, original_amount, paid_amount FROM debts WHERE id=$1', [first._id]);
  const renamed = await service.update(first._id, user(), { personName: 'Ali Khan' });
  assert.equal(renamed.contactId, first.contactId);
  assert.equal(renamed.personName, 'Ali Khan');
  assert.equal((await repo.findById(second._id, 'student', owner.id)).personName, 'Ali');
  const after = await queryOne('SELECT person_name, original_amount, paid_amount FROM debts WHERE id=$1', [first._id]);
  assert.deepEqual(after, before);
  assert.equal((await repo.list(owner.id, 'student', { search: 'Khan' })).items[0].contactId, first.contactId);
  const exported = await repo.listAllWithPayments(owner.id, 'student');
  const row = exported.find((item) => item._id === first._id);
  assert.equal(row.contactId, first.contactId);
  assert.equal(row.personName, 'Ali Khan');
  assert.equal(row.recordedPersonName, 'Ali');
  assert.equal(row.payments.length, 1);
  assert.equal(row.payments[0].amount, 4);
  await service.update(first._id, user(), { personContact: 'Block C' });
  assert.equal((await repo.contacts(owner.id, 'Block C')).items[0].id, first.contactId);
  assert.equal((await repo.findById(first._id, 'student', owner.id)).remainingAmount, 6);
});

test('cross-user contact IDs cannot be read, renamed, linked, or deleted under a debt', async () => {
  assert.deepEqual((await repo.contacts(stranger.id, 'Khan')).items, []);
  assert.equal(await repo.renameContact(first.contactId, stranger.id, 'Stolen'), null);
  assert.equal((await repo.personRecords(stranger.id, 'student', first.contactId)).items.length, 0);
  assert.equal(await repo.create(stranger.id, { financeMode: 'student', kind: 'LENT',
    contactId: first.contactId, originalAmount: 1, transactionDate: new Date() }), null);
  await assert.rejects(query(`INSERT INTO debts
    (user_id, kind, contact_id, person_name, original_amount)
    VALUES ($1, 'LENT', $2, 'Stolen', 1)`, [stranger.id, first.contactId]),
  (err) => err.code === '23503');
  await assert.rejects(query('DELETE FROM debt_contacts WHERE id=$1', [first.contactId]),
    (err) => err.code === '23503');
  await assert.rejects(query('UPDATE debt_contacts SET user_id=$2 WHERE id=$1', [first.contactId, stranger.id]),
    (err) => err.code === '23514');
  await assert.rejects(query('UPDATE debt_contacts SET id=gen_random_uuid() WHERE id=$1', [first.contactId]),
    (err) => err.code === '23514');
  assert.equal((await repo.findById(first._id, 'student', owner.id)).personName, 'Ali Khan');
});

test('two independent PostgreSQL clients may create same-name contacts without merging', async () => {
  const clients = [new Client({ connectionString: localUrl, ssl: false }),
    new Client({ connectionString: localUrl, ssl: false })];
  try {
    await Promise.all(clients.map((client) => client.connect()));
    const [a, b] = await Promise.all(clients.map((client) => client.query(
      `INSERT INTO debt_contacts (user_id,display_name) VALUES ($1,'Same Name') RETURNING id`, [owner.id])));
    assert.notEqual(a.rows[0].id, b.rows[0].id);
  } finally {
    await Promise.all(clients.map((client) => client.end()));
  }
});

test('contact selection pages through more than 100 identical display names', async () => {
  await query(`INSERT INTO debt_contacts (user_id,display_name)
    SELECT $1,'Page Name' FROM generate_series(1,101)`, [owner.id]);
  const firstPage = await repo.contacts(owner.id, 'Page Name', 1);
  const secondPage = await repo.contacts(owner.id, 'Page Name', 2);
  assert.equal(firstPage.items.length, 100);
  assert.equal(firstPage.hasNext, true);
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.hasPrev, true);
  assert.notEqual(firstPage.items[0].id, secondPage.items[0].id);
});

test('rename while creating or settling keeps the selected contact and exact ledger', async () => {
  const client = new Client({ connectionString: localUrl, ssl: false });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE debt_contacts SET display_name=$2 WHERE id=$1', [first.contactId, 'Current Ali']);
    let created = false;
    const pending = service.create(user(), { kind: 'LENT', contactId: first.contactId,
      originalAmount: 2 }, crypto.randomUUID()).then((debt) => { created = true; return debt; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(created, false, 'contact FOR SHARE must await the rename');
    await client.query('COMMIT');
    const debt = await pending;
    assert.equal(debt.contactId, first.contactId);
    assert.equal(debt.personName, 'Current Ali');
    assert.equal((await queryOne('SELECT person_name FROM debts WHERE id=$1', [debt._id])).person_name, 'Current Ali');

    await client.query('BEGIN');
    await client.query('UPDATE debt_contacts SET display_name=$2 WHERE id=$1', [first.contactId, 'Final Ali']);
    await service.settle(first._id, user(), '', crypto.randomUUID());
    await client.query('COMMIT');
    const settled = await repo.findById(first._id, 'student', owner.id);
    assert.equal(settled.contactId, first.contactId);
    assert.equal(settled.personName, 'Final Ali');
    assert.equal(settled.status, 'SETTLED');
    assert.equal(settled.remainingAmount, 0);
    const payments = await repo.payments(first._id, owner.id);
    assert.equal(payments.reduce((total, payment) => total + payment.amount, 0), 10);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
});
