const test = require('node:test');
const assert = require('node:assert/strict');
const repo = require('../../apps/api/src/modules/expenses/expenses.repository');
const recurring = require('../../apps/api/src/infrastructure/scheduling/recurringExpenses.job');
const expenses = require('../../apps/api/src/modules/expenses/expenses.service');
const requests = require('../../apps/api/src/shared/finance/idempotency');

test('monthly recurrence clamps month ends without losing UTC time', () => {
  const cases = [
    ['2025-01-28T23:30:00.000Z', '2025-02-28T23:30:00.000Z'],
    ['2025-01-29T23:30:00.000Z', '2025-02-28T23:30:00.000Z'],
    ['2025-01-30T23:30:00.000Z', '2025-02-28T23:30:00.000Z'],
    ['2025-01-31T23:30:00.000Z', '2025-02-28T23:30:00.000Z'],
    ['2024-01-31T23:30:00.000Z', '2024-02-29T23:30:00.000Z'],
    ['2024-02-29T23:30:00.000Z', '2024-03-29T23:30:00.000Z'],
    ['2025-12-31T23:30:00.000Z', '2026-01-31T23:30:00.000Z'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(recurring.advance(new Date(input), 'monthly').toISOString(), expected);
  }
  assert.equal(recurring.advance(new Date('2025-03-08T23:30:00Z'), 'daily').toISOString(),
    '2025-03-09T23:30:00.000Z');
});

test('recurring clones keep the locked template mode and advance atomically', async () => {
  const originals = {
    findDue: repo.findDue,
    withLockedDueTemplate: repo.withLockedDueTemplate,
    createMany: repo.createMany,
    setNextRunAt: repo.setNextRunAt,
  };
  const modes = ['student', 'householder'];
  try {
    for (const financeMode of modes) {
      const template = {
        _id: 'template', userId: 'owner', financeMode, amount: 120,
        category: 'Rent', description: '', paymentMethod: 'Cash',
        recurringFrequency: 'monthly', nextRunAt: '2026-01-31T00:00:00.000Z',
      };
      const tx = { query: async () => [] };
      let clones;
      let pointer;
      repo.findDue = async () => [template];
      repo.withLockedDueTemplate = async (_id, _userId, _now, callback) => callback(template, tx);
      repo.createMany = async (rows, usedTx) => {
        assert.equal(usedTx, tx);
        clones = rows;
        return rows.length;
      };
      repo.setNextRunAt = async (_id, next, usedTx) => {
        assert.equal(usedTx, tx);
        pointer = next;
      };
      const count = await recurring.materializeForUser('owner', new Date('2026-02-01T00:00:00Z'));
      assert.equal(count, 1);
      assert.equal(clones.length, 1);
      assert.equal(clones[0].financeMode, financeMode);
      assert.equal(clones[0].generatedFrom, template._id);
      assert.equal(pointer.toISOString(), '2026-02-28T00:00:00.000Z');
    }
  } finally {
    Object.assign(repo, originals);
  }
});

test('manual bill payment sends the insert and pointer update through the locked transaction', async () => {
  const originals = {
    withLockedBillTemplate: repo.withLockedBillTemplate,
    create: repo.create,
    setNextRunAt: repo.setNextRunAt,
    run: requests.run,
  };
  const tx = { query: async () => [] };
  const template = {
    _id: 'bill', financeMode: 'student', isRecurring: true, amount: 25,
    category: 'Test', description: '', paymentMethod: 'Cash',
    nextRunAt: '2026-01-31T00:00:00Z', recurringFrequency: 'monthly',
  };
  try {
    repo.withLockedBillTemplate = async (_id, _userId, _mode, callback) => callback(template, tx);
    repo.create = async (_userId, data, usedTx) => {
      assert.equal(usedTx, tx);
      return { _id: 'payment', amount: data.amount };
    };
    repo.setNextRunAt = async (_id, _next, usedTx) => {
      assert.equal(usedTx, tx);
    };
    requests.run = async (_user, _action, _key, _body, perform) => ({ value: await perform(tx), replayed: false });
    const result = await expenses.markBillPaid('bill', { _id: 'owner', financeMode: 'student' }, {}, 'test-key');
    assert.equal(result.expense.amount, 25);
    assert.equal(result.nextDueAt.toISOString(), '2026-02-28T00:00:00.000Z');
  } finally {
    repo.withLockedBillTemplate = originals.withLockedBillTemplate;
    repo.create = originals.create;
    repo.setNextRunAt = originals.setNextRunAt;
    requests.run = originals.run;
  }
});
