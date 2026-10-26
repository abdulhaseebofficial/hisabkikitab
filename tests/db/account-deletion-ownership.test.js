/**
 * Account deletion is blocked by ownership, and the blocker has to be named.
 *
 * `businesses.owner_id` is ON DELETE RESTRICT, so the DELETE fails inside
 * Postgres rather than cascading. Before this was recognised the violation was
 * reported as "a change happened at the same time, retry", which no amount of
 * retrying could clear.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../../scripts/require-test-database');
const { query, queryOne, closePool } = require('../../apps/api/src/infrastructure/database/pool');
const repo = require('../../apps/api/src/modules/users/users.repository');
const service = require('../../apps/api/src/modules/users/users.service');

const PASSWORD = 'OwnerPass123!';

const makeUser = (label) => queryOne(
  'INSERT INTO users(name,email,password,monthly_income) VALUES($1,$2,$3,0) RETURNING id',
  [label, `${crypto.randomUUID()}@test.local`, 'placeholder'],
);

/** A real bcrypt hash, so the service's password check is the one under test. */
const withPassword = async (userId) => {
  await repo.setPassword(userId, PASSWORD);
  return userId;
};

test.after(() => closePool());

test('a lone business owner is told the business blocks deletion, not to retry', async () => {
  const owner = await withPassword((await makeUser('Lone business owner')).id);
  const business = await queryOne(
    'INSERT INTO businesses(owner_id,name) VALUES($1,$2) RETURNING id', [owner, 'Lone Shop']);
  try {
    const outcome = await repo.removeAccountSafely(owner);
    assert.deepEqual(outcome, { deleted: false, blocker: 'business', hasSuccessor: false });

    await assert.rejects(service.deleteAccount(owner, PASSWORD), (err) =>
      err.statusCode === 409 && err.message === 'shared.businessOwnerNoSuccessorDelete');

    const still = await queryOne('SELECT count(*)::int AS n FROM users WHERE id=$1', [owner]);
    assert.equal(still.n, 1, 'the account survives a blocked deletion');
  } finally {
    await query('DELETE FROM businesses WHERE id=$1', [business.id]);
    await query('DELETE FROM users WHERE id=$1', [owner]);
  }
});

test('an owner with an active colleague is pointed at hand-over instead', async () => {
  const owner = await withPassword((await makeUser('Business owner')).id);
  const colleague = (await makeUser('Business colleague')).id;
  const business = await queryOne(
    'INSERT INTO businesses(owner_id,name) VALUES($1,$2) RETURNING id', [owner, 'Team Shop']);
  await query('INSERT INTO business_members(business_id,user_id,role) VALUES($1,$2,$3)',
    [business.id, colleague, 'admin']);
  try {
    const outcome = await repo.removeAccountSafely(owner);
    assert.deepEqual(outcome, { deleted: false, blocker: 'business', hasSuccessor: true });

    await assert.rejects(service.deleteAccount(owner, PASSWORD), (err) =>
      err.statusCode === 409 && err.message === 'shared.businessOwnerTransferBeforeDelete');
  } finally {
    await query('DELETE FROM businesses WHERE id=$1', [business.id]);
    await query('DELETE FROM users WHERE id=ANY($1)', [[owner, colleague]]);
  }
});

test('a mere member of someone else\'s business can still delete their account', async () => {
  const owner = (await makeUser('Other owner')).id;
  const member = await withPassword((await makeUser('Business member')).id);
  const business = await queryOne(
    'INSERT INTO businesses(owner_id,name) VALUES($1,$2) RETURNING id', [owner, 'Someone Elses Shop']);
  await query('INSERT INTO business_members(business_id,user_id,role) VALUES($1,$2,$3)',
    [business.id, member, 'cashier']);
  await query(
    `INSERT INTO biz_audit_logs(business_id,user_id,action,entity) VALUES($1,$2,'sale.create','biz_sales')`,
    [business.id, member]);
  try {
    await service.deleteAccount(member, PASSWORD);

    const gone = await queryOne('SELECT count(*)::int AS n FROM users WHERE id=$1', [member]);
    assert.equal(gone.n, 0, 'the member account is removed');

    const trail = await queryOne(
      'SELECT count(*)::int AS n, count(user_id)::int AS named FROM biz_audit_logs WHERE business_id=$1',
      [business.id]);
    assert.equal(trail.n, 1, "the owner's audit trail survives");
    assert.equal(trail.named, 0, 'but the departed member is no longer named in it');
  } finally {
    await query('DELETE FROM businesses WHERE id=$1', [business.id]);
    await query('DELETE FROM users WHERE id=ANY($1)', [[owner, member]]);
  }
});
