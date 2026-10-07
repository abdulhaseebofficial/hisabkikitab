const test = require('node:test');
const assert = require('node:assert/strict');

const mailer = require('../../apps/api/src/infrastructure/email/mailer');
const auth = require('../../apps/api/src/modules/auth/auth.service');

test('password recovery does not claim delivery when SMTP is missing', async () => {
  const names = ['NODE_ENV', 'ALLOW_DEV_RESET_LINK', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_DEV_RESET_LINK;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    assert.equal(mailer.isConfigured(), false);
    assert.deepEqual(await auth.forgotPassword('someone@example.com'), { deliveryAvailable: false });

    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'sender@example.com';
    assert.equal(mailer.isConfigured(), false, 'an SMTP password is required before recovery is advertised');
    process.env.SMTP_PASS = 'test-password';
    assert.equal(mailer.isConfigured(), true);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
