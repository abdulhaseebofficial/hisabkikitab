const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const express = require('express');
require('../../scripts/require-test-database');

process.env.JWT_ACCESS_SECRET ||= crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET ||= crypto.randomBytes(48).toString('hex');

const db = require('../../apps/api/src/infrastructure/database/pool');
const auth = require('../../apps/api/src/modules/auth/auth.service');
const users = require('../../apps/api/src/modules/users/users.service');
const userRepo = require('../../apps/api/src/modules/users/users.repository');
const authRoutes = require('../../apps/api/src/modules/auth/auth.routes');
const { errorHandler } = require('../../apps/api/src/shared/middleware/errorHandler');

const PASSWORD = 'TestPass123!';
const createUser = () => users.createAccount({
  name: 'Revocation Test',
  email: `revocation-${crypto.randomUUID()}@example.test`,
  password: PASSWORD,
});

const withServer = async (run) => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const me = async token => {
    const response = await fetch(`${base}/me`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: response.status, body: await response.json() };
  };
  try { return await run({ base, me }); }
  finally { await new Promise(resolve => server.close(resolve)); }
};

test('current version works; revoked, missing and forged versions fail without affecting another user', async () => {
  const first = await createUser();
  const second = await createUser();
  try {
    await withServer(async ({ me }) => {
      const firstSession = await auth.login(first.email, PASSWORD);
      const secondSession = await auth.login(second.email, PASSWORD);
      assert.equal((await me(firstSession.accessToken)).status, 200);
      assert.equal((await me(secondSession.accessToken)).status, 200);

      await users.revokeAllSessions(first._id);
      const revoked = await me(firstSession.accessToken);
      assert.equal(revoked.status, 401);
      assert.equal(revoked.body.data, undefined);
      assert.equal((await me(secondSession.accessToken)).status, 200);

      const fresh = await auth.login(first.email, PASSWORD);
      assert.equal((await me(fresh.accessToken)).status, 200);
      const claims = { sub: first._id, type: 'access' };
      const signed = extra => jwt.sign({ ...claims, ...extra }, process.env.JWT_ACCESS_SECRET,
        { algorithm: 'HS256', expiresIn: '15m' });
      for (const invalid of [signed({}), signed({ v: '1' }), signed({ v: -1 }), signed({ v: 0 })]) {
        assert.equal((await me(invalid)).status, 401);
      }
      assert.throws(() => require('../../apps/api/src/modules/auth/auth.tokens').signAccessToken(first._id),
        /token version/i);
    });
  } finally {
    await db.query('DELETE FROM users WHERE id IN ($1,$2)', [first._id, second._id]);
  }
});

test('password change and reset reject old access while newly issued access succeeds', async () => {
  const user = await createUser();
  try {
    await withServer(async ({ me }) => {
      const original = await auth.login(user.email, PASSWORD);
      assert.equal((await me(original.accessToken)).status, 200);

      const changed = await auth.changePassword(user._id, PASSWORD, 'ChangedPass123!');
      assert.equal((await me(original.accessToken)).status, 401);
      assert.equal((await me(changed.accessToken)).status, 200);
      await assert.rejects(auth.refresh(original.refreshToken), err => err.statusCode === 401);

      const resetToken = await userRepo.createPasswordResetToken(user._id);
      const reset = await auth.resetPassword(resetToken, 'ResetPass123!');
      assert.equal((await me(changed.accessToken)).status, 401);
      assert.equal((await me(reset.accessToken)).status, 200);
      await assert.rejects(auth.refresh(changed.refreshToken), err => err.statusCode === 401);
    });
  } finally {
    await db.query('DELETE FROM users WHERE id=$1', [user._id]);
  }
});

test('refresh rotation keeps current-version access valid until explicit revoke-all', async () => {
  const user = await createUser();
  try {
    await withServer(async ({ me }) => {
      const initial = await auth.login(user.email, PASSWORD);
      const rotated = await auth.refresh(initial.refreshToken);
      assert.equal((await me(initial.accessToken)).status, 200);
      assert.equal((await me(rotated.accessToken)).status, 200);
      assert.notEqual(rotated.refreshToken, initial.refreshToken);

      await users.revokeAllSessions(user._id);
      assert.equal((await me(initial.accessToken)).status, 401);
      assert.equal((await me(rotated.accessToken)).status, 401);
      await assert.rejects(auth.refresh(rotated.refreshToken), err => err.statusCode === 401);
      const newSession = await auth.login(user.email, PASSWORD);
      assert.equal((await me(newSession.accessToken)).status, 200);
    });
  } finally {
    await db.query('DELETE FROM users WHERE id=$1', [user._id]);
    await db.closePool();
  }
});
