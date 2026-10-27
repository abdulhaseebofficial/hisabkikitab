const { test, expect } = require('@playwright/test');
const { saveScreenshot: capture } = require('./visual-artifacts');

test.describe('Four-Mode Finance Switching, Shared Living, and Duplicate Contacts', () => {
  let currentUserMode = 'student';
  let profileUpdates = [];

  const studentDashboard = {
    monthLabel: 'October 2026',
    totals: {
      income: 30000,
      spent: 8500,
      remaining: 21500,
      spentPercent: 28,
      dailyAverage: 531,
      safeDailySpend: 1343,
      daysLeftInMonth: 16,
      expenseCount: 5,
    },
    categoryBreakdown: [{ category: 'Mess/Food', amount: 6000, percent: 70 }],
    recentExpenses: [{ id: 's-exp-1', amount: 1500, category: 'Mess/Food', description: 'Hostel Dinner', date: '2026-10-18' }],
    trend: [],
    comparison: { previousMonthSpent: 9000, changePercent: -5 },
    budgets: [],
    goals: [],
    debts: { payable: 0, receivable: 0, netBalance: 0, overdue: 0, dueSoon: [] },
    upcomingBills: [],
  };

  const householdDashboard = {
    monthLabel: 'October 2026',
    totals: {
      income: 180000,
      spent: 95000,
      remaining: 85000,
      spentPercent: 52,
      dailyAverage: 5937,
      safeDailySpend: 5312,
      daysLeftInMonth: 16,
      expenseCount: 18,
    },
    categoryBreakdown: [
      { category: 'Groceries', amount: 55000, percent: 58 },
      { category: 'Utilities', amount: 25000, percent: 26 },
    ],
    recentExpenses: [{ id: 'h-exp-1', amount: 25000, category: 'Utilities', description: 'Electricity Bill', date: '2026-10-14' }],
    trend: [],
    comparison: { previousMonthSpent: 92000, changePercent: 3 },
    budgets: [{ category: 'Groceries', limit: 60000, spent: 55000 }],
    goals: [],
    debts: { payable: 0, receivable: 0, netBalance: 0, overdue: 0, dueSoon: [] },
    upcomingBills: [{ id: 'b-1', name: 'Gas Bill', amount: 3500, dueDate: '2026-10-25' }],
  };

  const sharedSpaces = [
    {
      id: 'space-fl-1',
      name: 'Flat 402 Gulberg',
      currency: 'PKR',
      role: 'admin',
      activeMembers: 3,
    },
  ];

  const sharedDashboardData = {
    space: sharedSpaces[0],
    month: '2026-10',
    period: { closed: false, status: 'active' },
    categories: [
      { id: 'cat-1', name: 'Mess Food', stable_key: 'food' },
      { id: 'cat-2', name: 'Utilities', stable_key: 'utilities' },
    ],
    summary: {
      spent: 42000,
      collected: 18000,
      totalPaid: 18000,
      settlementOutstanding: 0,
      activeMembers: 3,
      categories: [],
      totalSpent: 42000,
      foodSpent: 28000,
      billsSpent: 14000,
      myShare: 14000,
      myPaid: 18000,
      netBalance: 4000,
    },
    residents: [
      { id: 'res-1', name: 'Zaid Student', active: true, balance: 4000 },
      { id: 'res-2', name: 'Bilal Flatmate', active: true, balance: -2000 },
      { id: 'res-3', name: 'Usman Flatmate', active: true, balance: -2000 },
    ],
    recentExpenses: [],
  };

  const businessData = {
    id: 'biz-test-1',
    name: 'Al-Rehman Traders',
    category: 'retail',
    currency: 'PKR',
    role: 'owner',
    dashboard: {
      todaySales: 75000,
      monthlySales: 1850000,
      monthlyProfit: 420000,
      lowStockCount: 4,
      cashBalance: 125000,
      receivables: 210000,
      payables: 95000,
      recentSales: [{ id: 'sale-1', invoiceNumber: 'INV-901', customerName: 'Akram Walk-in', total: 6500 }],
    },
  };

  const syntheticContacts = [
    { id: 'cnt-1', displayName: 'Tariq Mahmood', personName: 'Tariq Mahmood', contactInfo: '0300-1111111' },
    { id: 'cnt-2', displayName: 'Tariq Mahmood', personName: 'Tariq Mahmood', contactInfo: '0321-2222222' },
    { id: 'cnt-3', displayName: 'Ali Raza', personName: 'Ali Raza', contactInfo: '' },
    { id: 'cnt-4', displayName: 'Ali Raza', personName: 'Ali Raza', contactInfo: '' },
    { id: 'cnt-5', displayName: 'Sara Ahmed', personName: 'Sara Ahmed', contactInfo: '0333-5555555' },
    { id: 'cnt-6', displayName: 'Sara Ahmed', personName: 'Sara Ahmed', contactInfo: '0333-5555555' },
    { id: 'cnt-7', displayName: 'Usman Farooq', personName: 'Usman Farooq', contactInfo: '0345-7777777' },
  ];

  test.beforeEach(async ({ page }) => {
    currentUserMode = 'student';
    profileUpdates = [];

    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message, err.stack));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('PAGE LOG ERROR:', msg.text());
    });

    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const u = new URL(route.request().url());
      const p = u.pathname;
      const method = route.request().method();

      if (p === '/api/auth/me') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              user: {
                id: 'usr-mode-tester',
                _id: 'usr-mode-tester',
                name: 'Zaid Tester',
                email: 'tester@hisabkikitab.com',
                currency: 'PKR',
                financeMode: currentUserMode,
                isDemo: false,
                onboardingCompleted: true,
              },
            },
          }),
        });
      }

      if (p === '/api/auth/config') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { google: { enabled: false }, passwordReset: { enabled: false } } }),
        });
      }

      if ((p === '/api/profile' || p === '/api/settings/profile') && (method === 'PUT' || method === 'PATCH')) {
        const payload = JSON.parse(route.request().postData() || '{}');
        if (payload.financeMode) {
          currentUserMode = payload.financeMode;
          profileUpdates.push(payload.financeMode);
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              user: {
                id: 'usr-mode-tester',
                _id: 'usr-mode-tester',
                name: 'Zaid Tester',
                email: 'tester@hisabkikitab.com',
                currency: 'PKR',
                financeMode: currentUserMode,
                isDemo: false,
                onboardingCompleted: true,
              },
            },
          }),
        });
      }

      if (p === '/api/profile/categories') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { defaults: ['Food', 'Groceries', 'Utilities', 'Rent'], custom: [], all: ['Food', 'Groceries', 'Utilities', 'Rent'] },
          }),
        });
      }

      if (p === '/api/dashboard/summary' || p === '/api/dashboard') {
        const payload = currentUserMode === 'householder' ? householdDashboard : studentDashboard;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: payload }),
        });
      }

      if (p === '/api/shared-living/spaces') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: sharedSpaces }),
        });
      }

      if (p.includes('/api/shared-living/spaces/') && p.includes('/months/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: sharedDashboardData }),
        });
      }

      if (p === '/api/business') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: businessData.id,
                name: businessData.name,
                category: businessData.category,
                currency: businessData.currency,
                role: businessData.role,
              },
            ],
          }),
        });
      }

      if (p === `/api/business/${businessData.id}`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: businessData.id,
              name: businessData.name,
              category: businessData.category,
              currency: businessData.currency,
              role: businessData.role,
            },
          }),
        });
      }

      if (p === `/api/business/${businessData.id}/dashboard`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: businessData.dashboard }),
        });
      }

      if (p === '/api/debts/contacts') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              items: syntheticContacts,
              total: syntheticContacts.length,
              page: 1,
              hasPrev: false,
              hasNext: false,
            },
          }),
        });
      }

      if (p === '/api/debts/people') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  key: 'cnt-1',
                  contactId: 'cnt-1',
                  name: 'Tariq Mahmood',
                  recordCount: 1,
                  contactInfo: '0300-1111111',
                  netBalance: 5000,
                },
              ],
              pagination: { page: 1, pages: 1, hasPrev: false, hasNext: false },
            },
          }),
        });
      }

      if (p === '/api/debts/summary' || p === '/api/debts') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              summary: { totalLent: 5000, totalBorrowed: 2000, net: 3000 },
              people: [
                {
                  contactId: 'cnt-1',
                  personName: 'Tariq Mahmood',
                  balance: 5000,
                  lent: 5000,
                  borrowed: 0,
                  transactions: [{ id: 'd-1', amount: 5000, kind: 'LENT', transactionDate: '2026-10-10' }],
                },
              ],
            },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });
  });

  async function performModeSwitch(page, targetModeKey) {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Click mode card
    const query = targetModeKey.replace(/_/g, ' ');
    const cardOption = page.locator('div.grid button').filter({ hasText: new RegExp(query, 'i') });
    await expect(cardOption.first()).toBeVisible({ timeout: 5000 });
    await cardOption.first().click();

    // Confirm dialog
    const confirmBtn = page.getByRole('button', { name: /^switch mode$/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    const targetUrl = targetModeKey === 'business' ? /\/business$/ : /\/dashboard$/;
    await expect(page).toHaveURL(targetUrl, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
  }

  test('All 8 Mode Transitions through Settings -> Finance Mode', async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Initial state: Student
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/pocket money|safe daily spend|hostel dinner/i).first()).toBeVisible();
    await capture(page, 'matrix-01-initial-student.png');

    // Transition 1: Individual -> Householder
    await performModeSwitch(page, 'householder');
    expect(currentUserMode).toBe('householder');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/electricity bill|gas bill|groceries/i).first()).toBeVisible();
    await expect(page.getByText(/pocket money/i)).toHaveCount(0);
    // Hard refresh test
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/electricity bill|groceries/i).first()).toBeVisible();
    await capture(page, 'matrix-02-householder-dashboard.png');

    // Transition 2: Householder -> Individual
    await performModeSwitch(page, 'student');
    expect(currentUserMode).toBe('student');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/hostel dinner|pocket money/i).first()).toBeVisible();
    await expect(page.getByText(/electricity bill/i)).toHaveCount(0);
    await capture(page, 'matrix-03-return-to-student.png');

    // Transition 3: Individual -> Shared Living
    await performModeSwitch(page, 'shared_living');
    expect(currentUserMode).toBe('shared_living');
    await expect(page).toHaveURL(/\/dashboard$/);
    // Verify Shared Living landing renders Shared Living navigation items and space select
    await expect(page.locator('aside nav')).toContainText(/manage space|bills|members/i);
    await expect(page.getByText(/pocket money|electricity bill/i)).toHaveCount(0);
    // Hard refresh test
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('aside nav')).toContainText(/manage space|bills|members/i);
    await capture(page, 'matrix-04-shared-living-dashboard.png');

    // Transition 4: Shared Living -> Householder
    await performModeSwitch(page, 'householder');
    expect(currentUserMode).toBe('householder');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/electricity bill|groceries/i).first()).toBeVisible();
    await expect(page.locator('aside nav')).not.toContainText(/manage space/i);
    await capture(page, 'matrix-05-shared-to-householder.png');

    // Transition 5: Householder -> Business
    await performModeSwitch(page, 'business');
    expect(currentUserMode).toBe('business');
    await expect(page).toHaveURL(/\/business$/);
    await expect(page.getByText(/al-rehman traders/i).first()).toBeVisible();
    await expect(page.getByText(/electricity bill|pocket money/i)).toHaveCount(0);
    // Hard refresh test
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/business$/);
    await expect(page.getByText(/al-rehman traders/i).first()).toBeVisible();
    await capture(page, 'matrix-06-business-dashboard.png');

    // Transition 6: Business -> Individual
    await performModeSwitch(page, 'student');
    expect(currentUserMode).toBe('student');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/hostel dinner|pocket money/i).first()).toBeVisible();
    await expect(page.getByText(/al-rehman traders/i)).toHaveCount(0);
    await capture(page, 'matrix-07-business-to-student.png');

    // Transition 7: Business -> Shared Living (first switch to business then to shared living)
    await performModeSwitch(page, 'business');
    expect(currentUserMode).toBe('business');
    await performModeSwitch(page, 'shared_living');
    expect(currentUserMode).toBe('shared_living');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('aside nav')).toContainText(/manage space|bills|members/i);
    await expect(page.getByText(/al-rehman traders/i)).toHaveCount(0);
    await capture(page, 'matrix-08-business-to-shared.png');

    // Transition 8: Business -> Householder (first switch to business then to householder)
    await performModeSwitch(page, 'business');
    expect(currentUserMode).toBe('business');
    await performModeSwitch(page, 'householder');
    expect(currentUserMode).toBe('householder');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/electricity bill|groceries/i).first()).toBeVisible();
    await expect(page.getByText(/al-rehman traders/i)).toHaveCount(0);
    await capture(page, 'matrix-09-business-to-householder.png');
  });

  test('Duplicate Contact Selector in Debts Form', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/debts');
    await page.waitForLoadState('networkidle');

    // Assert debts list does not display '· Ref'
    const accordionHeader = page.locator('button').filter({ hasText: /tariq mahmood/i }).first();
    await expect(accordionHeader).toBeVisible();
    const headerText = await accordionHeader.innerText();
    expect(headerText).not.toContain('Ref');
    expect(headerText).not.toContain('· Ref');

    // Open Add Debt modal
    await page.getByRole('button', { name: /add record/i }).first().click();
    await page.waitForLoadState('networkidle');

    // Inspect Contact Select dropdown options
    const selectOptions = await page.locator('select option').allInnerTexts();

    // Verify no option contains '· Ref' or UUID fragments
    for (const opt of selectOptions) {
      expect(opt).not.toMatch(/Ref\s+[a-f0-9]{6}/i);
    }

    // 1. Identical names, different phones
    expect(selectOptions).toContain('Tariq Mahmood (0300-1111111)');
    expect(selectOptions).toContain('Tariq Mahmood (0321-2222222)');

    // 2. Identical names, no phones
    expect(selectOptions).toContain('Ali Raza (Person 1)');
    expect(selectOptions).toContain('Ali Raza (Person 2)');

    // 3. Identical names, identical phones
    expect(selectOptions).toContain('Sara Ahmed (0333-5555555) (Person 1)');
    expect(selectOptions).toContain('Sara Ahmed (0333-5555555) (Person 2)');

    // 4. Distinct name
    expect(selectOptions).toContain('Usman Farooq (0345-7777777)');

    // Select distinct options and verify internal value is correct ID
    const selectEl = page.locator('select').first();
    await selectEl.selectOption({ label: 'Tariq Mahmood (0300-1111111)' });
    expect(await selectEl.inputValue()).toBe('cnt-1');

    await selectEl.selectOption({ label: 'Ali Raza (Person 2)' });
    expect(await selectEl.inputValue()).toBe('cnt-4');

    await selectEl.selectOption({ label: 'Sara Ahmed (0333-5555555) (Person 1)' });
    expect(await selectEl.inputValue()).toBe('cnt-5');

    await capture(page, 'debts-clean-contact-picker.png');
  });

  test('Responsive Visual QA across 1024px, 1280px, 1366px, 1440px, 1920px and Mobile Viewports', async ({ page }) => {
    test.setTimeout(180000);
    const viewports = [
      { name: '1024px-tablet-desktop', width: 1024, height: 768 },
      { name: '1280px-desktop-standard', width: 1280, height: 800 },
      { name: '1366px-laptop-common', width: 1366, height: 768 },
      { name: '1440px-desktop-wide', width: 1440, height: 900 },
      { name: '1920px-desktop-fullhd', width: 1920, height: 1080 },
      { name: '768px-tablet-portrait', width: 768, height: 1024 },
      { name: '390px-mobile-iphone', width: 390, height: 844 },
      { name: '320px-mobile-narrow', width: 320, height: 568 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Verify header has NO segmented toggle
      const segmentedControl = page.locator('.hw-mode-segment');
      await expect(segmentedControl).toHaveCount(0);

      // Verify sidebar text alignment: check that sidebar items exist on desktop viewports
      if (vp.width >= 1024) {
        const sidebarLinks = page.locator('aside nav a');
        await expect(sidebarLinks.first()).toBeVisible();
      }

      await capture(page, `viewport-${vp.name}.png`);
    }
  });
});
