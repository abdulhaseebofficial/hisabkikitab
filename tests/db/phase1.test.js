const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
require('../../scripts/require-test-database');
const { query, queryOne, transaction, closePool } = require('../../apps/api/src/infrastructure/database/pool');
const recurring = require('../../apps/api/src/infrastructure/scheduling/recurringExpenses.job');
const expensesRepo = require('../../apps/api/src/modules/expenses/expenses.repository');
const expensesService = require('../../apps/api/src/modules/expenses/expenses.service');
const sharedExport = require('../../apps/api/src/modules/users/sharedLivingExport.repository');

test('locked recurring generation is mode-correct and idempotent under two callers', async () => {
  const email = `recurring_${crypto.randomUUID()}@test.local`;
  const user = await queryOne(
    "INSERT INTO users(name,email,password) VALUES('Test', $1, 'test-only') RETURNING id", [email]
  );
  try {
    const template = await queryOne(
      `INSERT INTO expenses(user_id,finance_mode,amount,category,date,is_recurring,
        recurring_frequency,next_run_at) VALUES($1,'householder',125.25,'Rent',
        '2026-01-01T00:00:00Z',true,'monthly','2026-01-31T00:00:00Z') RETURNING id`,
      [user.id]
    );
    const now = new Date('2026-02-01T00:00:00Z');
    const counts = await Promise.all([
      recurring.materializeForUser(user.id, now), recurring.materializeForUser(user.id, now),
    ]);
    assert.equal(counts.reduce((a, b) => a + b, 0), 1);
    const clones = await query(
      'SELECT finance_mode, date, recurrence_occurrence FROM expenses WHERE generated_from=$1',
      [template.id]
    );
    assert.equal(clones.length, 1);
    assert.equal(clones[0].finance_mode, 'householder');
    assert.equal(clones[0].recurrence_occurrence, true);
    assert.equal(new Date(clones[0].date).toISOString(), '2026-01-31T00:00:00.000Z');
    const next = await queryOne('SELECT next_run_at FROM expenses WHERE id=$1', [template.id]);
    assert.equal(new Date(next.next_run_at).toISOString(), '2026-02-28T00:00:00.000Z');
    await assert.rejects(query(
      `INSERT INTO expenses(user_id,finance_mode,amount,category,date,generated_from,recurrence_occurrence)
       VALUES($1,'householder',125.25,'Rent','2026-01-31T00:00:00Z',$2,true)`,
      [user.id, template.id]
    ), (err) => err.code === '23505');
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('a failure after recurring clone insert rolls back the clone and pointer; retry creates one', async () => {
  const user = await queryOne(
    "INSERT INTO users(name,email,password) VALUES('Retry test', $1, 'test-only') RETURNING id",
    [`recurring_retry_${crypto.randomUUID()}@test.local`]
  );
  const originalAdvance = expensesRepo.setNextRunAt;
  try {
    const template = await queryOne(`INSERT INTO expenses
      (user_id,finance_mode,amount,category,is_recurring,recurring_frequency,next_run_at)
      VALUES($1,'student',10.01,'Test',true,'monthly','2026-01-31T00:00:00Z') RETURNING id`, [user.id]);
    expensesRepo.setNextRunAt = async () => { throw new Error('injected failure after clone insert'); };
    await assert.rejects(recurring.materializeForUser(user.id, new Date('2026-02-01T00:00:00Z')),
      /injected failure after clone insert/);
    assert.equal((await queryOne('SELECT count(*)::integer AS n FROM expenses WHERE generated_from=$1', [template.id])).n, 0);
    assert.equal(new Date((await queryOne('SELECT next_run_at FROM expenses WHERE id=$1', [template.id])).next_run_at)
      .toISOString(), '2026-01-31T00:00:00.000Z');
    expensesRepo.setNextRunAt = originalAdvance;
    assert.equal(await recurring.materializeForUser(user.id, new Date('2026-02-01T00:00:00Z')), 1);
    assert.equal(await recurring.materializeForUser(user.id, new Date('2026-02-01T00:00:00Z')), 0);
    assert.equal((await queryOne('SELECT count(*)::integer AS n FROM expenses WHERE generated_from=$1', [template.id])).n, 1);
  } finally {
    expensesRepo.setNextRunAt = originalAdvance;
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('two worker processes materialize the same due occurrence only once', async () => {
  const user = await queryOne(
    "INSERT INTO users(name,email,password) VALUES('Worker test', $1, 'test-only') RETURNING id",
    [`recurring_workers_${crypto.randomUUID()}@test.local`]
  );
  try {
    const template = await queryOne(`INSERT INTO expenses
      (user_id,finance_mode,amount,category,is_recurring,recurring_frequency,next_run_at)
      VALUES($1,'student',10.01,'Test',true,'monthly','2026-01-31T00:00:00Z') RETURNING id`, [user.id]);
    const script = `const job=require('./apps/api/src/infrastructure/scheduling/recurringExpenses.job');
      const db=require('./apps/api/src/infrastructure/database/pool');
      job.materializeForUser(process.argv[1],new Date('2026-02-01T00:00:00Z'))
        .then(n=>process.stdout.write(String(n))).catch(e=>{console.error(e.message);process.exitCode=1})
        .finally(()=>db.closePool());`;
    const worker = () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', script, user.id], { cwd: process.cwd(), env: process.env });
      let output = '', errors = '';
      const timeout = setTimeout(() => child.kill(), 15000);
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { errors += chunk; });
      child.on('error', reject);
      child.on('close', code => {
        clearTimeout(timeout);
        if (code !== 0) reject(new Error(`worker exited ${code}: ${errors}`));
        else resolve(Number(output));
      });
    });
    const counts = await Promise.all([worker(), worker()]);
    assert.equal(counts.reduce((a, b) => a + b, 0), 1);
    assert.equal((await queryOne('SELECT count(*)::integer AS n FROM expenses WHERE generated_from=$1', [template.id])).n, 1);
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('manual bill payment rolls back its expense when advancing the due date fails', async () => {
  const user = await queryOne(
    "INSERT INTO users(name,email,password) VALUES('Bill test', $1, 'test-only') RETURNING id, finance_mode",
    [`bill_atomic_${crypto.randomUUID()}@test.local`]
  );
  const originalAdvance = expensesRepo.setNextRunAt;
  try {
    const template = await queryOne(`INSERT INTO expenses
      (user_id,finance_mode,amount,category,is_recurring,recurring_frequency,next_run_at)
      VALUES($1,'student',10.01,'Test',true,'monthly','2026-11-01T00:00:00Z') RETURNING id`, [user.id]);
    const actor = { _id: user.id, financeMode: 'student' };
    expensesRepo.setNextRunAt = async () => { throw new Error('injected pointer failure'); };
    await assert.rejects(expensesService.markBillPaid(template.id, actor, {}, crypto.randomUUID()), /injected pointer failure/);
    assert.equal((await queryOne('SELECT count(*)::integer AS n FROM expenses WHERE generated_from=$1', [template.id])).n, 0);
    assert.equal(new Date((await queryOne('SELECT next_run_at FROM expenses WHERE id=$1', [template.id])).next_run_at)
      .toISOString(), '2026-11-01T00:00:00.000Z');

    expensesRepo.setNextRunAt = originalAdvance;
    const payments = await Promise.all([
      expensesService.markBillPaid(template.id, actor, {}, crypto.randomUUID()),
      expensesService.markBillPaid(template.id, actor, {}, crypto.randomUUID()),
    ]);
    assert.equal(payments.length, 2);
    assert.equal((await queryOne('SELECT count(*)::integer AS n FROM expenses WHERE generated_from=$1', [template.id])).n, 2);
    assert.equal(new Date((await queryOne('SELECT next_run_at FROM expenses WHERE id=$1', [template.id])).next_run_at)
      .toISOString(), '2027-01-01T00:00:00.000Z');
  } finally {
    expensesRepo.setNextRunAt = originalAdvance;
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('account export scopes spaces to membership and omits other members contact fields', async () => {
  const owner = await queryOne(
    "INSERT INTO users(name,email,password) VALUES('Test', $1, 'test-only') RETURNING id",
    [`export_${crypto.randomUUID()}@test.local`]
  );
  try {
    const space = await transaction(async (tx) => {
      const created = await tx.queryOne(
        "INSERT INTO sl_spaces(owner_id,name,currency,residents) VALUES($1,'Flat','PKR',2) RETURNING id",
        [owner.id]
      );
      await tx.query("INSERT INTO sl_memberships(space_id,user_id,role) VALUES($1,$2,'admin')",
        [created.id, owner.id]);
      return created;
    });
    const member = await queryOne(
      `INSERT INTO sl_members(space_id,name,phone,email,joined_on)
       VALUES($1,'Flatmate','private phone','private@example.test','2026-01-01') RETURNING id`,
      [space.id]
    );
    const exported = await sharedExport.forUser(owner.id);
    assert.equal(exported.spaces.length, 1);
    assert.equal(exported.members.length, 1);
    assert.equal(exported.members[0]._id, member.id);
    assert.equal(Object.hasOwn(exported.members[0], 'phone'), false);
    assert.equal(Object.hasOwn(exported.members[0], 'email'), false);
  } finally {
    // Remove the disposable space atomically so the deferred owner invariant
    // sees either its owner membership or no space at commit.
    await transaction(async (tx) => {
      await tx.query('DELETE FROM sl_members WHERE space_id IN (SELECT id FROM sl_spaces WHERE owner_id=$1)', [owner.id]);
      await tx.query('DELETE FROM sl_memberships WHERE user_id=$1', [owner.id]);
      await tx.query('DELETE FROM sl_spaces WHERE owner_id=$1', [owner.id]);
    });
    await query('DELETE FROM users WHERE id=$1', [owner.id]);
  }
});

test.after(async () => closePool());
