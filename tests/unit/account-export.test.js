const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../apps/api/src/modules/users/users.service');
const expenses = require('../../apps/api/src/modules/expenses/expenses.service');
const income = require('../../apps/api/src/modules/income/income.service');
const budgets = require('../../apps/api/src/modules/budgets/budgets.service');
const debts = require('../../apps/api/src/modules/debts/debts.service');
const goals = require('../../apps/api/src/modules/goals/goals.service');
const advisor = require('../../apps/api/src/modules/advisor/advisor.service');
const shared = require('../../apps/api/src/modules/users/sharedLivingExport.repository');

test('complete account export includes authorized Shared Living ledger section', async () => {
  const targets = [
    [expenses, 'listAllForUser'], [income, 'listAllForUser'],
    [budgets, 'listAllForUser'], [debts, 'listAllForExport'],
    [goals, 'listAllForUser'], [advisor, 'exportChat'], [shared, 'forUser'],
  ];
  const originals = targets.map(([object, key]) => object[key]);
  try {
    targets.forEach(([object, key]) => { object[key] = async () => []; });
    const sharedRecords = {
      spaces: [{ _id: 'space-1' }], memberships: [{ spaceId: 'space-1' }],
      members: [], periods: [], categories: [], expenses: [{ amountMinor: 500 }],
      bills: [], shares: [], payments: [], activity: [],
    };
    shared.forUser = async (id) => {
      assert.equal(id, 'owner');
      return sharedRecords;
    };
    const exportData = await service.exportEverything({ _id: 'owner', language: 'en' });
    assert.equal(exportData.scope, 'complete-account');
    assert.deepEqual(exportData.shared.sharedLiving, sharedRecords);
  } finally {
    targets.forEach(([object, key], index) => { object[key] = originals[index]; });
  }
});
