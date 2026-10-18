const { test, expect } = require('@playwright/test');

const summary = {
  monthLabel: 'October 2026',
  totals: { income: 100000, plannedIncome: 100000, incomeLogged: 100000,
    spent: 40000, remaining: 60000, spentPercent: 40, dailyAverage: 1300,
    safeDailySpend: 2000, daysLeftInMonth: 12, expenseCount: 18 },
  categoryBreakdown: [], trend: [],
  comparison: { previousMonthSpent: 30000, changePercent: 33 },
  budgets: [], goals: [], recentExpenses: [], upcomingBills: [],
  debts: { payable: 0, receivable: 0, netBalance: 0, overdue: 0, dueSoon: [] },
};

for (const mode of ['student', 'householder']) {
  test(`${mode} dashboard keeps its primary action and cards at mobile and desktop widths`, async ({ page }) => {
    await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
      const pathname = new URL(route.request().url()).pathname;
      let data = {};
      if (pathname === '/api/auth/me') data = { user: { _id: 'visual-owner',
        name: 'Test Owner', email: 'test@example.test', financeMode: mode,
        onboardingCompleted: true, currency: 'PKR', language: 'en' } };
      else if (pathname === '/api/dashboard/summary') data = summary;
      else if (pathname === '/api/profile/categories') data = { all: [], custom: [] };
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data }) });
    });

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { name: 'Hey Test' })).toBeVisible();
      await expect(page.getByText(mode === 'student' ? 'Money left this month' : 'Left for the household')).toBeVisible();
      const headerAction = page.locator('#main-content button[title="Shortcut: press N"]');
      if (width < 640) await expect(headerAction).toBeHidden();
      else await expect(headerAction).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
