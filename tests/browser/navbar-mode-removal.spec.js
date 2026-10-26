const { test, expect } = require('@playwright/test');

const user = {
  _id: 'nav-ui-test-user', name: 'Test User', email: 'user@example.test',
  financeMode: 'householder', currency: 'PKR', language: 'en',
  onboardingCompleted: true, isDemo: false,
};
const dashboard = {
  monthLabel: 'October 2026',
  totals: { income: 100000, plannedIncome: 100000, incomeLogged: 100000, spent: 40000, remaining: 60000,
    spentPercent: 40, dailyAverage: 1300, safeDailySpend: 2000, daysLeftInMonth: 12, expenseCount: 0 },
  categoryBreakdown: [], trend: [], comparison: { previousMonthSpent: 0, changePercent: 0 },
  budgets: [], goals: [], recentExpenses: [], upcomingBills: [],
  debts: { payable: 0, receivable: 0, netBalance: 0, overdue: 0, dueSoon: [] },
};

for (const width of [390, 768, 1440]) {
  test(`header and profile menu have no Business switch at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => localStorage.setItem('hkk-theme', 'light'));
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path === '/api/auth/me') data = { user };
      else if (path === '/api/dashboard/summary') data = dashboard;
      else if (path === '/api/profile/categories') data = { defaults: [], custom: [], all: [] };
      else if (path === '/api/notifications') data = { items: [], unreadCount: 0 };
      else if (path === '/api/business') data = [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });

    await page.goto('/dashboard');
    const header = page.locator('header');
    await expect(header.locator('a[href="/dashboard"]')).toHaveCount(1);
    await expect(header.getByRole('button', { name: /^personal$/i })).toHaveCount(0);
    await expect(header.getByRole('button', { name: /^business$/i })).toHaveCount(0);
    await expect(header.getByRole('button', { name: /notifications/i })).toBeVisible();
    if (width >= 380) await expect(header.getByRole('button', { name: /switch to dark theme/i })).toBeVisible();
    else await expect(header.getByRole('button', { name: /switch to dark theme/i, includeHidden: true })).toBeHidden();
    await header.getByRole('button', { name: /^TU/ }).click();
    await expect(header.getByText(user.email)).toBeVisible();
    await expect(header.getByText('Household Mode')).toHaveCount(0);
    await expect(header.getByText('Switch to Business Mode')).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Profile and settings' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Send feedback' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Log out' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
