const test = require('node:test');
const assert = require('node:assert/strict');
require('../../scripts/require-test-database');
const { closePool } = require('../../apps/api/src/infrastructure/database/pool');
const expensesRepo = require('../../apps/api/src/modules/expenses/expenses.repository');

test('recurring scheduler rejects unauthenticated calls and runs on a disposable database', async () => {
  const oldSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'disposable-local-scheduler-test-secret';
  process.env.JWT_ACCESS_SECRET ||= 'disposable-local-access-test-secret-00000';
  process.env.JWT_REFRESH_SECRET ||= 'disposable-local-refresh-test-secret-0000';
  const app = require('../../apps/api/src/app')();
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/internal/recurring`;
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: { authorization: 'Bearer incorrect' } })).status, 401);
    delete process.env.CRON_SECRET;
    assert.equal((await fetch(base)).status, 503);
    process.env.CRON_SECRET = 'disposable-local-scheduler-test-secret';
    const valid = await fetch(base, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).success, true);
    const retry = await fetch(base, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json().then(({ success, created }) => ({ success, created })),
      { success: true, created: 0 });
    const originalUserIdsWithDue = expensesRepo.userIdsWithDue;
    try {
      expensesRepo.userIdsWithDue = async () => { throw new Error('injected sweep failure'); };
      const failed = await fetch(base, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
      assert.equal(failed.status, 500);
      assert.equal((await failed.json()).success, false);
    } finally {
      expensesRepo.userIdsWithDue = originalUserIdsWithDue;
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (oldSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = oldSecret;
    await closePool();
  }
});
