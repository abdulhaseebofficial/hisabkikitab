const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function load(relative, env, overrides = {}) {
  const filename = path.resolve(__dirname, '../../apps/api/src', relative);
  const localRequire = createRequire(filename);
  const logs = [];
  const context = {
    module: { exports: {} }, process: { env },
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : localRequire(name),
    console: Object.fromEntries(['log', 'warn', 'error'].map((level) => [level, (...args) => logs.push(args.join(' '))])),
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return { api: context.module.exports, logs };
}

test('missing SMTP reports non-delivery without logging reset tokens in any environment', async () => {
  for (const NODE_ENV of ['development', 'test', 'production']) {
    const { api, logs } = load('infrastructure/email/mailer.js', { NODE_ENV });
    const result = await api.sendMail({ to: 'test@example.test', subject: 'reset', text: 'sensitive-reset-token' });
    assert.equal(result.delivered, false);
    assert.equal(api.isConfigured(), false);
    assert.ok(!logs.join('\n').includes('sensitive-reset-token'));
  }
});

test('SMTP failure never reports delivery success', async () => {
  const { api } = load('infrastructure/email/mailer.js', { SMTP_HOST: 'smtp.example.test', SMTP_USER: 'test', SMTP_PASS: 'fixture' }, {
    nodemailer: { createTransport: () => ({ sendMail: async () => { throw new Error('SMTP sensitive-credential'); } }) },
  });
  await assert.rejects(api.sendMail({ to: 'test@example.test', subject: 'test', text: 'test' }), (error) => {
    assert.equal(error.message, 'Email delivery failed');
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('Google verification errors cannot expose the submitted token in logged reasons', async () => {
  const token = 'sensitive-id-token';
  const { api } = load('infrastructure/auth/google.js', { GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com' }, {
    'google-auth-library': { OAuth2Client: class {
      async verifyIdToken() { throw new Error(`Invalid token: ${token}`); }
    } },
  });
  const result = await api.verify(token);
  assert.equal(result.ok, false);
  assert.ok(!result.reason.includes(token));
});

test('AI provider errors return honest fallback without logging provider error secrets', async () => {
  const provider = {
    isConfigured: () => true,
    complete: async () => { throw new Error('provider-secret-in-error'); },
  };
  const { api, logs } = load('modules/advisor/advisor.ai.js', {}, { '../../infrastructure/ai': provider });
  const result = await api.dailyTip({
    user: { currency: 'PKR', financeMode: 'student', monthlyIncome: 28000 },
    snapshot: { breakdown: [], remaining: 0, daysLeftInMonth: 12 },
  });
  assert.equal(result.aiPowered, false);
  assert.equal(result.reason, 'api_error');
  assert.equal(typeof result.tip, 'string');
  assert.ok(!logs.join('\n').includes('provider-secret-in-error'));
});
