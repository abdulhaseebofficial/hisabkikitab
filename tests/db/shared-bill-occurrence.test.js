const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
require('../../scripts/require-test-database');
require('dotenv').config({ path: path.resolve('apps/api/.env'), quiet: true });

const schema = `sl_occurrence_${crypto.randomBytes(8).toString('hex')}`;
const db = require('../../apps/api/src/infrastructure/database/pool');
const originalQuery = db.query;
const originalTransaction = db.transaction;
const isolated = (fn) => originalTransaction(async (tx) => {
  await tx.query(`SET LOCAL search_path TO ${schema}`);
  return fn(tx);
});
db.transaction = isolated;
db.query = (sql, params) => isolated((tx) => tx.query(sql, params));
db.queryOne = (sql, params) => isolated((tx) => tx.queryOne(sql, params));
const service = require('../../apps/api/src/modules/sharedLiving/sharedLiving.service');
const { migrationFiles } = require('../../apps/api/src/infrastructure/database/migrate');

test('recurring Shared Living occurrence identity', { timeout: 120000 }, async (t) => {
  const clients = [];
  try {
    await originalQuery(`CREATE SCHEMA ${schema}`);
    await db.query('CREATE TABLE schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
    for (const name of migrationFiles()) {
      await db.query(fs.readFileSync(path.resolve('database/migrations', name), 'utf8'));
    }
    const owner = await db.queryOne(
      "INSERT INTO users(name,email,password) VALUES('Owner',$1,'test-only') RETURNING id",
      [`occurrence-${schema}@example.test`],
    );
    const actor = { _id: owner.id };
    const space = await service.createSpace(actor, { name: 'House', month: '2024-02', members: ['Resident'] });
    const feb = await service.dashboard(actor, space.id, '2024-02');
    const category = feb.categories.find((row) => row.kind === 'bill').id;
    const billBody = {
      name: 'Rent', category_id: category, date: '2024-02-10',
      due_date: '2024-02-12', amount: '10.00', recurring: true,
    };
    const first = await service.editFinancial(actor, space.id, '2024-02', 'bills', null,
      { ...billBody, request_id: crypto.randomUUID() });
    const second = await service.editFinancial(actor, space.id, '2024-02', 'bills', null,
      { ...billBody, request_id: crypto.randomUUID() });
    const target = await db.queryOne(
      'INSERT INTO sl_periods(space_id,month,budget_minor,food_budget_minor) VALUES($1,$2,0,0) RETURNING id',
      [space.id, '2024-03-01'],
    );
    const manual = await service.editFinancial(actor, space.id, '2024-03', 'bills', null,
      { ...billBody, date: '2024-03-10', due_date: '2024-03-12', request_id: crypto.randomUUID() });

    await t.test('same-name source bills copy independently; a manual lookalike survives; retry is empty', async () => {
      const copied = await service.copyBills(actor, space.id, '2024-03', { from: '2024-02' });
      assert.equal(copied.length, 2);
      assert.deepEqual(new Set(copied.map((row) => row.recurring_origin_id)), new Set([first.id, second.id]));
      assert.equal(copied.some((row) => row.request_id === first.request_id || row.request_id === second.request_id), false);
      assert.equal(copied.every((row) => row.version === 1), true);
      assert.equal((await service.copyBills(actor, space.id, '2024-03', { from: '2024-02' })).length, 0);
      const stored = await db.query('SELECT id,recurring_origin_id,amount_minor FROM sl_bills WHERE period_id=$1 ORDER BY id', [target.id]);
      assert.equal(stored.length, 3);
      assert.equal(stored.find((row) => row.id === manual.id).recurring_origin_id, null);
      assert.equal(copied.every((row) => row.amount_minor === 0), true);
      assert.equal((await db.queryOne('SELECT recurrence_identity_known FROM sl_bills WHERE id=$1', [manual.id])).recurrence_identity_known, true);
    });

    await t.test('an ambiguous pre-cutover target fails safely without creating a copy', async () => {
      const legacyTarget = await db.queryOne(
        'INSERT INTO sl_periods(space_id,month,budget_minor,food_budget_minor) VALUES($1,$2,0,0) RETURNING id',
        [space.id, '2024-08-01'],
      );
      await db.query(
        `INSERT INTO sl_bills(space_id,period_id,category_id,name,date,due_date,amount_minor,method,recurring,split_pending,recurrence_identity_known)
         VALUES($1,$2,$3,'Old rent','2024-08-10','2024-08-12',0,'equal',true,true,NULL)`,
        [space.id, legacyTarget.id, category],
      );
      await assert.rejects(service.copyBills(actor, space.id, '2024-08', { from: '2024-02' }),
        (error) => error.statusCode === 409 && error.message === 'shared.legacyBillReview');
      assert.equal((await db.query('SELECT id FROM sl_bills WHERE period_id=$1', [legacyTarget.id])).length, 1);
    });
    await t.test('ambiguous pre-cutover same-name sources require review before propagation', async () => {
      const oldSource = await db.queryOne(
        'INSERT INTO sl_periods(space_id,month,budget_minor,food_budget_minor) VALUES($1,$2,0,0) RETURNING id',
        [space.id, '2024-09-01'],
      );
      const emptyTarget = await db.queryOne(
        'INSERT INTO sl_periods(space_id,month,budget_minor,food_budget_minor) VALUES($1,$2,0,0) RETURNING id',
        [space.id, '2024-10-01'],
      );
      await db.query(
        `INSERT INTO sl_bills(space_id,period_id,category_id,name,date,due_date,amount_minor,method,recurring,split_pending,recurrence_identity_known)
         VALUES($1,$2,$3,'Old rent','2024-09-10','2024-09-12',0,'equal',true,true,NULL),
               ($1,$2,$3,'Old rent','2024-09-10','2024-09-12',0,'equal',true,true,NULL)`,
        [space.id, oldSource.id, category],
      );
      await assert.rejects(service.copyBills(actor, space.id, '2024-10', { from: '2024-09' }),
        (error) => error.statusCode === 409 && error.message === 'shared.legacyBillReview');
      assert.equal((await db.query('SELECT id FROM sl_bills WHERE period_id=$1', [emptyTarget.id])).length, 0);
    });

    await t.test('lineage persists into another valid month and cannot move across spaces', async () => {
      const april = await service.startMonth(actor, space.id, '2024-04');
      const copies = await db.query('SELECT recurring_origin_id FROM sl_bills WHERE period_id=$1', [april.id]);
      assert.deepEqual(new Set(copies.map((row) => row.recurring_origin_id)), new Set([first.id, second.id, manual.id]));
      const outsider = await db.queryOne(
        "INSERT INTO users(name,email,password) VALUES('Outsider',$1,'test-only') RETURNING id",
        [`outsider-${schema}@example.test`],
      );
      await assert.rejects(service.copyBills({ _id: outsider.id }, space.id, '2024-03', { from: '2024-02' }),
        (error) => error.statusCode === 404);
      const other = await service.createSpace({ _id: outsider.id }, { name: 'Other', month: '2024-03' });
      await assert.rejects(db.query(
        `INSERT INTO sl_bills(space_id,period_id,category_id,name,date,due_date,amount_minor,method,recurring,split_pending,recurring_origin_id)
         SELECT $1,$2,c.id,'Rent','2024-03-10','2024-03-12',0,'equal',true,true,$3
           FROM sl_categories c WHERE c.space_id=$1 AND c.kind='bill' LIMIT 1`,
        [other.id, (await db.queryOne('SELECT id FROM sl_periods WHERE space_id=$1', [other.id])).id, first.id],
      ), (error) => error.code === '23503');
    });

    const makeClient = async () => {
      const client = new Client({ connectionString: process.env.TEST_DATABASE_URL, ssl: false });
      await client.connect();
      await client.query(`SET search_path TO ${schema}, public`);
      clients.push(client);
      return client;
    };
    const [left, right] = await Promise.all([makeClient(), makeClient()]);
    const insertCopy = (client, periodId, originId) => client.query(
      `INSERT INTO sl_bills(space_id,period_id,category_id,name,date,due_date,amount_minor,method,recurring,split_pending,recurring_origin_id)
       VALUES($1,$2,$3,'Rent',$4,$5,0,'equal',true,true,$6)
       ON CONFLICT (space_id,period_id,recurring_origin_id)
         WHERE recurring_origin_id IS NOT NULL DO NOTHING RETURNING id`,
      [space.id, periodId, category, '2024-05-10', '2024-05-12', originId],
    );
    const may = await db.queryOne(
      'INSERT INTO sl_periods(space_id,month,budget_minor,food_budget_minor) VALUES($1,$2,0,0) RETURNING id',
      [space.id, '2024-05-01'],
    );
    await t.test('independent clients race; unique index stores one and retry creates none', async () => {
      const results = await Promise.all([insertCopy(left, may.id, first.id), insertCopy(right, may.id, first.id)]);
      assert.deepEqual(results.map((result) => result.rowCount).sort(), [0, 1]);
      assert.equal((await insertCopy(right, may.id, first.id)).rowCount, 0);
      assert.equal((await db.query('SELECT id FROM sl_bills WHERE period_id=$1 AND recurring_origin_id=$2', [may.id, first.id])).length, 1);
      assert.equal((await insertCopy(right, may.id, second.id)).rowCount, 1);
    });
    await t.test('rolled-back copy releases the occurrence for retry', async () => {
      const june = await db.queryOne(
        'INSERT INTO sl_periods(space_id,month,budget_minor,food_budget_minor) VALUES($1,$2,0,0) RETURNING id',
        [space.id, '2024-06-01'],
      );
      await left.query('BEGIN');
      try {
        await left.query(
          `INSERT INTO sl_bills(space_id,period_id,category_id,name,date,due_date,amount_minor,method,recurring,split_pending,recurring_origin_id)
           VALUES($1,$2,$3,'Rent','2024-06-10','2024-06-12',0,'equal',true,true,$4)`,
          [space.id, june.id, category, first.id],
        );
      } finally {
        await left.query('ROLLBACK');
      }
      const inserted = await right.query(
        `INSERT INTO sl_bills(space_id,period_id,category_id,name,date,due_date,amount_minor,method,recurring,split_pending,recurring_origin_id)
         VALUES($1,$2,$3,'Rent','2024-06-10','2024-06-12',0,'equal',true,true,$4) RETURNING id`,
        [space.id, june.id, category, first.id],
      );
      assert.equal(inserted.rowCount, 1);
    });
    await t.test('simultaneous service copies return success without exposing a database conflict', async () => {
      const july = await db.queryOne(
        'INSERT INTO sl_periods(space_id,month,budget_minor,food_budget_minor) VALUES($1,$2,0,0) RETURNING id',
        [space.id, '2024-07-01'],
      );
      const attempts = await Promise.all([
        service.copyBills(actor, space.id, '2024-07', { from: '2024-02' }),
        service.copyBills(actor, space.id, '2024-07', { from: '2024-02' }),
      ]);
      assert.deepEqual(attempts.map((rows) => rows.length).sort(), [0, 2]);
      assert.equal((await db.query('SELECT id FROM sl_bills WHERE period_id=$1', [july.id])).length, 2);
    });
    await t.test('direct duplicate and origin reassignment are refused by PostgreSQL', async () => {
      await assert.rejects(left.query(
        `INSERT INTO sl_bills(space_id,period_id,category_id,name,date,due_date,amount_minor,method,recurring,split_pending,recurring_origin_id)
         VALUES($1,$2,$3,'Rent','2024-05-10','2024-05-12',0,'equal',true,true,$4)`,
        [space.id, may.id, category, first.id],
      ), (error) => error.code === '23505' && error.constraint === 'sl_bills_one_recurring_origin_per_period');
      await assert.rejects(db.query(
        'UPDATE sl_bills SET recurring_origin_id=NULL WHERE period_id=$1 AND recurring_origin_id=$2',
        [may.id, first.id],
      ), (error) => error.code === '23514');
    });
  } finally {
    await Promise.all(clients.map((client) => client.end().catch(() => {})));
    await originalQuery(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await db.closePool();
  }
});
