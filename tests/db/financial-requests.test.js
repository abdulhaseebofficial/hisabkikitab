const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
require('../../scripts/require-test-database');
const db = require('../../apps/api/src/infrastructure/database/pool');
const expenses = require('../../apps/api/src/modules/expenses/expenses.service');
const debts = require('../../apps/api/src/modules/debts/debts.service');
const goals = require('../../apps/api/src/modules/goals/goals.service');
const income = require('../../apps/api/src/modules/income/income.service');
const users = require('../../apps/api/src/modules/users/users.service');
const requests = require('../../apps/api/src/shared/finance/idempotency');
const { categoryIdsFor } = require('@hisabkikitab/contracts/catalogue');

const userFor = async () => {
  const row = await db.queryOne(
    "INSERT INTO users(name,email,password,finance_mode) VALUES('Request test',$1,'test-only','student') RETURNING id",
    [`request_${crypto.randomUUID()}@test.local`]
  );
  return { _id: row.id, financeMode: 'student', customCategories: [] };
};
const worker = (script, args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['-e', script, ...args], { cwd: process.cwd(), env: process.env });
  let output = '', errors = '';
  const timeout = setTimeout(() => child.kill(), 15000);
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { errors += chunk; });
  child.on('error', reject);
  child.on('close', code => {
    clearTimeout(timeout);
    if (code !== 0) reject(new Error(`worker exited ${code}: ${errors}`));
    else resolve(output.trim());
  });
});

test('expense retries and two independent worker processes store one row per request key', async () => {
  const user = await userFor();
  try {
    const category = categoryIdsFor('expense', 'student')[0];
    const input = { amount: 12.34, category, date: '2026-01-01T00:00:00.000Z' };
    const key = crypto.randomUUID();
    const first = await expenses.create(user, input, key);
    const second = await expenses.create(user, input, key);
    assert.equal(first._id, second._id);
    await assert.rejects(expenses.create(user, { ...input, amount: 99 }, key), err => err.statusCode === 409);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM expenses WHERE user_id=$1', [user._id])).n, 1);

    const concurrentKey = crypto.randomUUID();
    const script = `require('./scripts/require-test-database');
      const expenseWorker=require('./apps/api/src/modules/expenses/expenses.service');
      const workerPool=require('./apps/api/src/infrastructure/database/pool');
      expenseWorker.create({_id:process.argv[1],financeMode:'student',customCategories:[]},
        {amount:12.34,category:process.argv[2],date:'2026-01-01T00:00:00.000Z'},process.argv[3])
        .then(row=>process.stdout.write(row._id)).catch(err=>{console.error(err.message);process.exitCode=1})
        .finally(()=>workerPool.closePool());`;
    const ids = await Promise.all([worker(script, [user._id, category, concurrentKey]),
      worker(script, [user._id, category, concurrentKey])]);
    assert.equal(ids[0], ids[1]);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM expenses WHERE user_id=$1', [user._id])).n, 2);
  } finally {
    await db.query('DELETE FROM users WHERE id=$1', [user._id]);
  }
});

test('failed financial write rolls back its key and row so the same key can be retried', async () => {
  const user = await userFor();
  const key = crypto.randomUUID();
  try {
    const write = fail => requests.run(user._id, 'test:rollback', key, { amount: 5 }, async tx => {
      const row = await tx.queryOne(
        "INSERT INTO income(user_id,finance_mode,amount,source,date) VALUES($1,'student',5,'Test',now()) RETURNING id",
        [user._id]);
      if (fail) throw new Error('injected failure after insert');
      return row;
    });
    await assert.rejects(write(true), /injected failure/);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM income WHERE user_id=$1', [user._id])).n, 0);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM financial_requests WHERE user_id=$1', [user._id])).n, 0);
    const first = await write(false);
    const second = await write(false);
    assert.equal(first.value.id, second.value.id);
    assert.equal(second.replayed, true);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM income WHERE user_id=$1', [user._id])).n, 1);
  } finally {
    await db.query('DELETE FROM users WHERE id=$1', [user._id]);
  }
});

test('recurring bill, debt payment and goal contribution replay without a second money movement', async () => {
  const user = await userFor();
  try {
    const category = categoryIdsFor('expense', 'student')[0];
    const bill = await db.queryOne(`INSERT INTO expenses
      (user_id,finance_mode,amount,category,is_recurring,recurring_frequency,next_run_at)
      VALUES($1,'student',10.01,$2,true,'monthly','2026-11-01T00:00:00Z') RETURNING id`,
    [user._id, category]);
    const key = crypto.randomUUID();
    const first = await expenses.markBillPaid(bill.id, user, {}, key);
    const retry = await expenses.markBillPaid(bill.id, user, {}, key);
    assert.equal(first.expense._id, retry.expense._id);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM expenses WHERE generated_from=$1', [bill.id])).n, 1);
    assert.equal(new Date((await db.queryOne('SELECT next_run_at FROM expenses WHERE id=$1', [bill.id])).next_run_at)
      .toISOString(), '2026-12-01T00:00:00.000Z');
    await assert.rejects(expenses.markBillPaid(bill.id, user, { amount: 20 }, key), err => err.statusCode === 409);
    const concurrentKey = crypto.randomUUID();
    const script = `require('./scripts/require-test-database');
      const billWorker=require('./apps/api/src/modules/expenses/expenses.service');
      const billWorkerPool=require('./apps/api/src/infrastructure/database/pool');
      billWorker.markBillPaid(process.argv[2],{_id:process.argv[1],financeMode:'student'},
        {},process.argv[3]).then(result=>process.stdout.write(result.expense._id))
        .catch(err=>{console.error(err.message);process.exitCode=1}).finally(()=>billWorkerPool.closePool());`;
    const ids = await Promise.all([
      worker(script, [user._id, bill.id, concurrentKey]),
      worker(script, [user._id, bill.id, concurrentKey]),
    ]);
    assert.equal(ids[0], ids[1]);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM expenses WHERE generated_from=$1', [bill.id])).n, 2);
    assert.equal(new Date((await db.queryOne('SELECT next_run_at FROM expenses WHERE id=$1', [bill.id])).next_run_at)
      .toISOString(), '2027-01-01T00:00:00.000Z');

    const debt = await debts.create(user, { kind: 'BORROWED', personName: 'Test', originalAmount: 100 }, crypto.randomUUID());
    const paymentKey = crypto.randomUUID();
    const paid = await debts.addPayment(debt._id, user, { amount: 30 }, paymentKey);
    const again = await debts.addPayment(debt._id, user, { amount: 30 }, paymentKey);
    assert.equal(paid.payment._id, again.payment._id);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM debt_payments WHERE debt_id=$1', [debt._id])).n, 1);
    const debtKey = crypto.randomUUID();
    const debtScript = `require('./scripts/require-test-database');
      const debtWorker=require('./apps/api/src/modules/debts/debts.service');
      const debtWorkerPool=require('./apps/api/src/infrastructure/database/pool');
      debtWorker.addPayment(process.argv[2],{_id:process.argv[1],financeMode:'student'},
        {amount:30},process.argv[3]).then(result=>process.stdout.write(result.payment._id))
        .catch(err=>{console.error(err.message);process.exitCode=1}).finally(()=>debtWorkerPool.closePool());`;
    const debtIds = await Promise.all([
      worker(debtScript, [user._id, debt._id, debtKey]),
      worker(debtScript, [user._id, debt._id, debtKey]),
    ]);
    assert.equal(debtIds[0], debtIds[1]);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM debt_payments WHERE debt_id=$1', [debt._id])).n, 2);
    assert.equal((await db.queryOne('SELECT paid_amount FROM debts WHERE id=$1', [debt._id])).paid_amount, 60);

    const goal = await goals.create(user._id, { title: 'Test', targetAmount: 100 }, crypto.randomUUID());
    const goalKey = crypto.randomUUID();
    const contribution = await goals.contribute(user, goal._id, 25, '', goalKey);
    const repeat = await goals.contribute(user, goal._id, 25, '', goalKey);
    assert.equal(contribution.goal.savedAmount, repeat.goal.savedAmount);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM goal_contributions WHERE goal_id=$1', [goal._id])).n, 1);
  } finally {
    await db.query('DELETE FROM users WHERE id=$1', [user._id]);
  }
});

test('income, debt, goal and onboarding creates replay their original row', async () => {
  const user = await userFor();
  try {
    const incomeKey = crypto.randomUUID();
    const incomeInput = { amount: 50, source: 'Test', date: '2026-01-01T00:00:00Z' };
    const incomeA = await income.create(user._id, 'student', incomeInput, incomeKey);
    const incomeB = await income.create(user._id, 'student', incomeInput, incomeKey);
    assert.equal(incomeA._id, incomeB._id);

    const debtKey = crypto.randomUUID();
    const debtInput = { kind: 'LENT', personName: 'Test', originalAmount: 60 };
    const debtA = await debts.create(user, debtInput, debtKey);
    const debtB = await debts.create(user, debtInput, debtKey);
    assert.equal(debtA._id, debtB._id);

    const goalKey = crypto.randomUUID();
    const goalInput = { title: 'Saved', targetAmount: 100 };
    const goalA = await goals.create(user._id, goalInput, goalKey);
    const goalB = await goals.create(user._id, goalInput, goalKey);
    assert.equal(goalA._id, goalB._id);

    const onboardingKey = crypto.randomUUID();
    const onboardingInput = { financeMode: 'student', monthlyIncome: 100, goal: { title: 'First', targetAmount: 80 } };
    const first = await users.completeOnboarding(user._id, onboardingInput, onboardingKey);
    const second = await users.completeOnboarding(user._id, onboardingInput, onboardingKey);
    assert.equal(first.goal._id, second.goal._id);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM goals WHERE user_id=$1', [user._id])).n, 2);
    await assert.rejects(users.completeOnboarding(user._id,
      { ...onboardingInput, goal: { title: 'Changed', targetAmount: 80 } }, onboardingKey),
    err => err.statusCode === 409);
  } finally {
    await db.query('DELETE FROM users WHERE id=$1', [user._id]);
  }
});

test('authenticated API requires a request key and returns a deterministic retry response', async () => {
  const user = await userFor();
  process.env.JWT_ACCESS_SECRET ||= 'disposable-local-access-test-secret-00000';
  process.env.JWT_REFRESH_SECRET ||= 'disposable-local-refresh-test-secret-0000';
  const { signAccessToken } = require('../../apps/api/src/modules/auth/auth.tokens');
  const app = require('express')();
  app.use(require('express').json());
  require('../../apps/api/src/routes')(app);
  app.use(require('../../apps/api/src/shared/middleware/errorHandler').errorHandler);
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/expenses`;
    const token = signAccessToken(user._id, 0);
    const body = { amount: 12.34, category: categoryIdsFor('expense', 'student')[0],
      date: '2026-01-01T00:00:00.000Z' };
    const send = (payload, key) => fetch(url, { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
      ...(key ? { 'Idempotency-Key': key } : {}),
    }, body: JSON.stringify(payload) });
    assert.equal((await send(body)).status, 400);
    assert.equal((await send(body, 'invalid')).status, 400);
    const key = crypto.randomUUID();
    const first = await send(body, key);
    const firstBody = await first.json();
    const retry = await send(body, key);
    const retryBody = await retry.json();
    assert.equal(first.status, 201);
    assert.equal(retry.status, 201);
    assert.equal(firstBody.data.expense._id, retryBody.data.expense._id);
    assert.equal((await send({ ...body, amount: 99 }, key)).status, 409);
    assert.equal((await db.queryOne('SELECT count(*)::integer AS n FROM expenses WHERE user_id=$1', [user._id])).n, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.query('DELETE FROM users WHERE id=$1', [user._id]);
  }
});

test.after(async () => db.closePool());
