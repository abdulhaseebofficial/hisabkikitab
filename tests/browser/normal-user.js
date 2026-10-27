const { randomUUID } = require('node:crypto');

const PASSWORD = 'TestPass123!';

async function createNormalUser(page, label) {
  const email = `${label}-${randomUUID()}@example.test`;
  const response = await page.request.post('/api/auth/register', {
    data: {
      acceptTerms: true,
      name: 'Browser Test User',
      email,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    },
  });
  if (response.status() !== 201) {
    throw new Error(`Could not create normal browser-test user: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  const token = body.data.accessToken;
  const onboarding = await page.request.post('/api/profile/onboarding', {
    data: {
      financeMode: 'student',
      language: 'en',
      monthlyIncome: 0,
      currency: 'PKR',
    },
    headers: {
      authorization: `Bearer ${token}`,
      'Idempotency-Key': randomUUID(),
    },
  });
  if (onboarding.status() !== 200) {
    throw new Error(`Could not onboard normal browser-test user: ${onboarding.status()} ${await onboarding.text()}`);
  }
  return { email, password: PASSWORD, token };
}

async function deleteNormalUser(page, account) {
  if (!account || page.isClosed()) return;
  const response = await page.request.delete('/api/profile', {
    data: { password: account.password },
    headers: { authorization: `Bearer ${account.token}` },
  });
  if (response.status() !== 200 && response.status() !== 401) {
    throw new Error(`Could not delete browser-test user: ${response.status()} ${await response.text()}`);
  }
}

async function dismissAnalyticsConsent(page) {
  const reject = page.getByRole('button', { name: 'Reject analytics' });
  if (await reject.isVisible()) await reject.click();
}

module.exports = { createNormalUser, deleteNormalUser, dismissAnalyticsConsent };
