const test = require('node:test');
const assert = require('node:assert/strict');
const repo = require('../../apps/api/src/modules/users/users.repository');
const service = require('../../apps/api/src/modules/users/users.service');

test('account deletion distinguishes no owner, eligible successor and no successor', async () => {
  const originals = {
    findById: repo.findById,
    comparePassword: repo.comparePassword,
    removeAccountSafely: repo.removeAccountSafely,
  };
  const removed = [];
  try {
    repo.findById = async (id) => ({ _id: id, password: id === 'google' ? null : 'hash' });
    repo.comparePassword = async (candidate) => candidate === 'correct';
    repo.removeAccountSafely = async (id) => {
      if (id === 'eligible-owner') return { deleted: false, hasSuccessor: true };
      if (id === 'lone-owner') return { deleted: false, hasSuccessor: false };
      removed.push(id);
      return { deleted: true, hasSuccessor: false };
    };
    for (const role of ['regular', 'viewer', 'admin']) await service.deleteAccount(role, 'correct');
    assert.deepEqual(removed, ['regular', 'viewer', 'admin']);
    await assert.rejects(service.deleteAccount('eligible-owner', 'correct'),
      (err) => err.statusCode === 409 && err.message === 'shared.ownerTransferBeforeDelete');
    await assert.rejects(service.deleteAccount('lone-owner', 'correct'),
      (err) => err.statusCode === 409 && err.message === 'shared.ownerNoSuccessorDelete');
    await assert.rejects(service.deleteAccount('google', 'correct'),
      (err) => err.statusCode === 400 && /Set a password/.test(err.message));
    assert.equal(removed.length, 3);
  } finally {
    Object.assign(repo, originals);
  }
});
