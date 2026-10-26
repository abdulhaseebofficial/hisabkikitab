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
  const anchor = new Date('2025-01-31T23:30:00Z');
  const february = recurring.advance(anchor, 'monthly');
  const march = recurring.advance(february, 'monthly', anchor);
  assert.equal(march.toISOString(), '2025-03-31T23:30:00.000Z');
  assert.equal(recurring.advance(march, 'monthly', anchor).toISOString(), '2025-04-30T23:30:00.000Z');
  assert.equal(recurring.nextRunAfter(anchor, 'monthly', new Date('2025-03-01T00:00:00Z')).toISOString(),
    '2025-03-31T23:30:00.000Z');
});

test('the monthly anchor is only trusted when it fits the schedule it is advancing', () => {
  const anchor = new Date('2025-01-31T00:00:00Z');
  // A full year from a 31st: short months clamp, then the 31st comes back.
  const chain = [];
  let pointer = anchor;
  for (let i = 0; i < 12; i += 1) {
    pointer = recurring.advance(pointer, 'monthly', anchor);
    chain.push(pointer.toISOString().slice(0, 10));
  }
  assert.deepEqual(chain, [
    '2025-02-28', '2025-03-31', '2025-04-30', '2025-05-31', '2025-06-30', '2025-07-31',
    '2025-08-31', '2025-09-30', '2025-10-31', '2025-11-30', '2025-12-31', '2026-01-31',
  ]);

  // Leap and non-leap February, from the 29th and the 30th.
  assert.equal(recurring.advance(new Date('2024-01-29T00:00:00Z'), 'monthly',
    new Date('2024-01-29T00:00:00Z')).toISOString().slice(0, 10), '2024-02-29');
  assert.equal(recurring.advance(new Date('2024-02-29T00:00:00Z'), 'monthly',
    new Date('2023-12-29T00:00:00Z')).toISOString().slice(0, 10), '2024-03-29');
  assert.equal(recurring.advance(new Date('2025-02-28T00:00:00Z'), 'monthly',
    new Date('2025-01-30T00:00:00Z')).toISOString().slice(0, 10), '2025-03-30');

  // A 30-day anchor never invents a 31st.
  assert.equal(recurring.advance(new Date('2025-04-30T00:00:00Z'), 'monthly',
    new Date('2025-04-30T00:00:00Z')).toISOString().slice(0, 10), '2025-05-30');

  // An anchor that cannot belong to this schedule is ignored in favour of the
  // pointer's own day, so a live bill is never relocated to another day of the
  // month - which would also change the generated date the idempotency index
  // deduplicates on.
  assert.equal(recurring.advance(new Date('2026-01-31T00:00:00Z'), 'monthly',
    new Date('2026-01-01T00:00:00Z')).toISOString().slice(0, 10), '2026-02-28');
  assert.equal(recurring.advance(new Date('2026-11-01T00:00:00Z'), 'monthly',
    new Date('2026-10-25T00:00:00Z')).toISOString().slice(0, 10), '2026-12-01');
  assert.equal(recurring.advance(new Date('2026-11-01T00:00:00Z'), 'monthly',
    new Date('not a date')).toISOString().slice(0, 10), '2026-12-01');

  // Daily and weekly never consult the anchor.
  assert.equal(recurring.advance(new Date('2024-02-28T00:00:00Z'), 'daily',
    new Date('2020-01-15T00:00:00Z')).toISOString().slice(0, 10), '2024-02-29');
  assert.equal(recurring.advance(new Date('2025-12-29T00:00:00Z'), 'weekly',
    new Date('2020-01-15T00:00:00Z')).toISOString().slice(0, 10), '2026-01-05');
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
        date: '2026-01-31T00:00:00.000Z',
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

test('monthly catch-up restores the original day after February in each finance mode', async () => {
  const originals = {
    findDue: repo.findDue, withLockedDueTemplate: repo.withLockedDueTemplate,
    createMany: repo.createMany, setNextRunAt: repo.setNextRunAt,
  };
  try {
    for (const financeMode of ['student', 'householder']) {
      const template = {
        _id: 'bill', userId: 'owner', financeMode, amount: 1, amountMinor: '100',
        category: 'Rent', description: '', paymentMethod: 'Cash',
        date: '2025-01-31T00:00:00Z', nextRunAt: '2025-02-28T00:00:00Z',
        recurringFrequency: 'monthly',
      };
      let clones;
      let pointer;
      repo.findDue = async () => [template];
      repo.withLockedDueTemplate = async (_id, _userId, _now, fn) => fn(template, {});
      repo.createMany = async (rows) => { clones = rows; return rows.length; };
      repo.setNextRunAt = async (_id, next) => { pointer = next; };
      assert.equal(await recurring.materializeForUser('owner', new Date('2025-03-31T00:00:00Z')), 2);
      assert.deepEqual(clones.map((row) => row.date.toISOString()), [
        '2025-02-28T00:00:00.000Z', '2025-03-31T00:00:00.000Z',
      ]);
      assert(clones.every((row) => row.financeMode === financeMode));
      assert.equal(pointer.toISOString(), '2025-04-30T00:00:00.000Z');
    }
  } finally { Object.assign(repo, originals); }
});

test('recurring edits reschedule only when the date or frequency changes', async () => {
  const originals = { findById: repo.findById, update: repo.update };
  const user = { _id: 'owner', financeMode: 'householder' };
  const existing = {
    isRecurring: true, date: '2099-01-31T00:00:00Z',
    nextRunAt: '2099-03-31T00:00:00Z', recurringFrequency: 'monthly',
  };
  let patch;
  try {
    repo.findById = async (_id, mode, owner) => {
      assert.equal(mode, 'householder');
      assert.equal(owner, 'owner');
      return existing;
    };
    repo.update = async (_id, mode, owner, update) => {
      assert.equal(mode, 'householder');
      assert.equal(owner, 'owner');
      patch = update;
      return { ...existing, ...update };
    };
    await expenses.update('bill', user, { amount: 10, date: existing.date });
    assert.equal(patch.nextRunAt, undefined);
    await expenses.update('bill', user, { date: '2099-03-15T00:00:00Z' });
    assert.equal(patch.nextRunAt.toISOString(), '2099-04-15T00:00:00.000Z');
    await expenses.update('bill', user, { recurringFrequency: 'weekly' });
    assert.equal(patch.nextRunAt.toISOString(), '2099-02-07T00:00:00.000Z');
    await expenses.update('bill', user, { isRecurring: false });
    assert.equal(patch.nextRunAt, null);
  } finally { Object.assign(repo, originals); }
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
    date: '2026-01-31T00:00:00Z',
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
