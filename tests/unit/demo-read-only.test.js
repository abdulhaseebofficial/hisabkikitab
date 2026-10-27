const test = require('node:test');
const assert = require('node:assert/strict');
const { applyDemoPolicy } = require('../../apps/api/src/modules/auth/auth.middleware');
const { shouldRunDashboardMaintenance } = require('../../apps/api/src/modules/dashboard/dashboard.service');
const { shouldMaterializeOnRead } = require('../../apps/api/src/modules/expenses/expenses.service');

const request = (method, mode) => ({
  method,
  user: { _id: 'demo', isDemo: true, financeMode: 'student' },
  get: (name) => (name === 'X-Demo-Finance-Mode' ? mode : undefined),
});

test('demo sessions may read every supported finance mode', () => {
  for (const mode of ['student', 'householder', 'shared_living', 'business']) {
    const req = request('GET', mode);
    applyDemoPolicy(req);
    assert.equal(req.user.financeMode, mode);
  }
});

test('demo sessions reject every HTTP mutation method', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.throws(() => applyDemoPolicy(request(method)), (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(error.message, 'Demo Mode is read-only');
      return true;
    });
  }
});

test('the demo mode header cannot select an unsupported scope', () => {
  const req = request('GET', 'admin');
  applyDemoPolicy(req);
  assert.equal(req.user.financeMode, 'student');
});

test('normal users are unaffected by the demo guard', () => {
  const req = request('POST');
  req.user.isDemo = false;
  assert.doesNotThrow(() => applyDemoPolicy(req));
});

test('dashboard GET maintenance never writes for demo identities', () => {
  assert.equal(shouldRunDashboardMaintenance({ isDemo: true }), false);
  assert.equal(shouldRunDashboardMaintenance({ isDemo: false }), true);
});

test('expense-list GET never materializes recurring writes for demo identities', () => {
  assert.equal(shouldMaterializeOnRead({ readOnly: true }), false);
  assert.equal(shouldMaterializeOnRead(), true);
});
