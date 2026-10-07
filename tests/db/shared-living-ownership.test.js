// Ownership races run through authenticated API requests and transactional
// account deletion against an isolated schema on the guarded local database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('../../scripts/require-test-database');
require('dotenv').config({ path: path.resolve('apps/api/.env'), quiet: true });
const schema = `sl_owner_test_${crypto.randomBytes(8).toString('hex')}`;
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString('hex');
const db = require('../../apps/api/src/infrastructure/database/pool');
const originalQuery = db.query;
const originalTransaction = db.transaction;
const isolated = (fn) => originalTransaction(async (tx) => {
  await tx.query(`SET LOCAL search_path TO ${schema}`);
  return fn(tx);
});
db.transaction = (fn) => isolated(fn);
db.query = (sql, values) => isolated((tx) => tx.query(sql, values));
db.queryOne = (sql, values) => isolated((tx) => tx.queryOne(sql, values));
const { migrationFiles } = require('../../apps/api/src/infrastructure/database/migrate');
const { signAccessToken } = require('../../apps/api/src/modules/auth/auth.tokens');
const usersRepo = require('../../apps/api/src/modules/users/users.repository');

test('Shared Living ownership transfer, exit and account deletion preserve the owner invariant', { timeout: 600000 }, async (t) => {
  let server;
  try {
    await originalQuery(`CREATE SCHEMA ${schema}`);
    await db.query('CREATE TABLE schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
    for (const file of migrationFiles())
      await db.query(fs.readFileSync(path.resolve('database/migrations', file), 'utf8'));
    const names = ['Owner', 'Successor One', 'Successor Two', 'Outsider', 'Other Space Owner', 'Leave Race Member', 'Leave Race Member Two', 'Lone Owner', 'Transfer Race Owner', 'Delete Race Member', 'No Space User'];
    const accounts = [];
    for (const [i, name] of names.entries())
      accounts.push(await originalQuery(
        `INSERT INTO ${schema}.users(name,email,password,finance_mode,onboarding_completed)
         VALUES($1,$2,'test-only','shared_living',true) RETURNING id`,
        [name, `f3-${i}-${crypto.randomUUID()}@example.test`],
      ).then((rows) => rows[0]));
    const tokens = accounts.map((account) => signAccessToken(account.id, 0));
    const app = require('express')();
    app.use(require('express').json());
    require('../../apps/api/src/routes')(app);
    app.use(require('../../apps/api/src/shared/middleware/errorHandler').errorHandler);
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const request = async (method, url, body, who = 0) => {
      if (method === 'POST' && /\/months\/[^/]+\/(expenses|bills|payments)$/.test(url) && body)
        body = { request_id: crypto.randomUUID(), ...body };
      const apiPath = url.startsWith('/api/') ? url.slice(4) : url;
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${apiPath}`, {
        method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens[who]}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    const createSpace = async (owner, name) => {
      const response = await request('POST', '/api/shared-living/spaces', {
        name, currency: 'PKR', month: '2024-02', residents: 1, members: ['Resident'],
      }, owner);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return response.body.data;
    };
    const join = async (user, code, expectedSpace) => {
      const response = await request('POST', '/api/shared-living/join', { code }, user);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body.data.space_id, expectedSpace);
    };
    const addAsSuccessor = async (user, space) => join(user, space.invite.code, space.id);
    const ownerState = async (spaceId) => {
      const space = await db.queryOne('SELECT owner_id FROM sl_spaces WHERE id=$1', [spaceId]);
      const admins = await db.query('SELECT user_id FROM sl_memberships WHERE space_id=$1 AND role=\'admin\' ORDER BY user_id', [spaceId]);
      assert.equal(admins.length, 1, 'each space has exactly one admin/owner membership');
      assert.equal(admins[0].user_id, space.owner_id, 'owner_id and sole admin membership agree');
      return space.owner_id;
    };

    const main = await createSpace(0, 'Ownership history space');
    await addAsSuccessor(1, main);
    await addAsSuccessor(2, main);
    await t.test('owner sees only same-space active successor accounts; outsiders and cross-space users are rejected', async () => {
      const other = await createSpace(4, 'Separate space');
      await addAsSuccessor(5, other);
      const list = (await request('GET', '/api/shared-living/spaces', undefined, 0)).body.data;
      const owned = list.find((space) => space.id === main.id);
      assert.equal(owned.owner_id, accounts[0].id);
      assert.equal(owned.owner_name, names[0]);
      assert.deepEqual(owned.eligible_successors.map((item) => item.user_id).sort(), [accounts[1].id, accounts[2].id].sort());
      assert.equal((await request('POST', `/api/shared-living/spaces/${main.id}/transfer-ownership`, { successor_user_id: accounts[3].id }, 0)).status, 409);
      assert.equal((await request('POST', `/api/shared-living/spaces/${main.id}/transfer-ownership`, { successor_user_id: accounts[5].id }, 0)).status, 409);
      assert.equal((await request('POST', `/api/shared-living/spaces/${main.id}/transfer-ownership`, { successor_user_id: accounts[2].id }, 1)).status, 403);
      assert.equal((await request('POST', `/api/shared-living/spaces/${main.id}/transfer-ownership`, { successor_user_id: accounts[1].id }, 4)).status, 404);
      assert.equal((await request('POST', `/api/shared-living/spaces/${main.id}/transfer-ownership`, {}, 0)).status, 400);
    });

    await t.test('ownership transfer and owner leave retain every historical ledger row and attribution', async () => {
      const dashboard = (await request('GET', `/api/shared-living/spaces/${main.id}/months/2024-02`)).body.data;
      const resident = dashboard.summary.members[0].id;
      const food = dashboard.categories.find((item) => item.kind === 'food').id;
      const billCategory = dashboard.categories.find((item) => item.kind === 'bill').id;
      for (const [kind, body] of [
        ['expenses', { category_id: food, date: '2024-02-04', amount: '12.34' }],
        ['bills', { name: 'Preserved bill', category_id: billCategory, date: '2024-02-05', due_date: '2024-02-10', amount: '56.78' }],
        ['payments', { member_id: resident, date: '2024-02-06', amount: '9.01', method: 'cash' }],
      ]) {
        const result = await request('POST', `/api/shared-living/spaces/${main.id}/months/2024-02/${kind}`, body);
        assert.equal(result.status, 200, JSON.stringify(result.body));
      }
      const history = async () => db.queryOne(
        `SELECT jsonb_build_object(
          'periods',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM sl_periods x WHERE space_id=$1),
          'bills',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM sl_bills x WHERE space_id=$1),
          'expenses',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM sl_expenses x WHERE space_id=$1),
          'shares',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM sl_shares x WHERE space_id=$1),
          'payments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM sl_payments x WHERE space_id=$1),
          'residents',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM sl_members x WHERE space_id=$1)
        ) AS snapshot`, [main.id]);
      const beforeHistory = (await history()).snapshot;
      const beforeActivity = await db.query('SELECT to_jsonb(a) AS row FROM sl_activity a WHERE space_id=$1 ORDER BY id', [main.id]);
      assert.equal((await request('DELETE', `/api/shared-living/spaces/${main.id}/membership`)).status, 409);
      const results = await Promise.all([1, 2].map((index) => request(
        'POST', `/api/shared-living/spaces/${main.id}/transfer-ownership`,
        { successor_user_id: accounts[index].id }, 0,
      )));
      assert.equal(results.filter((result) => result.status === 200).length, 1);
      assert.equal(results.filter((result) => [403, 409].includes(result.status)).length, 1);
      const newOwner = await ownerState(main.id);
      assert.ok([accounts[1].id, accounts[2].id].includes(newOwner));
      assert.deepEqual((await history()).snapshot, beforeHistory);
      assert.deepEqual(await db.query("SELECT to_jsonb(a) AS row FROM sl_activity a WHERE space_id=$1 AND action<>'ownership_transferred' ORDER BY id", [main.id]), beforeActivity);
      const transferEvents = await db.query(
        "SELECT actor_id,action,entity,entity_id,before_values,after_values,created_at FROM sl_activity WHERE space_id=$1 AND action='ownership_transferred'",
        [main.id],
      );
      assert.equal(transferEvents.length, 1);
      assert.equal(transferEvents[0].actor_id, accounts[0].id);
      assert.equal(transferEvents[0].entity, 'space');
      assert.equal(transferEvents[0].entity_id, main.id);
      assert.equal(transferEvents[0].before_values.owner_id, accounts[0].id);
      assert.equal(transferEvents[0].after_values.owner_id, newOwner);
      const retry = await request('POST', `/api/shared-living/spaces/${main.id}/transfer-ownership`, { successor_user_id: newOwner }, 0);
      assert.equal(retry.status, 403, 'former owner retry is not treated as a new authorized transfer');
      assert.equal((await db.query("SELECT count(*)::int AS n FROM sl_activity WHERE space_id=$1 AND action='ownership_transferred'", [main.id]))[0].n, 1);
      const preflight = await usersRepo.removeAccountSafely(newOwner);
      assert.deepEqual(preflight, { deleted: false, hasSuccessor: true });
      assert.equal(await ownerState(main.id), newOwner);
      const leave = await request('DELETE', `/api/shared-living/spaces/${main.id}/membership`, undefined, 0);
      assert.equal(leave.status, 200, JSON.stringify(leave.body));
      assert.equal((await db.query('SELECT count(*)::int AS n FROM sl_memberships WHERE space_id=$1 AND user_id=$2', [main.id, accounts[0].id]))[0].n, 0);
      const deletedFormerOwner = await usersRepo.removeAccountSafely(accounts[0].id);
      assert.deepEqual(deletedFormerOwner, { deleted: true, hasSuccessor: false });
      const preservedTransfer = await db.queryOne(
        'SELECT actor_id,actor_name FROM sl_activity WHERE space_id=$1 AND action=\'ownership_transferred\'',
        [main.id],
      );
      assert.equal(preservedTransfer.actor_id, accounts[0].id, 'account deletion must preserve historical activity attribution');
      assert.equal(preservedTransfer.actor_name, names[0]);
      assert.deepEqual((await history()).snapshot, beforeHistory, 'former-owner deletion must preserve the complete shared ledger');
      assert.deepEqual(
        await db.query("SELECT to_jsonb(a) AS row FROM sl_activity a WHERE space_id=$1 AND action<>'ownership_transferred' ORDER BY id", [main.id]),
        beforeActivity.concat(await db.query("SELECT to_jsonb(a) AS row FROM sl_activity a WHERE space_id=$1 AND action='member_left' ORDER BY id", [main.id])),
        'existing activity remains and member exit adds only an audit event',
      );
      assert.equal(await ownerState(main.id), newOwner);
    });

    await t.test('removed account-membership targets cannot receive ownership', async () => {
      const removed = await createSpace(8, 'Removed successor space');
      await addAsSuccessor(3, removed);
      const left = await request('DELETE', `/api/shared-living/spaces/${removed.id}/membership`, undefined, 3);
      assert.equal(left.status, 200);
      const response = await request('POST', `/api/shared-living/spaces/${removed.id}/transfer-ownership`, { successor_user_id: accounts[3].id }, 8);
      assert.equal(response.status, 409);
      assert.equal(await ownerState(removed.id), accounts[8].id);
    });

    await t.test('transfer versus member leave serializes to one valid owner state', async () => {
      const space = await createSpace(4, 'Leave race space');
      await addAsSuccessor(5, space);
      await addAsSuccessor(6, space);
      const [transfer, leave] = await Promise.all([
        request('POST', `/api/shared-living/spaces/${space.id}/transfer-ownership`, { successor_user_id: accounts[5].id }, 4),
        request('DELETE', `/api/shared-living/spaces/${space.id}/membership`, undefined, 5),
      ]);
      assert.ok(transfer.status === 200 || [403, 409].includes(transfer.status));
      assert.ok(leave.status === 200 || leave.status === 409);
      assert.equal(Number(transfer.status === 200) + Number(leave.status === 200), 1);
      const owner = await ownerState(space.id);
      assert.ok([accounts[4].id, accounts[5].id].includes(owner));
    });

    await t.test('transfer versus account deletion cannot assign ownership to a deleted member', async () => {
      const space = await createSpace(8, 'Deletion race space');
      await addAsSuccessor(9, space);
      const [transfer, deletion] = await Promise.all([
        request('POST', `/api/shared-living/spaces/${space.id}/transfer-ownership`, { successor_user_id: accounts[9].id }, 8),
        usersRepo.removeAccountSafely(accounts[9].id),
      ]);
      assert.ok(transfer.status === 200 || transfer.status === 409);
      assert.ok(deletion.deleted || (!deletion.deleted && deletion.hasSuccessor));
      if (transfer.status === 200) assert.equal(deletion.deleted, false);
      else assert.equal(deletion.deleted, true);
      assert.equal(await ownerState(space.id), transfer.status === 200 ? accounts[9].id : accounts[8].id);
      assert.equal((await db.queryOne('SELECT count(*)::int AS n FROM users WHERE id=$1', [accounts[9].id])).n, transfer.status === 200 ? 1 : 0);
    });

    await t.test('owner with no successor cannot leave or delete; unrelated account deletion works', async () => {
      const lone = await createSpace(7, 'Last owner space');
      const eligible = await createSpace(7, 'Eligible sibling space');
      await addAsSuccessor(3, eligible);
      const blockedLeave = await request('DELETE', `/api/shared-living/spaces/${lone.id}/membership`, undefined, 7);
      assert.equal(blockedLeave.status, 409);
      const blockedDeletion = await usersRepo.removeAccountSafely(accounts[7].id);
      assert.deepEqual(blockedDeletion, { deleted: false, hasSuccessor: false }, 'one untransferable space takes precedence over another eligible space');
      assert.equal(await ownerState(lone.id), accounts[7].id);
      assert.equal(await ownerState(eligible.id), accounts[7].id);
      const ordinaryDeletion = await usersRepo.removeAccountSafely(accounts[10].id);
      assert.deepEqual(ordinaryDeletion, { deleted: true, hasSuccessor: false });
    });

    await t.test('database deferred invariant rejects owner membership removal and invalid owner assignment', async () => {
      const space = await createSpace(4, 'Constraint space');
      await assert.rejects(() => originalTransaction(async (tx) => {
        await tx.query(`SET LOCAL search_path TO ${schema}`);
        await tx.query('DELETE FROM sl_memberships WHERE space_id=$1 AND user_id=$2', [space.id, accounts[4].id]);
      }), (error) => error.code === '23514' && error.constraint === 'sl_spaces_valid_owner_membership');
      await assert.rejects(() => originalTransaction(async (tx) => {
        await tx.query(`SET LOCAL search_path TO ${schema}`);
        await tx.query('UPDATE sl_spaces SET owner_id=$2 WHERE id=$1', [space.id, accounts[3].id]);
      }), (error) => error.code === '23514' && error.constraint === 'sl_spaces_valid_owner_membership');
      assert.equal(await ownerState(space.id), accounts[4].id);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (!/^sl_owner_test_[a-f0-9]{16}$/.test(schema)) throw new Error('Unsafe test schema');
    await originalQuery(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.closePool();
  }
});
